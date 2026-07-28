"""EPG import script: Xtream-first, XMLTV fallback for foreign channels.

Usage:
  docker compose exec fastapi python /app/scripts/import_epg_xmltv.py

Strategy:
  1. Fetch all live channels from Xtream API.
  2. For each channel, check if Xtream already has EPG (get_short_epg, limit=1).
  3. If Xtream has EPG → skip.
  4. If Xtream has NO EPG → try XMLTV from iptv-org/epg.
  5. Match channel name → XMLTV source, download XML, parse, import.
"""
import asyncio
import json
import logging
import os
import re
import sys
import time

import httpx

# Add app to path for standalone script execution
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.channel_matcher import normalize, match_best
from app.core.epg_importer import parse_xmltv, import_programs
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("epg_import")

IPTV_EPG_BASE = "https://raw.githubusercontent.com/iptv-org/epg/master/sites"
IPTV_SITES_INDEX = "https://api.github.com/repos/iptv-org/epg/contents/sites"

# Countries to look up XMLTV sources for (mapped to common site prefixes)
COUNTRY_SITE_PREFIXES = [
    "hu",    # Hungary
    "de",    # Germany
    "at",    # Austria
    "ch",    # Switzerland
    "fr",    # France
    "it",    # Italy
    "es",    # Spain
    "uk", "gb",  # United Kingdom
    "ro",    # Romania
    "cz",    # Czech
    "sk",    # Slovakia
    "pl",    # Poland
    "nl",    # Netherlands
    "be",    # Belgium
    "pt",    # Portugal
    "se",    # Sweden
    "no",    # Norway
    "dk",    # Denmark
    "fi",    # Finland
    "gr",    # Greece
    "tr",    # Turkey
    "rs", "hr", "si", "bg",  # Balkan
]

API_TIMEOUT = 30.0


async def fetch_json(client: httpx.AsyncClient, url: str) -> list[dict]:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return []


async def fetch_text(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return ""


def extract_channel_names_from_xml(xml_text: str) -> list[str]:
    """Extract display names from XMLTV to build channel→source mapping."""
    names: list[str] = []
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_text)
        for ch in root.findall("channel"):
            for dn in ch.findall("display-name"):
                if dn.text:
                    names.append(dn.text.strip())
    except Exception:
        pass
    return names


async def build_site_index(client: httpx.AsyncClient) -> dict[str, str]:
    """Build a site_id→download_url map from iptv-org/epg flat file structure."""
    site_map: dict[str, str] = {}
    logger.info("Building XMLTV site index from iptv-org/epg...")

    # Try local file first
    import json as _json
    cache_file = "/tmp/epg_site_cache.json"
    try:
        if os.path.exists(cache_file):
            with open(cache_file) as f:
                site_map = _json.load(f)
            if site_map:
                logger.info("Loaded %d sites from cache", len(site_map))
                return site_map
    except Exception:
        pass

    # Fetch sites/ directory listing (flat — all .channels.xml files)
    repo_files = await fetch_json(client, f"{IPTV_SITES_INDEX}?ref=master")
    for item in (repo_files or []):
        name = (item.get("name", "") or "").lower()
        if item.get("type") != "file":
            continue
        if not name.endswith(".channels.xml"):
            continue
        # Check if filename matches any of our target country prefixes
        prefix_match = any(
            name.startswith(p + ".") or name.startswith(p + "-") or f"-{p}." in name or f".{p}." in name
            for p in COUNTRY_SITE_PREFIXES
        )
        if not prefix_match:
            continue
        download_url = item.get("download_url", "")
        # Use filename without .channels.xml as site_id
        site_id = name.replace(".channels.xml", "")
        if download_url and site_id:
            site_map[site_id] = download_url

    # Cache locally
    try:
        with open(cache_file, "w") as f:
            _json.dump(site_map, f)
    except Exception:
        pass

    logger.info("Built index: %d sites", len(site_map))
    return site_map


async def main():
    logger.info("=== EPG Import: Xtream check + XMLTV fallback ===")
    start_time = time.time()

    if not settings.XTREAM_USERNAME or not settings.XTREAM_PASSWORD:
        logger.error("XTREAM_USERNAME/XTREAM_PASSWORD not set — cannot fetch live streams.")
        return

    channels_xtream: list[dict] = []
    channels_xmltv: list[dict] = []
    imported = 0

    async with httpx.AsyncClient(verify=False) as client:
        # 1. Get all live channels from Xtream
        logger.info("Fetching live channels from Xtream...")
        try:
            streams, cat_by_id = await _fetch_live_streams(client)
            logger.info("Got %d live streams", len(streams) if isinstance(streams, list) else 0)
        except Exception as e:
            logger.error("Failed to fetch live streams: %s", e)
            return

        if not isinstance(streams, list):
            logger.error("Unexpected streams response type: %s", type(streams))
            return

        # 2. Check each channel for Xtream EPG coverage
        logger.info("Checking Xtream EPG coverage for %d channels...", len(streams))
        needs_xmltv: list[tuple[str, int, str]] = []  # (name, stream_id, group)

        for i, s in enumerate(streams):
            if not isinstance(s, dict):
                continue
            stream_id = s.get("stream_id", 0)
            name = s.get("name", "Unknown")
            if not stream_id:
                continue

            # Check if Xtream has EPG
            has_epg = await _check_xtream_epg(client, stream_id)
            if has_epg:
                channels_xtream.append({"name": name, "stream_id": stream_id})
            else:
                group = cat_by_id.get(int(s.get("category_id", 0)), s.get("category_name", ""))
                needs_xmltv.append((name, stream_id, group))

        logger.info(
            "Xtream EPG: %d channels | Needs XMLTV: %d channels",
            len(channels_xtream), len(needs_xmltv),
        )

        if not needs_xmltv:
            logger.info("All channels have Xtream EPG — nothing to import.")
            elapsed = time.time() - start_time
            logger.info("=== Done in %.1fs ===", elapsed)
            return

        # 3. Build XMLTV site index
        site_map = await build_site_index(client)
        if not site_map:
            logger.error("No XMLTV sites found — aborting.")
            return

        # 4. For each channel needing EPG, try matching XMLTV sources
        logger.info("Matching %d channels to XMLTV sources...", len(needs_xmltv))

        # Track which sites we've already downloaded
        site_display_names: dict[str, list[str]] = {}  # site_id → display names

        for name, stream_id, group in needs_xmltv:
            norm_ch = normalize(name)
            best_site_id = ""
            best_site_url = ""

            for site_id, site_url in site_map.items():
                norm_site = normalize(site_id)
                # Quick pre-filter: site name should share some characters with channel name
                if not any(c in norm_site for c in norm_ch[:4]):
                    continue

                # Fetch display names for this site (if not already cached)
                if site_id not in site_display_names:
                    xml_text = await fetch_text(client, site_url)
                    if xml_text:
                        site_display_names[site_id] = extract_channel_names_from_xml(xml_text)
                    else:
                        site_display_names[site_id] = []
                    # Rate limit
                    await asyncio.sleep(0.2)

                display_names = site_display_names.get(site_id, [])
                if not display_names:
                    continue

                result = match_best(display_names, name)
                if result and result[1] > 0.5:
                    best_site_id = site_id
                    best_site_url = site_url
                    break

            if not best_site_url:
                continue

            # 5. Download full XMLTV for this site
            logger.info(
                "  %s → %s (score=%.2f)",
                name, best_site_id, result[1] if result else 0,
            )
            xml_text = await fetch_text(client, best_site_url)
            if not xml_text:
                continue

            await asyncio.sleep(0.3)

            # Parse + import
            programs = parse_xmltv(xml_text)
            if not programs:
                continue

            inserted = await import_programs(stream_id, name, programs, best_site_id)
            imported += inserted
            channels_xmltv.append({"name": name, "stream_id": stream_id, "site": best_site_id})
            logger.info("    → %d programs imported", inserted)

    elapsed = time.time() - start_time
    logger.info("=== EPG Import Complete ===")
    logger.info("Channels with Xtream EPG: %d", len(channels_xtream))
    logger.info("Channels with XMLTV EPG: %d", len(channels_xmltv))
    logger.info("Total programs imported:  %d", imported)
    logger.info("Elapsed: %.1f seconds", elapsed)


async def _fetch_live_streams(client: httpx.AsyncClient) -> tuple[list, dict]:
    url = f"{settings.XTREAM_API_BASE}/player_api.php?username={settings.XTREAM_USERNAME}&password={settings.XTREAM_PASSWORD}&action=get_live_streams"
    resp = await client.get(url, timeout=API_TIMEOUT)
    resp.raise_for_status()
    streams = resp.json()

    # Also fetch categories
    cat_url = f"{settings.XTREAM_API_BASE}/player_api.php?username={settings.XTREAM_USERNAME}&password={settings.XTREAM_PASSWORD}&action=get_live_categories"
    cat_resp = await client.get(cat_url, timeout=API_TIMEOUT)
    cat_resp.raise_for_status()
    cats = cat_resp.json()
    cat_by_id = {}
    for c in (cats if isinstance(cats, list) else []):
        cat_by_id[int(c.get("category_id", 0))] = c.get("category_name", "")
    return streams, cat_by_id


async def _check_xtream_epg(client: httpx.AsyncClient, stream_id: int) -> bool:
    url = f"{settings.XTREAM_API_BASE}/player_api.php?username={settings.XTREAM_USERNAME}&password={settings.XTREAM_PASSWORD}&action=get_short_epg&stream_id={stream_id}&limit=1"
    try:
        resp = await client.get(url, timeout=10.0)
        if not resp.ok:
            return False
        data = resp.json()
        if isinstance(data, dict):
            listings = data.get("epg_listings") or data.get("EPG_Listings")
            return isinstance(listings, list) and len(listings) > 0
        return isinstance(data, list) and len(data) > 0
    except Exception:
        return False


if __name__ == "__main__":
    asyncio.run(main())

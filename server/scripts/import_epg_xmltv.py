"""EPG import script: per-user Redis session scan, Xtream-first, XMLTV fallback.

Usage:
  docker compose exec fastapi python /app/scripts/import_epg_xmltv.py

Strategy:
  1. Scan Redis "session:*" keys for active user credentials.
  2. Dedup by (username, password) pair.
  3. For each unique credential pair:
     a. Fetch live channels from Xtream API.
     b. For each channel, check if Xtream already has EPG.
     c. If Xtream has EPG → skip.
     d. If Xtream has NO EPG → try XMLTV from iptv-org/epg.
     e. Match channel → XMLTV source, download, parse, import programs + logos.
"""
import asyncio
import json
import logging
import os
import re
import sys
import time

import httpx
import redis.asyncio as aioredis

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.channel_matcher import normalize, match_best
from app.core.epg_importer import parse_xmltv, import_programs
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("epg_import")

IPTV_SITES_INDEX = "https://api.github.com/repos/iptv-org/epg/contents/sites"

COUNTRY_SITE_PREFIXES = [
    "hu", "de", "at", "ch", "fr", "it", "es", "uk", "gb",
    "ro", "cz", "sk", "pl", "nl", "be", "pt",
    "se", "no", "dk", "fi", "gr", "tr", "rs", "hr", "si", "bg",
]

# Country name → ISO code for Xtream category matching
_COUNTRY_NAME_TO_CODE: dict[str, str] = {
    "hungary": "hu", "magyar": "hu", "magyarország": "hu",
    "germany": "de", "deutschland": "de", "német": "de",
    "austria": "at", "österreich": "at", "osztrák": "at",
    "switzerland": "ch", "schweiz": "ch", "suisse": "ch", "svájc": "ch",
    "france": "fr", "francia": "fr",
    "italy": "it", "italia": "it", "olasz": "it",
    "spain": "es", "españa": "es", "spanyol": "es",
    "united kingdom": "gb", "uk": "gb", "great britain": "gb", "britain": "gb",
    "england": "gb", "angol": "gb",
    "romania": "ro", "románia": "ro", "román": "ro",
    "czech": "cz", "czechia": "cz", "cseh": "cz",
    "slovakia": "sk", "szlovák": "sk",
    "poland": "pl", "lengyel": "pl",
    "netherlands": "nl", "holland": "nl",
    "belgium": "be", "belga": "be",
    "portugal": "pt", "portugál": "pt",
    "sweden": "se", "svéd": "se",
    "norway": "no", "norvég": "no",
    "denmark": "dk", "dán": "dk",
    "finland": "fi", "finn": "fi",
    "greece": "gr", "görög": "gr",
    "turkey": "tr", "török": "tr",
    "serbia": "rs", "szerb": "rs",
    "croatia": "hr", "horvát": "hr",
    "slovenia": "si", "szlovén": "si",
    "bulgaria": "bg", "bolgár": "bg",
    "albania": "al", "albán": "al",
    "ireland": "ie", "ír": "ie",
    "usa": "us", "america": "us", "amerikai": "us",
    "canada": "ca", "kanada": "ca",
    "australia": "au", "ausztrál": "au",
    "russia": "ru", "orosz": "ru",
    "brasil": "br", "brazil": "br",
}

API_TIMEOUT = 30.0


def _gh_headers() -> dict[str, str]:
    """Headers for GitHub API requests with optional token."""
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


async def fetch_json(client: httpx.AsyncClient, url: str) -> list[dict]:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT, headers=_gh_headers() if "github.com" in url else None)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return []


async def fetch_text(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT, headers=_gh_headers() if "github.com" in url else None)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return ""


def extract_channel_icons_from_xml(xml_text: str) -> dict[str, str]:
    """Extract channel_id→icon_url from XMLTV <channel> elements."""
    icons: dict[str, str] = {}
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_text)
        for ch in root.findall("channel"):
            ch_id = ch.get("id", "")
            for icon_elem in ch.findall("icon"):
                src = icon_elem.get("src", "")
                if src and ch_id:
                    icons[ch_id] = src
                    break
    except Exception:
        pass
    return icons


def extract_channel_names_from_xml(xml_text: str) -> list[str]:
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


def _guess_country_code(channel_name: str, group: str, cat_name: str) -> str:
    """Guess country ISO code from channel metadata. Returns 'hu' as fallback."""
    # 1. Check category name
    cat_lower = (cat_name or "").lower()
    for key, code in _COUNTRY_NAME_TO_CODE.items():
        if key in cat_lower:
            return code
    # 2. Check group name
    group_lower = (group or "").lower()
    for key, code in _COUNTRY_NAME_TO_CODE.items():
        if key in group_lower:
            return code
    # 3. Default
    return "hu"


async def build_site_index(client: httpx.AsyncClient) -> dict[str, str]:
    site_map: dict[str, str] = {}
    logger.info("Building XMLTV site index from iptv-org/epg...")

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

    # Fetch sites/ directory listing (directories, not files!)
    site_dirs = await fetch_json(client, f"{IPTV_SITES_INDEX}?ref=master")
    matching_dirs = []

    for item in (site_dirs or []):
        if item.get("type") != "dir":
            continue
        dir_name = (item.get("name", "") or "").lower()
        dir_url = item.get("url", "")
        if not dir_name or not dir_url:
            continue
        if any(
            dir_name.startswith(p + ".") or dir_name.startswith(p + "-")
            or f"-{p}." in dir_name or f".{p}." in dir_name
            or dir_name == p or dir_name.endswith("." + p)
            for p in COUNTRY_SITE_PREFIXES
        ):
            matching_dirs.append((dir_name, dir_url))

    logger.info("Matched %d site directories (of %d total)", len(matching_dirs), len(site_dirs or []))

    # Step 2: For each directory, fetch its files + .channels.xml
    for dir_name, dir_url in matching_dirs:
        clean_url = dir_url.split("?")[0]
        files = await fetch_json(client, f"{clean_url}?ref=master")
        if not files:
            continue
        for f in files:
            fname = (f.get("name", "") or "").lower()
            if fname.endswith(".channels.xml"):
                download_url = f.get("download_url", "")
                if download_url:
                    site_map[dir_name] = download_url
                    break
        await asyncio.sleep(0.1)

    try:
        with open(cache_file, "w") as f:
            _json.dump(site_map, f)
    except Exception:
        pass

    logger.info("Built index: %d sites", len(site_map))
    return site_map


async def import_logos(stream_id: int, icons: dict[str, str], site_id: str):
    """Store channel logo URLs from XMLTV icons."""
    if not icons:
        return
    from app.database import async_session_factory
    async with async_session_factory() as sess:
        for xml_ch_id, logo_url in icons.items():
            if not logo_url:
                continue
            try:
                stmt = """
                    INSERT INTO channel_logos (stream_id, logo_url, source)
                    VALUES (:sid, :url, :src)
                    ON CONFLICT (stream_id) DO UPDATE SET logo_url = EXCLUDED.logo_url
                """
                from sqlalchemy import text
                await sess.execute(text(stmt), {"sid": stream_id, "url": logo_url, "src": f"xmltv:{site_id}"})
                await sess.commit()
                break  # one logo per channel
            except Exception:
                await sess.rollback()
                break


async def _fetch_live_streams(client: httpx.AsyncClient, username: str, password: str) -> tuple[list, dict]:
    url = f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_live_streams"
    resp = await client.get(url, timeout=API_TIMEOUT)
    resp.raise_for_status()
    streams = resp.json()
    cat_url = f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_live_categories"
    cat_resp = await client.get(cat_url, timeout=API_TIMEOUT)
    cat_resp.raise_for_status()
    cats = cat_resp.json()
    cat_by_id = {}
    for c in (cats if isinstance(cats, list) else []):
        cat_by_id[int(c.get("category_id", 0))] = c.get("category_name", "")
    return streams, cat_by_id


async def _check_xtream_epg(client: httpx.AsyncClient, username: str, password: str, stream_id: int) -> bool:
    url = f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_short_epg&stream_id={stream_id}&limit=1"
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


async def process_user(client: httpx.AsyncClient, site_map: dict[str, str], username: str, password: str, user_label: str) -> dict:
    """Process EPG + logo import for a single user's channels."""
    result = {"xtream": 0, "xmltv": 0, "imported": 0, "logos": 0}
    logger.info("[%s] Fetching live channels...", user_label)
    try:
        streams, cat_by_id = await _fetch_live_streams(client, username, password)
    except Exception as e:
        logger.error("[%s] Failed: %s", user_label, e)
        return result

    if not isinstance(streams, list):
        return result

    site_icons_cache: dict[str, dict[str, str]] = {}  # site_id→{xml_ch→icon_url}
    needs_xmltv: list[tuple[str, int, str]] = []

    for s in streams:
        if not isinstance(s, dict):
            continue
        stream_id = s.get("stream_id", 0)
        name = s.get("name", "Unknown")
        if not stream_id:
            continue
        has_epg = await _check_xtream_epg(client, username, password, stream_id)
        if has_epg:
            result["xtream"] += 1
        else:
            group = cat_by_id.get(int(s.get("category_id", 0) or 0), s.get("category_name", ""))
            needs_xmltv.append((name, stream_id, group))

    logger.info("[%s] Xtream EPG: %d | Needs XMLTV: %d", user_label, result["xtream"], len(needs_xmltv))

    if not needs_xmltv:
        return result

    for name, stream_id, group in needs_xmltv:
        norm_ch = normalize(name)
        country_code = _guess_country_code(name, "", group)
        best_site_id = ""
        best_site_url = ""

        for site_id, site_url in site_map.items():
            norm_site = normalize(site_id)
            # Quick pre-filter: site domain must end with guessed country TLD
            if not site_id.endswith("." + country_code):
                if not any(c in norm_site for c in norm_ch[:4]):
                    continue

            if site_id in site_icons_cache:
                continue

            result_match = None
            xml_text = await fetch_text(client, site_url)
            if xml_text:
                site_icons_cache[site_id] = extract_channel_icons_from_xml(xml_text)
                display_names = extract_channel_names_from_xml(xml_text)
                if display_names:
                    result_match = match_best(display_names, name)
                    if result_match and result_match[1] > 0.5:
                        best_site_id = site_id
                        best_site_url = site_url
                await asyncio.sleep(0.2)

            if not best_site_url:
                continue

        if not best_site_url:
            continue

        logger.info("  %s → %s (score=%.2f)", name, best_site_id, result_match[1])
        xml_text = await fetch_text(client, best_site_url)
        if not xml_text:
            continue
        await asyncio.sleep(0.3)

        # Import programs
        programs = parse_xmltv(xml_text)
        if programs:
            inserted = await import_programs(stream_id, name, programs, best_site_id)
            result["imported"] += inserted
            result["xmltv"] += 1

        # Import logo
        icons = site_icons_cache.get(best_site_id, {})
        if icons:
            await import_logos(stream_id, icons, best_site_id)
            result["logos"] += 1

    return result


async def main():
    logger.info("=== EPG Import: per-user Redis session scan + XMLTV fallback ===")
    start_time = time.time()

    # 1. Scan Redis for active sessions
    try:
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        session_keys = await redis.keys("session:*")
        await redis.aclose()
    except Exception as e:
        logger.error("Redis scan failed: %s", e)
        return

    if not session_keys:
        logger.warning("No active sessions found — nothing to import.")
        return

    # 2. Dedup credentials
    seen_creds: set[tuple[str, str]] = set()
    cred_list: list[tuple[str, str]] = []

    try:
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        for key in session_keys:
            try:
                data = await redis.get(key)
                if not data:
                    continue
                session = json.loads(data)
                u = session.get("xtream_user", "")
                p = session.get("xtream_pass", "")
                if u and p and (u, p) not in seen_creds:
                    seen_creds.add((u, p))
                    cred_list.append((u, p))
            except Exception:
                continue
        await redis.aclose()
    except Exception as e:
        logger.error("Redis credential scan failed: %s", e)
        return

    logger.info("Found %d active sessions → %d unique credentials", len(session_keys), len(cred_list))

    # 3. Build XMLTV site index (shared across users)
    async with httpx.AsyncClient(verify=False) as client:
        site_map = await build_site_index(client)
        if not site_map:
            logger.error("No XMLTV sites found — aborting.")
            return

        total = {"xtream": 0, "xmltv": 0, "imported": 0, "logos": 0}

        for i, (username, password) in enumerate(cred_list):
            label = f"User {i + 1}/{len(cred_list)}"
            logger.info("--- %s ---", label)
            res = await process_user(client, site_map, username, password, label)
            for k in total:
                total[k] += res[k]
            # Rate limit between users
            if i < len(cred_list) - 1:
                await asyncio.sleep(1)

    elapsed = time.time() - start_time
    logger.info("=== EPG Import Complete ===")
    logger.info("Users processed:    %d", len(cred_list))
    logger.info("Xtream EPG covers:  %d", total["xtream"])
    logger.info("XMLTV EPG added:    %d", total["xmltv"])
    logger.info("Programs imported:  %d", total["imported"])
    logger.info("Logos imported:     %d", total["logos"])
    logger.info("Elapsed: %.1f seconds", elapsed)


if __name__ == "__main__":
    asyncio.run(main())

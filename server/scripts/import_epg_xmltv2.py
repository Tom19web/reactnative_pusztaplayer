"""
EPG import script v2: Category-based, Xtream-first, XMLTV fallback.

Strategy:
  1. Scan Redis "session:*" keys via MGET for active user credentials.
  2. Dedup by (username, password) pair.
  3. For each unique credential pair:
     a. Fetch live categories → skip Hungarian (HUNGARY, HUN, MAGYAR).
     b. Map remaining categories to ISO country codes.
     c. Per category: fetch streams → filter epg_channel_id==null.
     d. Phase 1: Match channels against iptv-org channels.xml → import logos.
     e. Phase 2: Match channels against open-epg.com guide.xml → import EPG + logos.

Usage:
  docker compose exec fastapi python /app/scripts/import_epg_xmltv2.py
"""
import asyncio
import json
import logging
import os
import re
import sys
import time
from datetime import datetime

import httpx
import redis.asyncio as aioredis
from sqlalchemy.dialects.postgresql import insert as pg_insert

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.channel_matcher import match_best
from app.core.epg_importer import parse_xmltv, import_programs
from app.config import settings
from app.database import async_session_factory
from app.models.models import ChannelLogoModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("epg_import_v2")

IPTV_SITES_INDEX = "https://api.github.com/repos/iptv-org/epg/contents/sites"
API_TIMEOUT = 30.0

# ISO country codes used to filter iptv-org site directories
COUNTRY_SITE_PREFIXES = [
    "hu", "de", "at", "ch", "fr", "it", "es", "uk", "gb",
    "ro", "cz", "sk", "pl", "nl", "be", "pt",
    "se", "no", "dk", "fi", "gr", "tr", "rs", "hr", "si", "bg",
    "al", "ie", "us", "ca", "au", "ru", "br",
]

# Category name → ISO country code (used to map Xtream category names → country)
_CATEGORY_TO_COUNTRY: dict[str, str] = {
    "austria": "at", "österreich": "at", "osztrák": "at",
    "belgium": "be", "belga": "be",
    "bulgaria": "bg", "bolgár": "bg",
    "switzerland": "ch", "schweiz": "ch", "suisse": "ch", "svájc": "ch",
    "czech": "cz", "czechia": "cz", "cseh": "cz",
    "germany": "de", "deutschland": "de", "német": "de", "german": "de",
    "denmark": "dk", "dán": "dk",
    "spain": "es", "españa": "es", "spanyol": "es",
    "france": "fr", "francia": "fr", "french": "fr",
    "united kingdom": "gb", "uk": "gb", "great britain": "gb", "britain": "gb", "england": "gb", "angol": "gb",
    "greece": "gr", "görög": "gr",
    "croatia": "hr", "horvát": "hr",
    "ireland": "ie", "ír": "ie",
    "italy": "it", "italia": "it", "olasz": "it", "italian": "it",
    "netherlands": "nl", "holland": "nl",
    "norway": "no", "norvég": "no",
    "poland": "pl", "lengyel": "pl", "polish": "pl",
    "portugal": "pt", "portugál": "pt",
    "romania": "ro", "románia": "ro", "román": "ro",
    "serbia": "rs", "szerb": "rs",
    "sweden": "se", "svéd": "se",
    "slovenia": "si", "szlovén": "si",
    "slovakia": "sk", "szlovák": "sk",
    "turkey": "tr", "török": "tr", "turkish": "tr",
    "usa": "us", "america": "us", "amerikai": "us",
    "canada": "ca", "kanada": "ca",
    "australia": "au", "ausztrál": "au",
    "russia": "ru", "orosz": "ru", "russian": "ru",
    "brasil": "br", "brazil": "br",
    "albania": "al", "albán": "al",
    "finland": "fi", "finn": "fi",
}

_EPG_SOURCES: dict[str, list[str]] = {
    "at": [
        "https://www.open-epg.com/files/austria.xml",
        "https://www.free-epg.de/api/epg/at.xml.gz",
    ],
    "de": [
        "https://www.open-epg.com/files/germany.xml",
        "https://www.free-epg.de/api/epg/de.xml.gz",
    ],
    "ch": [
        "https://www.open-epg.com/files/switzerland2.xml",
        "https://www.open-epg.com/files/switzerland3.xml",
        "https://www.open-epg.com/files/switzerland4.xml",
        "https://www.free-epg.de/api/epg/ch.xml.gz",
    ],
    "fr": ["https://www.open-epg.com/files/france.xml"],
    "it": ["https://www.open-epg.com/files/italy.xml"],
    "es": ["https://www.open-epg.com/files/spain.xml"],
    "gb": ["https://www.open-epg.com/files/unitedkingdom.xml"],
    "ro": ["https://www.open-epg.com/files/romania.xml"],
    "cz": ["https://www.open-epg.com/files/czechrepublic.xml"],
    "sk": ["https://www.open-epg.com/files/slovakia.xml"],
    "pl": ["https://www.open-epg.com/files/poland.xml"],
    "nl": ["https://www.open-epg.com/files/netherlands.xml"],
    "be": ["https://www.open-epg.com/files/belgium.xml"],
    "pt": ["https://www.open-epg.com/files/portugal.xml"],
    "se": ["https://www.open-epg.com/files/sweden.xml"],
    "no": ["https://www.open-epg.com/files/norway.xml"],
    "dk": ["https://www.open-epg.com/files/denmark.xml"],
    "fi": ["https://www.open-epg.com/files/finland.xml"],
    "gr": ["https://www.open-epg.com/files/greece.xml"],
    "tr": ["https://www.open-epg.com/files/turkey.xml"],
    "rs": ["https://www.open-epg.com/files/serbia.xml"],
    "hr": ["https://www.open-epg.com/files/croatia.xml"],
    "si": ["https://www.open-epg.com/files/slovenia.xml"],
    "bg": ["https://www.open-epg.com/files/bulgaria.xml"],
    "al": ["https://www.open-epg.com/files/albania.xml"],
    "ie": ["https://www.open-epg.com/files/ireland.xml"],
    "us": ["https://www.open-epg.com/files/usa.xml"],
    "ca": ["https://www.open-epg.com/files/canada.xml"],
    "au": ["https://www.open-epg.com/files/australia.xml"],
    "ru": ["https://www.open-epg.com/files/russia.xml"],
    "br": ["https://www.open-epg.com/files/brazil.xml"],
}


def _is_hungarian(cat_name: str) -> bool:
    low = (cat_name or "").lower()
    return any(w in low for w in ["hungary", "hun ", "hungarian", "magyar", " hun", "[hu]"])


def _guess_country(cat_name: str) -> str | None:
    low = (cat_name or "").lower()
    for name, code in _CATEGORY_TO_COUNTRY.items():
        if name in low:
            return code
    return None


_STRIP_PREFIXES = [
    "at", "de", "ch", "fr", "it", "es", "uk", "gb",
    "ro", "cz", "sk", "pl", "nl", "be", "pt",
    "se", "no", "dk", "fi", "gr", "tr", "rs", "hr", "si", "bg",
    "al", "ie", "us", "ca", "au", "ru", "br",
    "swiss",
]

_COUNTRY_PREFIX_RE = re.compile(
    r'^(?:(' + '|'.join(_STRIP_PREFIXES) + r')[:|\s\-]+)+',
    re.IGNORECASE,
)


def clean_stream_name(name: str) -> str:
    cleaned = _COUNTRY_PREFIX_RE.sub('', name)
    cleaned = re.sub(r'^[:\s\-]+', '', cleaned)
    return cleaned.strip()


def _gh_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


async def fetch_json(client: httpx.AsyncClient, url: str) -> list[dict]:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT, follow_redirects=True, headers=_gh_headers() if "github.com" in url else None)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return []


async def fetch_text(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT, follow_redirects=True, headers=_gh_headers() if "github.com" in url else None)
        resp.raise_for_status()
        content = resp.content
        if content and len(content) >= 2 and content[:2] == b'\x1f\x8b':
            import gzip
            return gzip.decompress(content).decode('utf-8', errors='replace')
        return resp.text
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return ""


def extract_channel_map_from_xml(xml_text: str) -> tuple[list[str], dict[str, str]]:
    display_names: list[str] = []
    xmltv_by_name: dict[str, str] = {}
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_text)
        for ch in root.iter("channel"):
            text = (ch.text or "").strip()
            xmltv_id = ch.get("xmltv_id", "")
            if text:
                display_names.append(text)
                if xmltv_id:
                    xmltv_by_name[text] = xmltv_id
    except Exception:
        pass
    return display_names, xmltv_by_name


async def import_logos_batch(logo_data: list[dict]):
    if not logo_data:
        return
    deduped: dict[int, dict] = {}
    for entry in logo_data:
        deduped[entry["stream_id"]] = entry
    unique = list(deduped.values())
    async with async_session_factory() as sess:
        try:
            stmt = pg_insert(ChannelLogoModel).values(unique)
            stmt = stmt.on_conflict_do_update(
                index_elements=['stream_id'],
                set_={'logo_url': stmt.excluded.logo_url, 'source': stmt.excluded.source}
            )
            await sess.execute(stmt)
            await sess.commit()
            logger.info("  Batch inserted/updated %d logos.", len(unique))
        except Exception as e:
            await sess.rollback()
            logger.error("  Logo batch insert failed: %s", e)


async def download_and_cache_logos(logo_data: list[dict]):
    os.makedirs("/app/static/logos", exist_ok=True)
    count = 0
    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        for entry in logo_data:
            logo_url = entry.get("logo_url", "")
            stream_id = entry.get("stream_id", 0)
            if not logo_url or "nologo" in logo_url.lower():
                continue
            try:
                resp = await client.get(logo_url)
                if resp.status_code == 200 and resp.content:
                    filepath = f"/app/static/logos/{stream_id}.png"
                    with open(filepath, "wb") as f:
                        f.write(resp.content)
                    count += 1
                    entry["logo_url"] = f"https://{settings.SERVER_DOMAIN}/logos/{stream_id}.png"
            except Exception:
                pass

    if count:
        async with async_session_factory() as sess:
            try:
                from sqlalchemy import text
                for entry in logo_data:
                    await sess.execute(
                        text("UPDATE channel_logos SET logo_url = :url WHERE stream_id = :sid"),
                        {"url": entry.get("logo_url", ""), "sid": entry["stream_id"]},
                    )
                await sess.commit()
                logger.info("  Downloaded + cached %d logo images locally.", count)
            except Exception as e:
                await sess.rollback()
                logger.warning("  Logo cache download partially failed: %s", e)


_CHANNEL_MATCH_CACHE_FILE = "/tmp/channel_match_cache.json"


def _load_channel_match_cache() -> dict[str, str]:
    try:
        if os.path.exists(_CHANNEL_MATCH_CACHE_FILE):
            with open(_CHANNEL_MATCH_CACHE_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_channel_match_cache(cache: dict[str, str]):
    try:
        with open(_CHANNEL_MATCH_CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except Exception:
        pass


async def ai_match_channels(unmatched_names: list[str], xmltv_names: list[str]) -> dict[str, str]:
    if not settings.DEEPSEEK_API_KEY:
        return {}

    cache = _load_channel_match_cache()
    matches: dict[str, str] = {}
    needs_ai: list[str] = []

    for name in unmatched_names:
        norm = name.lower().strip()
        if norm in cache:
            matches[name] = cache[norm]
        else:
            needs_ai.append(name)

    if not needs_ai:
        return matches

    try:
        system = (
            "You are a TV channel name matcher. Given an Xtream channel name and a list of XMLTV display names, "
            "find the best match. Match by content type (e.g. 'RTL' matches 'RTL.at' or 'RTL HD'), "
            "ignore quality suffixes like HD/FHD/SD, resolve HTML entities (&#246;=ö). "
            "Return ONLY JSON: {\"matches\": {\"xtream_name\": \"xmltv_display_name\"}}. "
            "If no plausible match, omit that name."
        )
        user = json.dumps({"unmatched": needs_ai, "xmltv_names": xmltv_names[:300]})
        result = await _call_deepseek(system, user)
        ai_matches = result.get("matches", {}) if isinstance(result, dict) else {}

        for orig_name, xml_name in ai_matches.items():
            if xml_name and xml_name in xmltv_names:
                cache[orig_name.lower().strip()] = xml_name
                matches[orig_name] = xml_name

        _save_channel_match_cache(cache)
        if ai_matches:
            logger.info("      AI matched %d channels.", len(ai_matches))
    except Exception as e:
        logger.warning("      AI channel match error: %s", e)

    return matches


async def _call_deepseek(system_prompt: str, user_prompt: str) -> dict:
    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as c:
            resp = await c.post(
                getattr(settings, 'DEEPSEEK_BASE_URL', 'https://api.deepseek.com') + "/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": getattr(settings, 'DEEPSEEK_MODEL', 'deepseek-chat'),
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 4096,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                logger.warning("DeepSeek JSON truncated, attempting repair...")
                repaired = content.rstrip()
                last_complete = repaired.rfind(',\n  "')
                if last_complete > 0:
                    repaired = repaired[:last_complete] + '\n}}'
                else:
                    repaired = repaired.rstrip(',\n ') + '\n}}'
                try:
                    return json.loads(repaired)
                except json.JSONDecodeError as e2:
                    logger.warning("DeepSeek JSON repair failed: %s", e2)
                    return {}
    except Exception as e:
        logger.warning("DeepSeek API call failed: %s", e)
        return {}


async def build_site_index(client: httpx.AsyncClient) -> dict[str, str]:
    site_map: dict[str, str] = {}
    logger.info("Building XMLTV site index from iptv-org/epg...")

    cache_file = "/tmp/epg_site_cache.json"
    try:
        if os.path.exists(cache_file):
            with open(cache_file) as f:
                site_map = json.load(f)
            if site_map:
                logger.info("Loaded %d sites from cache.", len(site_map))
                return site_map
    except Exception:
        pass

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

    logger.info("Matched %d site directories (of %d total).", len(matching_dirs), len(site_dirs or []))

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
        await asyncio.sleep(0.05)

    try:
        with open(cache_file, "w") as f:
            json.dump(site_map, f)
    except Exception:
        pass

    logger.info("Built index: %d sites.", len(site_map))
    return site_map


def build_epg_index() -> dict[str, list[str]]:
    """EPG source index — open-epg.com + free-epg.de URLs by country."""
    count = sum(len(v) for v in _EPG_SOURCES.values())
    logger.info("EPG index: %d countries, %d sources.", len(_EPG_SOURCES), count)
    return _EPG_SOURCES


def _filter_sites_by_country(site_map: dict[str, str], country: str) -> dict[str, str]:
    return {
        sid: url for sid, url in site_map.items()
        if sid.startswith(country + ".") or sid.startswith(country + "-")
        or f"-{country}." in sid or f".{country}." in sid
        or sid == country or sid.endswith("." + country)
    }


async def _fetch_categories(client: httpx.AsyncClient, username: str, password: str) -> list[dict]:
    url = f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_live_categories"
    resp = await client.get(url, timeout=API_TIMEOUT)
    resp.raise_for_status()
    return resp.json() if isinstance(resp.json(), list) else []


async def _fetch_streams_by_category(
    client: httpx.AsyncClient, username: str, password: str, category_id: int
) -> list[dict]:
    url = (
        f"{settings.XTREAM_API_BASE}/player_api.php"
        f"?username={username}&password={password}&action=get_live_streams&category_id={category_id}"
    )
    resp = await client.get(url, timeout=API_TIMEOUT)
    resp.raise_for_status()
    return resp.json() if isinstance(resp.json(), list) else []


def extract_xmltv_channels(xml_text: str) -> tuple[list[dict], dict[str, str]]:
    channels: list[dict] = []
    icons: dict[str, str] = {}
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_text)
        for ch in root.findall("channel"):
            ch_id = ch.get("id", "")
            icon_src = ""
            icon_elem = ch.find("icon")
            if icon_elem is not None:
                icon_src = icon_elem.get("src", "")
            for dn in ch.findall("display-name"):
                if dn.text:
                    name = dn.text.strip()
                    channels.append({"id": ch_id, "name": name})
                    if icon_src:
                        icons[name] = icon_src
    except Exception:
        pass
    return channels, icons


async def process_user(client: httpx.AsyncClient, site_map: dict[str, str], openepg_index: dict[str, list[str]], username: str, password: str) -> dict:
    result = {"categories": 0, "channels": 0, "needs_epg": 0, "logos": 0, "imported": 0}

    categories = await _fetch_categories(client, username, password)
    if not categories:
        logger.warning("No categories returned.")
        return result

    targets: list[tuple[int, str, str]] = []
    for cat in categories:
        cat_id = int(cat.get("category_id", 0))
        cat_name = cat.get("category_name", "")
        if not cat_id or _is_hungarian(cat_name):
            continue
        country = _guess_country(cat_name)
        if country:
            targets.append((cat_id, cat_name, country))

    if not targets:
        logger.info("No non-Hungarian, country-mapped categories found.")
        return result

    result["categories"] = len(targets)
    logger.info("Found %d target categories.", len(targets))

    # Fetch all streams for all categories first to collect all stream IDs
    all_missing: dict[int, list[tuple[str, int]]] = {}
    all_logo_ids: list[int] = []
    for cat_id, cat_name, country in targets:
        try:
            streams = await _fetch_streams_by_category(client, username, password, cat_id)
        except Exception as e:
            logger.warning("Failed to fetch streams for category %s: %s", cat_name, e)
            continue
        if not isinstance(streams, list):
            continue
        missing_epg = [(s.get("name", ""), s.get("stream_id", 0)) for s in streams
                       if s.get("stream_id") and not s.get("epg_channel_id") and s.get("name")]
        if missing_epg:
            all_missing[cat_id] = missing_epg
            all_logo_ids.extend(sid for _, sid in missing_epg)

    # Single DB query: which stream_ids already have logos?
    existing_logos: set[int] = set()
    new_logo_ids: set[int] = set()
    if all_logo_ids:
        async with async_session_factory() as sess:
            from sqlalchemy import select
            logo_result = await sess.execute(
                select(ChannelLogoModel.stream_id).where(ChannelLogoModel.stream_id.in_(list(set(all_logo_ids))))
            )
            existing_logos = set(logo_result.scalars().all())
        if existing_logos:
            logger.info("%d channels already have logos in DB.", len(existing_logos))

    logo_batch = []

    for cat_id, cat_name, country in targets:
        if cat_id not in all_missing:
            continue

        missing_epg = all_missing[cat_id]
        result["needs_epg"] += len(missing_epg)
        logger.info("  Category '%s' (%s): %d need EPG.", cat_name, country, len(missing_epg))

        # Logo check: track which channels still need logos
        logo_needed = [(n, sid) for n, sid in missing_epg if sid not in existing_logos and sid not in new_logo_ids]
        if existing_logos:
            already = len(missing_epg) - len(logo_needed)
            if already:
                logger.info("    %d logos already in DB, %d need fetch.", already, len(logo_needed))

        # Phase 1: iptv-org logo import (runs first)
        if logo_needed:
            country_sites = _filter_sites_by_country(site_map, country)
            logger.info("    Country sites for '%s': %d", country, len(country_sites))
            if country_sites:
                remaining = list(logo_needed)
                xml_cache: dict[str, str] = {}
                xmltv_cache: dict[str, dict[str, str]] = {}

                for site_id, site_url in country_sites.items():
                    if not remaining:
                        break

                    if site_id not in xml_cache:
                        xml_text = await fetch_text(client, site_url)
                        if not xml_text:
                            continue
                        xml_cache[site_id] = xml_text
                        display_names, xmltv_by_name = extract_channel_map_from_xml(xml_text)
                        xmltv_cache[site_id] = xmltv_by_name
                    else:
                        xmltv_by_name = xmltv_cache.get(site_id, {})

                    xml_text = xml_cache[site_id]
                    display_names = list(xmltv_by_name.keys())
                    if not display_names:
                        logger.info("    %s: no display-names found", site_id)
                        continue

                    logger.info("    %s: %d chars XML, %d display-names, %d with xmltv_id", site_id, len(xml_text), len(display_names), len(xmltv_by_name))

                    still_remaining = []
                    for name, stream_id in remaining:
                        clean_name = clean_stream_name(name)
                        match = match_best(display_names, clean_name)
                        if match and match[1] > 0.5:
                            matched_xml_name = match[0]
                            logger.info("    %s → %s (score=%.2f, site=%s)", name, matched_xml_name, match[1], site_id)

                            xmltv_id = xmltv_by_name.get(matched_xml_name, "")
                            if xmltv_id:
                                logo_url = f"https://raw.githubusercontent.com/iptv-org/iptv-icons/master/logos/{xmltv_id}.png"
                                if stream_id not in new_logo_ids:
                                    new_logo_ids.add(stream_id)
                                    result["logos"] += 1
                                logo_batch.append({
                                    "stream_id": stream_id,
                                    "logo_url": logo_url,
                                    "source": f"xmltv:{site_id}",
                                    "created_at": datetime.utcnow().replace(tzinfo=None),
                                })
                                logger.info("      + logo [%s]: %s", xmltv_id, logo_url[:80])
                            else:
                                logger.info("      - no xmltv_id for '%s' in %s", matched_xml_name, site_id)
                        else:
                            still_remaining.append((name, stream_id))

                    remaining = still_remaining
                    del xml_text
                    del display_names
                    await asyncio.sleep(0.1)

                if remaining:
                    logger.info("    Unmatched channels: %s", [n for n, _ in remaining])
            else:
                logger.warning("    No XMLTV sites for country=%s, skipping.", country)

        # Phase 2: EPG program + logo import from open-epg.com (runs ALWAYS, overwrites Phase 1)
        epg_missing = list(missing_epg)
        if country in openepg_index and epg_missing:
            guide_urls = openepg_index[country]
            logger.info("    Open-EPG files for '%s': %d", country, len(guide_urls))
            for guide_url in guide_urls:
                if not epg_missing:
                    break
                xml_text = await fetch_text(client, guide_url)
                if not xml_text:
                    continue
                xmltv_channels, xmltv_icons = extract_xmltv_channels(xml_text)
                if not xmltv_channels:
                    logger.info("    %s: no channels found", guide_url)
                    continue
                logger.info("    %s: %d chars, %d channels, %d icons", guide_url.split("/")[-1], len(xml_text), len(xmltv_channels), len(xmltv_icons))
                display_names = [c["name"] for c in xmltv_channels]
                programs = parse_xmltv(xml_text)
                logger.info("      %d programmes", len(programs))

                still_needs = []
                for name, stream_id in epg_missing:
                    clean = clean_stream_name(name)
                    match = match_best(display_names, clean)
                    if match and match[1] > 0.5:
                        matched_name = match[0]
                        ch_id = ""
                        for ch in xmltv_channels:
                            if ch["name"] == matched_name:
                                ch_id = ch["id"]
                                break
                        if ch_id and programs:
                            channel_programs = [p for p in programs if p.get("xml_channel") == ch_id]
                            if channel_programs:
                                inserted = await import_programs(stream_id, name, channel_programs, ch_id)
                                result["imported"] += inserted
                                logger.info("      %s → %s [%s]: %d programmes", name, matched_name, ch_id, inserted)

                        # Logo from open-epg XML
                        icon_url = xmltv_icons.get(matched_name, "")
                        if icon_url:
                            if stream_id not in new_logo_ids:
                                new_logo_ids.add(stream_id)
                                result["logos"] += 1
                            logo_batch.append({
                                "stream_id": stream_id,
                                "logo_url": icon_url,
                                "source": f"openepg:{guide_url.split('/')[-1].split('.')[0]}",
                                "created_at": datetime.utcnow().replace(tzinfo=None),
                            })
                            logger.info("      + logo [%s]: %s", matched_name, icon_url[:80])
                    else:
                        still_needs.append((name, stream_id))

                # AI fallback for unmatched channels
                if still_needs:
                    ai_matches = await ai_match_channels(
                        [clean_stream_name(n) for n, _ in still_needs],
                        display_names,
                    )
                    if ai_matches:
                        ai_done = []
                        for name, stream_id in still_needs:
                            clean = clean_stream_name(name)
                            ai_name = ai_matches.get(name) or ai_matches.get(clean)
                            if ai_name:
                                ch_id = ""
                                for ch in xmltv_channels:
                                    if ch["name"] == ai_name:
                                        ch_id = ch["id"]
                                        break
                                if ch_id and programs:
                                    channel_programs = [p for p in programs if p.get("xml_channel") == ch_id]
                                    if channel_programs:
                                        inserted = await import_programs(stream_id, name, channel_programs, ch_id)
                                        result["imported"] += inserted
                                        logger.info("      [AI] %s → %s [%s]: %d programmes", name, ai_name, ch_id, inserted)

                                icon_url = xmltv_icons.get(ai_name, "")
                                if icon_url:
                                    if stream_id not in new_logo_ids:
                                        new_logo_ids.add(stream_id)
                                        result["logos"] += 1
                                    logo_batch.append({
                                        "stream_id": stream_id,
                                        "logo_url": icon_url,
                                        "source": f"openepg:{guide_url.split('/')[-1].split('.')[0]}",
                                        "created_at": datetime.utcnow().replace(tzinfo=None),
                                    })
                                    logger.info("      [AI] + logo [%s]: %s", ai_name, icon_url[:80])
                                ai_done.append((name, stream_id))
                                continue
                            ai_done.append((name, stream_id))
                        still_needs = ai_done

                epg_missing = still_needs
                del xml_text
                del programs

    if logo_batch:
        await import_logos_batch(logo_batch)
        await download_and_cache_logos(logo_batch)

    return result


async def main():
    logger.info("=== EPG Import v2: Category-based Xtream+XMLTV ===")
    start_time = time.time()

    # 1. Scan Redis sessions
    try:
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        session_keys = await redis.keys("session:*")

        if not session_keys:
            logger.warning("No active sessions found — nothing to import.")
            await redis.aclose()
            return

        raw_sessions = await redis.mget(session_keys)
        await redis.aclose()
    except Exception as e:
        logger.error("Redis scan failed: %s", e)
        return

    # 2. Dedup credentials
    seen_creds: set[tuple[str, str]] = set()
    cred_list: list[tuple[str, str]] = []

    for data in raw_sessions:
        if not data:
            continue
        try:
            session = json.loads(data)
            u = session.get("xtream_user", "")
            p = session.get("xtream_pass", "")
            if u and p and (u, p) not in seen_creds:
                seen_creds.add((u, p))
                cred_list.append((u, p))
        except Exception:
            pass

    logger.info("Found %d active sessions → %d unique credentials.", len(session_keys), len(cred_list))

    # 3. Build XMLTV site index (shared across all users)
    async with httpx.AsyncClient(verify=False) as client:
        site_map = await build_site_index(client)
        if not site_map:
            logger.error("No XMLTV sites found — aborting.")
            return

        openepg_index = build_epg_index()

        total = {"categories": 0, "channels": 0, "needs_epg": 0, "logos": 0, "imported": 0}

        for i, (username, password) in enumerate(cred_list):
            logger.info("--- Account %d/%d ---", i + 1, len(cred_list))
            res = await process_user(client, site_map, openepg_index, username, password)
            for k in total:
                total[k] += res[k]
            if i < len(cred_list) - 1:
                await asyncio.sleep(1)

    elapsed = time.time() - start_time
    logger.info("=== EPG Import Complete ===")
    logger.info("Accounts processed:       %d", len(cred_list))
    logger.info("Target categories:         %d", total["categories"])
    logger.info("Channels needing EPG:      %d", total["needs_epg"])
    logger.info("Logos imported:            %d", total["logos"])
    logger.info("Programmes imported:       %d", total["imported"])
    logger.info("Elapsed: %.1f seconds", elapsed)


if __name__ == "__main__":
    asyncio.run(main())

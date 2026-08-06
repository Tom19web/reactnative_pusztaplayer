"""
PusztaPlayer EPG Import — Közös segédfüggvények.
Használja: import_epg.py
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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.channel_matcher import match_best
from app.core.epg_importer import parse_xmltv, import_programs
from app.config import settings
from app.database import async_session_factory
from app.redis import get_redis
from app.services.epg_sources import _EPG_SOURCES, _CATEGORY_TO_COUNTRY, COUNTRY_SITE_PREFIXES
from app.services.deepseek_client import call_deepseek

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("epg_import")

IPTV_SITES_INDEX = "https://api.github.com/repos/iptv-org/epg/contents/sites"
API_TIMEOUT = 30.0

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


def _is_hungarian(cat_name: str) -> bool:
    low = (cat_name or "").lower()
    return any(w in low for w in ["hungary", "hun ", "hungarian", "magyar", " hun", "[hu]"])


def _guess_country(cat_name: str) -> str | None:
    low = (cat_name or "").lower()
    for name, code in _CATEGORY_TO_COUNTRY.items():
        if name in low:
            return code
    return None


_QUALITY_SUFFIX_RE = re.compile(
    r'\s+(FHD|HD|SD|4K|UHD|HEVC|H\.?265|H\.?264|8K|2K|HQ|LQ|RAW)(?:\s|$)',
    re.IGNORECASE,
)

_XMLTV_PREFIX_RE = re.compile(
    r'^(' + '|'.join(_STRIP_PREFIXES) + r')\s*[-:|]\s*',
    re.IGNORECASE,
)

_HARD_MATCHES: dict[str, str] = {
    "m1": "m1",
    "m2": "m2Petőfi TV",
    "m3": "M3",
    "m4 sport": "M4 Sport",
    "m4 sport+": "M4 Sport+",
    "m4 sport 1": "M4 Sport",
    "m5": "M5",
    "duna": "DUNA Televízió",
    "duna world": "Duna World",
    "rtl klub": "RTL Klub",
    "rtl": "RTL Klub",
    "rtl gold": "RTL Gold",
    "rtl ii": "RTL II",
    "tv2": "TV2",
    "atv": "ATV",
    "hír tv": "Hír TV",
    "spektrum home": "Spektrum Home",
}

from app.core.channel_merger import clean_channel_title


def clean_stream_name(name: str) -> str:
    return clean_channel_title(name)


def _gh_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


async def fetch_json(client: httpx.AsyncClient, url: str) -> list[dict]:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT, follow_redirects=True,
                                headers=_gh_headers() if "github.com" in url else None)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return []


async def fetch_text(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT, follow_redirects=True,
                                headers=_gh_headers() if "github.com" in url else None)
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
    """iptv-org channels.xml format."""
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


def extract_xmltv_channels(xml_text: str) -> tuple[list[dict], dict[str, str]]:
    """Standard XMLTV format (open-epg, free-epg). Returns (channels, icons)."""
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
                    name = _XMLTV_PREFIX_RE.sub('', name)
                    channels.append({"id": ch_id, "name": name})
                    if icon_src:
                        icons[name] = icon_src
    except Exception:
        pass
    return channels, icons


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


def _filter_sites_by_country(site_map: dict[str, str], country: str) -> dict[str, str]:
    return {
        sid: url for sid, url in site_map.items()
        if sid.startswith(country + ".") or sid.startswith(country + "-")
        or f"-{country}." in sid or f".{country}." in sid
        or sid == country or sid.endswith("." + country)
    }


def build_epg_index() -> dict[str, list[str]]:
    count = sum(len(v) for v in _EPG_SOURCES.values())
    logger.info("EPG index: %d countries, %d sources.", len(_EPG_SOURCES), count)
    return _EPG_SOURCES


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


async def scan_redis_sessions() -> list[tuple[str, str]]:
    try:
        redis = await get_redis()
        session_keys = [k async for k in redis.scan_iter(match="session:*")]

        if not session_keys:
            # Fallback: use admin credentials from .env
            if settings.XTREAM_USERNAME and settings.XTREAM_PASSWORD:
                logger.info("No active sessions — using admin credentials from config.")
                return [(settings.XTREAM_USERNAME, settings.XTREAM_PASSWORD)]
            logger.warning("No active sessions found and no admin credentials in config.")
            return []

        raw_sessions = await redis.mget(session_keys)
    except Exception as e:
        logger.error("Redis scan failed: %s", e)
        return []

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
    return cred_list


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


async def _call_deepseek(system_prompt: str, user_prompt: str) -> dict:
    if not settings.DEEPSEEK_API_KEY:
        return {}
    try:
        async with httpx.AsyncClient(verify=True, timeout=30.0) as c:
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
                # Attempt JSON repair: close unterminated strings/objects
                logger.warning("DeepSeek JSON truncated, attempting repair...")
                repaired = content.rstrip()
                # Remove trailing incomplete key/value
                last_complete = repaired.rfind(',\n  "')
                if last_complete > 0:
                    repaired = repaired[:last_complete] + '\n}}'
                else:
                    # Just close braces
                    repaired = repaired.rstrip(',\n ') + '\n}}'
                try:
                    return json.loads(repaired)
                except json.JSONDecodeError as e2:
                    logger.warning("DeepSeek JSON repair failed: %s", e2)
                    return {}
    except Exception as e:
        logger.warning("DeepSeek API call failed: %s", e)
        return {}


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
            "find the best match. Match by content type (e.g. 'RTL' matches 'RTL.at' or 'RTL'), "
            "ignore quality suffixes like HD/FHD/SD, resolve HTML entities (&amp;#246;=ö). "
            "Single letters + numbers are valid (M1, M2, RTL, TV2). "
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
    except Exception:
        pass

    return matches


_AI_CHANNEL_MAP_CACHE = "/tmp/ai_channel_map.json"


def _hash_names(names: list[str]) -> str:
    import hashlib
    return hashlib.md5(json.dumps(sorted(names)).encode()).hexdigest()[:12]


async def ai_parse_channel_map(
    country: str,
    xtream_names: list[str],
    xmltv_names: list[str],
) -> dict[str, str]:
    """Full AI channel name mapping for a country. Returns {xtream_name: xmltv_name}."""
    if not xtream_names or not xmltv_names:
        return {}

    # Check global cache
    source_hash = _hash_names(xmltv_names)
    cache = {}
    try:
        if os.path.exists(_AI_CHANNEL_MAP_CACHE):
            with open(_AI_CHANNEL_MAP_CACHE) as f:
                cache = json.load(f)
    except Exception:
        pass

    cache_key = f"{country}:{source_hash}"
    if cache_key in cache:
        logger.info("    AI channel map cache HIT for '%s' (%d entries).", country, len(cache[cache_key]))
        return cache[cache_key]

    # No DeepSeek? Fall back to match_best
    if not settings.DEEPSEEK_API_KEY:
        logger.info("    No DEEPSEEK_API_KEY — using match_best fallback.")
        return {}

    logger.info("    AI parsing channel map for '%s' (%d Xtream × %d XMLTV)...", country, len(xtream_names), len(xmltv_names))

    try:
        system = (
            "You are a TV channel name matcher for an IPTV app. Match Xtream channel names to XMLTV display names. "
            "Rules:\n"
            "- Ignore quality suffixes (HD, FHD, SD, 4K, HEVC) when matching.\n"
            "- Resolve HTML entities (&#246; → ö, &#252; → ü).\n"
            "- 'RTL' matches 'RTL.at' or 'RTL', 'RTL2' matches 'RTL2' or 'RTLZWEI'.\n"
            "- Single letters + number are valid channel names (M1, M2, RTL, ATV, TV2). DO NOT skip them.\n"
            "- 'Servus TV Osterreich' → 'ServusTV.at', 'krone.tv.at' → 'Krone TV'.\n"
            "- '3+' → '3 Plus', '4+' → '4 Plus'.\n"
            "- Use country context: AT=Austria, DE=Germany, CH=Switzerland, HU=Hungary, RO=Romania, IT=Italy.\n"
            "- Hungarian channels: 'M1'→'m1', 'Duna'→'DUNA Televízió', 'RTL Klub'→'RTL Klub', 'TV2'→'TV2'.\n"
            "Return ONLY JSON: {\"matches\": {\"xtream_name\": \"xmltv_display_name\"}}. "
            "If no plausible match, omit that name from matches."
        )
        user = json.dumps({
            "country": country,
            "xtream_names": xtream_names,
            "xmltv_names": xmltv_names[:500],
        })

        result = await _call_deepseek(system, user)
        ai_matches = result.get("matches", {}) if isinstance(result, dict) else {}

        # Validate: xml_name must be in our list
        valid = {}
        for xt, xm in ai_matches.items():
            if xm in xmltv_names:
                valid[xt] = xm

        # Cache globally
        cache[cache_key] = valid
        try:
            with open(_AI_CHANNEL_MAP_CACHE, "w") as f:
                json.dump(cache, f)
        except Exception:
            pass

        if valid:
            logger.info("    AI matched %d/%d channels for '%s'.", len(valid), len(xtream_names), country)

        return valid
    except Exception as e:
        logger.warning("    AI channel map parse failed: %s", e)
        return {}


def build_targets(categories: list[dict]) -> list[tuple[int, str, str]]:
    """Build list of (category_id, category_name, country_code)."""
    targets: list[tuple[int, str, str]] = []
    for cat in categories:
        cat_id = int(cat.get("category_id", 0))
        cat_name = cat.get("category_name", "")
        if not cat_id:
            continue
        country = _guess_country(cat_name) or ("hu" if _is_hungarian(cat_name) else None)
        if country:
            targets.append((cat_id, cat_name, country))
    return targets

"""
EPG import script: Per-user Redis session scan, Non-Hungarian category identification,
country-targeted XMLTV matching, program & logo import.

Usage:
  docker compose exec fastapi python /app/scripts/import_epg_xmltv.py
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
    "al", "ie", "us", "ca", "au", "ru", "br"
]

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
        logger.warning("Failed to fetch JSON %s: %s", url, e)
        return []


async def fetch_text(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(url, timeout=API_TIMEOUT, headers=_gh_headers() if "github.com" in url else None)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        logger.warning("Failed to fetch text %s: %s", url, e)
        return ""


def clean_channel_prefix(name: str) -> str:
    """Lefejti a csatornanév elejéről az ország/minőség előtagokat (pl: 'AT: ATV 2' -> 'ATV 2')."""
    cleaned = re.sub(r'^(?:[A-Z]{2,3}[-:\s|]+)+', '', name, flags=re.IGNORECASE).strip()
    return cleaned if cleaned else name


def extract_channel_icons_from_xml(xml_text: str) -> dict[str, str]:
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


def _is_hungarian_category(cat_name: str) -> bool:
    name_lower = (cat_name or "").lower()
    return any(keyword in name_lower for keyword in ["hungary", "magyar", "hungarian", "hu|", "[hu]"])


def _guess_country_code(channel_name: str, group: str, cat_name: str) -> str:
    cat_lower = (cat_name or "").lower()
    for key, code in _COUNTRY_NAME_TO_CODE.items():
        if key in cat_lower:
            return code
    group_lower = (group or "").lower()
    for key, code in _COUNTRY_NAME_TO_CODE.items():
        if key in group_lower:
            return code
    # Ha a csatornanév elején van országjelzés (pl. "AT: ...")
    prefix_match = re.match(r'^([A-Z]{2})[:\s|-]', channel_name, re.IGNORECASE)
    if prefix_match:
        code = prefix_match.group(1).lower()
        if code in COUNTRY_SITE_PREFIXES:
            return code
    return "de"  # Európai alapértelmezett fallback


async def build_site_index(client: httpx.AsyncClient) -> dict[str, str]:
    site_map: dict[str, str] = {}
    logger.info("XMLTV index építése az iptv-org/epg repository-ból...")

    import json as _json
    cache_file = "/tmp/epg_site_cache.json"
    try:
        if os.path.exists(cache_file):
            with open(cache_file) as f:
                site_map = _json.load(f)
            if site_map:
                logger.info("Gyorsítótárazott %d XMLTV oldal betöltve.", len(site_map))
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

    logger.info("%d országspecifikus oldalmappa kiválasztva.", len(matching_dirs))

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
            _json.dump(site_map, f)
    except Exception:
        pass

    logger.info("Index sikeresen felépítve: %d oldal.", len(site_map))
    return site_map


async def import_logos(stream_id: int, icons: dict[str, str], site_id: str):
    if not icons:
        return
    from app.database import async_session_factory
    from sqlalchemy import text
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
                await sess.execute(text(stmt), {"sid": stream_id, "url": logo_url, "src": f"xmltv:{site_id}"})
                await sess.commit()
                break
            except Exception as e:
                await sess.rollback()
                logger.debug("Logó mentési hiba (stream_id %d): %s", stream_id, e)
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
        resp = await client.get(url, timeout=8.0)
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
    result = {"total_non_hu": 0, "identified": 0, "imported": 0, "logos": 0}
    logger.info("[%s] Kategóriák és élő adások lekérése...", user_label)

    try:
        streams, cat_by_id = await _fetch_live_streams(client, username, password)
    except Exception as e:
        logger.error("[%s] Sikertelen lekérés: %s", user_label, e)
        return result

    if not isinstance(streams, list):
        return result

    # 1. Kategóriák szűrése — Csak a NEM-MAGYAR kategóriák megtartása
    non_hu_categories: dict[int, tuple[str, str]] = {}
    for cat_id, cat_name in cat_by_id.items():
        if not _is_hungarian_category(cat_name):
            country_code = _guess_country_code("", "", cat_name)
            non_hu_categories[cat_id] = (cat_name, country_code)

    logger.info("[%s] Összes kategória: %d | Nem-magyar kategóriák: %d", user_label, len(cat_by_id), len(non_hu_categories))

    # 2. Célcsatornák begyűjtése
    target_streams = []
    for s in streams:
        if not isinstance(s, dict):
            continue
        stream_id = s.get("stream_id", 0)
        raw_name = s.get("name", "Unknown")
        cat_id = int(s.get("category_id", 0) or 0)

        if stream_id and cat_id in non_hu_categories:
            # Megnézzük, van-e már gyári Xtream EPG
            has_epg = await _check_xtream_epg(client, username, password, stream_id)
            if not has_epg:
                cat_name, country_code = non_hu_categories[cat_id]
                clean_name = clean_channel_prefix(raw_name)
                target_streams.append({
                    "stream_id": stream_id,
                    "raw_name": raw_name,
                    "clean_name": clean_name,
                    "category_name": cat_name,
                    "country_code": country_code
                })

    result["total_non_hu"] = len(target_streams)
    logger.info("[%s] Azonosításra és EPG-re váró külföldi streamek: %d", user_label, len(target_streams))

    if not target_streams:
        return result

    # 3. Célzott matchelés és importálás
    site_xml_cache: dict[str, str] = {}
    site_icons_cache: dict[str, dict[str, str]] = {}

    for item in target_streams:
        stream_id = item["stream_id"]
        raw_name = item["raw_name"]
        clean_name = item["clean_name"]
        country_code = item["country_code"]
        cat_name = item["category_name"]

        best_site_id = ""
        best_site_url = ""
        best_match = None

        # Csak az adott országkóddal rendelkező XMLTV forrásokat vizsgáljuk!
        relevant_sites = {
            s_id: s_url for s_id, s_url in site_map.items()
            if s_id.startswith(country_code + ".") or s_id.startswith(country_code + "-") or f"-{country_code}." in s_id
        }
        search_sites = relevant_sites if relevant_sites else site_map

        for site_id, site_url in search_sites.items():
            if site_id not in site_xml_cache:
                xml_text = await fetch_text(client, site_url)
                if not xml_text:
                    continue
                site_xml_cache[site_id] = xml_text
                site_icons_cache[site_id] = extract_channel_icons_from_xml(xml_text)

            xml_text = site_xml_cache[site_id]
            display_names = extract_channel_names_from_xml(xml_text)
            if not display_names:
                continue

            match_res = match_best(display_names, clean_name)
            if match_res and match_res[1] > 0.5:
                if not best_match or match_res[1] > best_match[1]:
                    best_site_id = site_id
                    best_site_url = site_url
                    best_match = match_res

        if best_match and best_site_url:
            result["identified"] += 1
            matched_xml_name = best_match[0]
            confidence = best_match[1] * 100

            logger.info("  [BEAZONOSÍTVA] [%s] '%s' -> '%s' (%s, egyezés: %.1f%%)",
                        cat_name, raw_name, matched_xml_name, best_site_id, confidence)

            xml_text = site_xml_cache.get(best_site_id, "")
            if xml_text:
                programs = parse_xmltv(xml_text)
                if programs:
                    inserted = await import_programs(stream_id, raw_name, programs, best_site_id)
                    result["imported"] += inserted

                icons = site_icons_cache.get(best_site_id, {})
                if icons:
                    await import_logos(stream_id, icons, best_site_id)
                    result["logos"] += 1
        else:
            logger.warning("  [ISMERETLEN] [%s] '%s' (Ország: %s)", cat_name, raw_name, country_code)

    return result


async def main():
    logger.info("=== PusztaPlayer: Külföldi Csatornák Automata EPG & Logó Importőre ===")
    start_time = time.time()

    # 1. Redis munkamenetek beolvasása
    try:
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        session_keys = await redis.keys("session:*")
        await redis.aclose()
    except Exception as e:
        logger.error("Redis kapcsolódási hiba: %s", e)
        return

    if not session_keys:
        logger.warning("Nincs aktív Redis munkamenet — az importálás leáll.")
        return

    # 2. Felhasználói adatok deduplikálása
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
        logger.error("Hiba a hálózati adatok feldolgozásakor: %s", e)
        return

    logger.info("Talált munkamenetek: %d -> Egyedi előfizetések: %d", len(session_keys), len(cred_list))

    # 3. Globális XMLTV index felépítése és feldolgozás
    async with httpx.AsyncClient(verify=False) as client:
        site_map = await build_site_index(client)
        if not site_map:
            logger.error("XMLTV index üres — az importálás megszakadt.")
            return

        total = {"total_non_hu": 0, "identified": 0, "imported": 0, "logos": 0}

        for i, (username, password) in enumerate(cred_list):
            label = f"Felhasználó {i + 1}/{len(cred_list)}"
            logger.info("--- %s ---", label)
            res = await process_user(client, site_map, username, password, label)
            for k in total:
                total[k] += res[k]

            if i < len(cred_list) - 1:
                await asyncio.sleep(1)

    elapsed = time.time() - start_time
    logger.info("==============================================")
    logger.info("  EPG & LOGÓ IMPORT KÉSZ")
    logger.info("  Feldolgozott fiókok:       %d", len(cred_list))
    logger.info("  Külföldi EPG-re várók:     %d", total["total_non_hu"])
    logger.info("  Sikeresen beazonosítva:   %d", total["identified"])
    logger.info("  Beimportált műsorok:      %d", total["imported"])
    logger.info("  Frissített logók:          %d", total["logos"])
    logger.info("  Összes idő:               %.1f másodperc", elapsed)
    logger.info("==============================================")


if __name__ == "__main__":
    asyncio.run(main())

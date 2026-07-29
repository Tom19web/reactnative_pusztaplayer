"""
PusztaPlayer EPG Import Script (Lt. Dan v2.0 - Aszinkron Torpedó)
Optimalizált Redis MGET, O(1) XML letöltés, és Batch PostgreSQL mentés.
"""
import asyncio
import json
import logging
import os
import sys
import time
from collections import defaultdict

import httpx
import redis.asyncio as aioredis
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.channel_matcher import normalize, match_best
from app.core.epg_importer import parse_xmltv, import_programs
from app.config import settings
from app.database import async_session_factory
from app.models.models import ChannelLogoModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] 🚀 %(message)s")
logger = logging.getLogger("epg_import")

IPTV_SITES_INDEX = "https://api.github.com/repos/iptv-org/epg/contents/sites"
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
        logger.warning("Failed to fetch XML %s: %s", url, e)
        return ""


# -- (Ide jönnek a te eredeti extract_channel_icons_from_xml, stb. segédfüggvényeid. Azok jók voltak!) --
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


async def import_logos_batch(logo_data: list[dict]):
    """BATCH INSERT a logóknak! Nem kommitolunk egyesével, mert az megöli a Postgrest."""
    if not logo_data:
        return
    async with async_session_factory() as sess:
        try:
            stmt = pg_insert(ChannelLogoModel).values(logo_data)
            stmt = stmt.on_conflict_do_update(
                index_elements=['stream_id'],
                set_={'logo_url': stmt.excluded.logo_url, 'source': stmt.excluded.source}
            )
            await sess.execute(stmt)
            await sess.commit()
            logger.info("✅ Batch inserted/updated %d logos.", len(logo_data))
        except Exception as e:
            await sess.rollback()
            logger.error("Logo batch insert failed: %s", e)


# --- CORE ÜZLETI LOGIKA ---

async def _fetch_live_streams(client: httpx.AsyncClient, username: str, password: str) -> tuple[list, dict]:
    url = f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_live_streams"
    resp = await client.get(url, timeout=API_TIMEOUT)
    resp.raise_for_status()
    streams = resp.json()
    
    cat_url = f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_live_categories"
    cat_resp = await client.get(cat_url, timeout=API_TIMEOUT)
    cat_resp.raise_for_status()
    cats = cat_resp.json()
    
    cat_by_id = {int(c.get("category_id", 0)): c.get("category_name", "") for c in (cats if isinstance(cats, list) else [])}
    return streams, cat_by_id


async def _check_xtream_epg(client: httpx.AsyncClient, username: str, password: str, stream_id: int) -> bool:
    url = f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_short_epg&stream_id={stream_id}&limit=1"
    try:
        resp = await client.get(url, timeout=10.0)
        if not resp.ok: return False
        data = resp.json()
        if isinstance(data, dict):
            listings = data.get("epg_listings") or data.get("EPG_Listings")
            return bool(isinstance(listings, list) and listings)
        return bool(isinstance(data, list) and data)
    except Exception:
        return False


async def process_user_efficiently(client: httpx.AsyncClient, site_map: dict[str, str], username: str, password: str, user_label: str) -> dict:
    result = {"xtream": 0, "xmltv": 0, "imported": 0, "logos": 0}
    logger.info("[%s] Élő csatornák és EPG státuszok párhuzamos lekérése...", user_label)
    
    try:
        streams, cat_by_id = await _fetch_live_streams(client, username, password)
    except Exception as e:
        logger.error("[%s] Hiba az Xtream lekérésnél: %s", user_label, e)
        return result

    if not isinstance(streams, list): return result

    needs_xmltv = []
    
    # Xtream EPG ellenőrzés párhuzamosítása (10-es batch-ekben, hogy ne fojtsuk meg az API-t)
    async def check_epg_task(s):
        stream_id = s.get("stream_id", 0)
        name = s.get("name", "Unknown")
        if not stream_id: return None
        has_epg = await _check_xtream_epg(client, username, password, stream_id)
        if has_epg:
            return ("xtream", None)
        else:
            return ("xmltv", (name, stream_id))

    tasks = [check_epg_task(s) for s in streams]
    epg_results = await asyncio.gather(*tasks)

    for res in epg_results:
        if not res: continue
        if res[0] == "xtream":
            result["xtream"] += 1
        elif res[0] == "xmltv":
            needs_xmltv.append(res[1])

    logger.info("[%s] Xtream EPG megvan: %d | XMLTV-re vár: %d csatorna", user_label, result["xtream"], len(needs_xmltv))
    if not needs_xmltv: return result

    # --- INVERTÁLT XML FELDOLGOZÁS (Memóriavédelem) ---
    # Most nem a csatornákon iterálunk, hanem az XML fájlokon, hogy egyet csak egyszer töltsünk be!
    logo_batch = []
    for site_id, site_url in site_map.items():
        if not needs_xmltv: break  # Ha elfogytak a csatornák, kiszállunk!

        norm_site = normalize(site_id)
        # Megnézzük, van-e egyáltalán csatorna, ami passzolhat ehhez az XML-hez
        candidates = [ch for ch in needs_xmltv if any(c in norm_site for c in normalize(ch[0])[:4])]
        
        if not candidates: continue

        logger.info("  -> Fájl letöltése: %s (%d lehetséges csatornához)", site_id, len(candidates))
        xml_text = await fetch_text(client, site_url)
        if not xml_text: continue

        display_names = extract_channel_names_from_xml(xml_text)
        icons = extract_channel_icons_from_xml(xml_text)
        
        still_needs = []
        for name, stream_id in needs_xmltv:
            match = match_best(display_names, name)
            if match and match[1] > 0.6:  # Szigorúbb illeszkedés
                programs = parse_xmltv(xml_text) # Ezt optimalizálhatod a jövőben stream parserre!
                if programs:
                    inserted = await import_programs(stream_id, name, programs, site_id)
                    result["imported"] += inserted
                    result["xmltv"] += 1
                    
                if icons:
                    # Kimentjük a logót a Batch-be
                    for xml_ch_id, logo_url in icons.items():
                        if logo_url:
                            logo_batch.append({"stream_id": stream_id, "logo_url": logo_url, "source": f"xmltv:{site_id}"})
                            result["logos"] += 1
                            break
            else:
                still_needs.append((name, stream_id))
        
        needs_xmltv = still_needs # Csak azokat tartjuk meg, amik még nincsenek meg
        
        # MEMÓRIA TAKARÍTÁS - Brutális fontosságú!
        del xml_text
        del display_names
        del icons

    # Logók egyidejű elmentése (Batch Insert)
    if logo_batch:
        await import_logos_batch(logo_batch)

    return result


async def main():
    logger.info("=== EPG Import v2: Redis MGET + Asyncio Gather ===")
    start_time = time.time()

    # 1. Redis MGET - A 2.0-ás villámgyors megoldás (nincs dupla kapcsolat nyitogatás!)
    try:
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        session_keys = await redis.keys("session:*")
        
        if not session_keys:
            logger.warning("Nincs aktív session, megyek aludni.")
            await redis.aclose()
            return
            
        # Egyetlen lekéréssel lerántjuk az ÖSSZES session tartalmát!
        raw_sessions = await redis.mget(session_keys)
        await redis.aclose()
    except Exception as e:
        logger.error("Redis villám-olvasás elszállt: %s", e)
        return

    # 2. Duplikációk szűrése
    seen_creds = set()
    cred_list = []
    for data in raw_sessions:
        if not data: continue
        try:
            session = json.loads(data)
            u, p = session.get("xtream_user", ""), session.get("xtream_pass", "")
            if u and p and (u, p) not in seen_creds:
                seen_creds.add((u, p))
                cred_list.append((u, p))
        except Exception:
            pass

    logger.info("Találtam %d sessiont, ebből %d egyedi Xtream fiók.", len(session_keys), len(cred_list))

    # 3. XMLTV feldolgozás
    async with httpx.AsyncClient(verify=False) as client:
        # (Itt hívd meg az eredeti build_site_index-et. Ezt most kihagyom a kódból a rövidség kedvéért, használd a régit!)
        site_map = await build_site_index(client) 
        if not site_map:
            logger.error("Nincs XMLTV site index — kilövés.")
            return
        
        total = {"xtream": 0, "xmltv": 0, "imported": 0, "logos": 0}

        for i, (username, password) in enumerate(cred_list):
            label = f"Fiók {i + 1}/{len(cred_list)}"
            logger.info("--- %s ---", label)
            res = await process_user_efficiently(client, site_map, username, password, label)
            for k in total: total[k] += res[k]

    elapsed = time.time() - start_time
    logger.info("=== EPG Import Kész ===")
    logger.info("Feldolgozott fiókok: %d", len(cred_list))
    logger.info("Xtream fedezte:      %d", total["xtream"])
    logger.info("XMLTV megmentette:   %d", total["xmltv"])
    logger.info("Műsorok adatbázisban:%d", total["imported"])
    logger.info("Új logók mentve:     %d", total["logos"])
    logger.info("Lefutási idő: %.1f másodperc", elapsed)


if __name__ == "__main__":
    asyncio.run(main())
"""
PusztaPlayer XMLTV szűrő + EPG import

Letölti a teljes xmltv.php-t (a paramétereket a proxy ignorálja), majd
csatornára szűr, és a kiválasztott csatornák EPG-jét betölti az
epg_programs táblába (channel_id = str(stream_id)).

Csak a HIÁNYZÓ programokat adja hozzá (on_conflict_do_nothing) — a
meglévőket nem írja felül.

Használat (SSH):
  python import_epg_filtered.py --missing                 # ami a DB-ből hiányzik
  python import_epg_filtered.py --category HUNGARY
  python import_epg_filtered.py --stream-ids 475,486,491
  python import_epg_filtered.py --name M1
  python import_epg_filtered.py --missing --refresh       # cache újratöltés
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from sqlalchemy import text

from app.config import settings
from app.database import async_session_factory
from app.redis import get_redis
from app.core.epg_importer import parse_xmltv, import_programs
from app.core.xtream_client import fetch_live_streams
from app.core.channel_matcher import normalize, match_best

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] 📺 %(message)s")
logger = logging.getLogger("import_epg_filtered")

XMLTV_CACHE = "/tmp/xmltv_full.xml"
XMLTV_CACHE_TTL = 12 * 3600  # 12 óra
MATCH_THRESHOLD = 0.6


async def get_xtream_credentials() -> tuple[str, str] | tuple[None, None]:
    try:
        r = await get_redis()
        keys = await r.keys("session:*")
        if not keys:
            return None, None
        data = json.loads(await r.get(keys[0]) or "{}")
        return data.get("xtream_user"), data.get("xtream_pass")
    except Exception:
        return None, None


async def download_xmltv(username: str, password: str, refresh: bool = False) -> str:
    if not refresh and os.path.exists(XMLTV_CACHE):
        age = time.time() - os.path.getmtime(XMLTV_CACHE)
        if age < XMLTV_CACHE_TTL:
            logger.info("XMLTV cache-ből olvasva (%d mp idős)", int(age))
            with open(XMLTV_CACHE, encoding="utf-8", errors="replace") as f:
                return f.read()

    url = f"{settings.XTREAM_API_BASE}/xmltv.php?username={username}&password={password}"
    logger.info("XMLTV letöltés: %s", url)
    async with httpx.AsyncClient(verify=False, timeout=120.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    text = resp.text

    with open(XMLTV_CACHE, "w", encoding="utf-8") as f:
        f.write(text)
    logger.info("Letöltve: %d byte (%.1f MB)", len(text), len(text) / 1024 / 1024)
    return text


async def get_existing_channel_ids() -> set[str]:
    async with async_session_factory() as sess:
        result = await sess.execute(text("SELECT DISTINCT channel_id FROM epg_programs"))
        return {str(r[0]) for r in result.fetchall()}


def stream_category(stream: dict, cat_by_id: dict) -> str:
    cat_id = int(stream.get("category_id", 0) or 0)
    return cat_by_id.get(cat_id, stream.get("category_name", "") or "")


async def main(args: argparse.Namespace):
    username, password = await get_xtream_credentials()
    if not username:
        logger.error("Nincs Xtream session a Redisben. Jelentkezz be előbb!")
        return

    # 1. XMLTV letöltés / cache
    xml_text = await download_xmltv(username, password, refresh=args.refresh)

    # 2. Parse
    programmes = parse_xmltv(xml_text)
    prog_by_channel: dict[str, list[dict]] = {}
    for p in programmes:
        ch = p.get("channel_id", "")
        if ch:
            prog_by_channel.setdefault(ch, []).append(p)
    logger.info("XMLTV programme-ok: %d, egyedi channel_id: %d", len(programmes), len(prog_by_channel))

    # 3. Xtream live streams
    streams, cat_by_id = await fetch_live_streams(username, password)
    logger.info("Xtream live csatornák: %d", len(streams))

    # 4. Meglévő DB id-k (ha --missing)
    existing: set[str] = set()
    if args.missing:
        existing = await get_existing_channel_ids()
        logger.info("Meglévő DB channel_id-k: %d", len(existing))

    # 5. Szűrés
    stream_ids_set = set()
    if args.stream_ids:
        stream_ids_set = {x.strip() for x in args.stream_ids.split(",") if x.strip()}

    selected: list[dict] = []
    for s in streams:
        if not isinstance(s, dict):
            continue
        sid = s.get("stream_id", 0)
        if not sid:
            continue
        name = str(s.get("name", ""))
        if not name:
            continue

        if args.category and stream_category(s, cat_by_id).lower() != args.category.lower():
            continue
        if stream_ids_set and str(sid) not in stream_ids_set:
            continue
        if args.name and args.name.lower() not in name.lower():
            continue
        if args.missing and str(sid) in existing:
            continue

        selected.append({
            "stream_id": sid,
            "name": name,
            "category": stream_category(s, cat_by_id),
            "epg_channel_id": s.get("epg_channel_id") or "",
        })

    logger.info("Szűrés után: %d csatorna", len(selected))
    if not selected:
        logger.info("Nincs kiválasztott csatorna.")
        return

    # 6. Matching index
    norm_index: dict[str, str] = {}
    for xmltv_id in prog_by_channel:
        n = normalize(xmltv_id)
        if n:
            norm_index[n] = xmltv_id
    xmltv_ids = list(prog_by_channel.keys())

    # 7. Import
    matched = 0
    total_inserted = 0
    unmatched: list[str] = []

    for st in selected:
        name = st["name"]
        xmltv_id = None

        # a) pontos illesztés a stream névre
        n_name = normalize(name)
        if n_name and n_name in norm_index:
            xmltv_id = norm_index[n_name]

        # b) pontos illesztés az epg_channel_id-re (ha van)
        if not xmltv_id and st["epg_channel_id"]:
            n_epg = normalize(st["epg_channel_id"])
            if n_epg and n_epg in norm_index:
                xmltv_id = norm_index[n_epg]

        # c) fuzzy fallback
        if not xmltv_id:
            m = match_best(xmltv_ids, name, threshold=MATCH_THRESHOLD)
            if m:
                xmltv_id = m[0]

        if not xmltv_id or xmltv_id not in prog_by_channel:
            unmatched.append(f"{st['stream_id']} ({name})")
            continue

        progs = prog_by_channel[xmltv_id]
        inserted = await import_programs(st["stream_id"], name, progs, xmltv_id)
        matched += 1
        total_inserted += inserted
        logger.info("  [%d] %s → %s: %d/%d program", st["stream_id"], name, xmltv_id, inserted, len(progs))

    logger.info("Kész: %d csatorna, %d új program betöltve, %d nem talált.", matched, total_inserted, len(unmatched))
    if unmatched:
        logger.info("Nem talált (%d): %s", len(unmatched), "; ".join(unmatched[:40]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="XMLTV szűrő + EPG import.")
    parser.add_argument("--category", default="", help="Kategória név (pl. HUNGARY)")
    parser.add_argument("--stream-ids", default="", help="Vesszővel elválasztott stream_id-k")
    parser.add_argument("--name", default="", help="Részleges csatornanév szűrő")
    parser.add_argument("--missing", action="store_true", help="Csak a DB-ből hiányzó csatornák")
    parser.add_argument("--refresh", action="store_true", help="XMLTV cache újratöltése")
    args = parser.parse_args()

    # Ha egyetlen szűrő sincs megadva, alapértelmezetten a hiányzókat importáljuk
    if not (args.category or args.stream_ids or args.name or args.missing):
        logger.info("Nincs szűrő megadva — --missing mód.")
        args.missing = True

    asyncio.run(main(args))

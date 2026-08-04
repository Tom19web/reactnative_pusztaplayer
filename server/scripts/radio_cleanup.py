"""
PusztaPlayer Rádió Tisztító

1. LOGÓ FELTÖLTÉS: az azonos stream_url-jű, logó nélküli állomásra
   átmásolja a testvér állomás logóját (ha van).
2. DUPLIKÁTUM DEDUP: minden azonos stream_url csoportból PONTOSAN 1 aktív
   állomás marad, a többi aktív deaktiválva (icy-tól függetlenül).
3. ICY DETEKT (info): a duplikátum URL-ekre logolja, hogy van-e ICY meta.

Használat:
  python radio_cleanup.py             # dry-run: csak listáz
  python radio_cleanup.py --commit    # tényleges módosítások
"""
import argparse
import asyncio
import hashlib
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.database import async_session_factory
from app.redis import get_redis
from app.core.icy_meta import detect_icy_support

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] 📻 %(message)s")
logger = logging.getLogger("radio_cleanup")

ICY_CACHE_TTL = 12 * 3600  # 12 óra


def _score(st: dict) -> tuple:
    """Rangsor: a legmagasabb pontszámú marad. (votes, van_logo, van_tags, van_lang, uuid)"""
    favicon = (st.get("favicon") or "").strip()
    tags = (st.get("tags") or "").strip()
    lang = (st.get("language") or "").strip()
    return (
        st.get("votes") or 0,
        1 if favicon else 0,
        1 if tags else 0,
        1 if lang else 0,
        st.get("station_uuid") or "",
    )


async def load_stations() -> list[dict]:
    async with async_session_factory() as sess:
        result = await sess.execute(
            text(
                "SELECT station_uuid, name, stream_url, favicon, tags, language, votes, is_active "
                "FROM radio_stations LIMIT 5000"
            )
        )
        rows = result.fetchall()
    return [
        {
            "station_uuid": r[0],
            "name": r[1],
            "stream_url": r[2],
            "favicon": r[3] or "",
            "tags": r[4] or "",
            "language": r[5] or "",
            "votes": r[6] or 0,
            "is_active": bool(r[7]),
        }
        for r in rows
    ]


async def update_favicon(uuid: str, favicon: str):
    async with async_session_factory() as sess:
        await sess.execute(
            text("UPDATE radio_stations SET favicon = :f WHERE station_uuid = :u"),
            {"f": favicon, "u": uuid},
        )
        await sess.commit()


async def deactivate(uuids: list[str]):
    if not uuids:
        return
    async with async_session_factory() as sess:
        await sess.execute(
            text("UPDATE radio_stations SET is_active = false WHERE station_uuid = ANY(:uuids)"),
            {"uuids": uuids},
        )
        await sess.commit()


async def get_icy_support(url: str) -> bool:
    """Redis cache-es ICY detektálás URL-enként."""
    key = "radio:icy:" + hashlib.sha256(url.encode("utf-8")).hexdigest()
    r = await get_redis()
    cached = await r.get(key)
    if cached is not None:
        return cached == b"1"
    result = await detect_icy_support(url)
    await r.set(key, b"1" if result else b"0", ex=ICY_CACHE_TTL)
    return result


async def main(commit: bool):
    stations = await load_stations()
    logger.info("Betöltve: %d állomás", len(stations))

    # ── 1. LOGÓ FELTÖLTÉS ─────────────────────────────
    by_url: dict[str, list[dict]] = {}
    for st in stations:
        u = (st["stream_url"] or "").strip()
        if u:
            by_url.setdefault(u, []).append(st)

    logo_fixes = 0
    for st in stations:
        if (st["favicon"] or "").strip():
            continue
        siblings = by_url.get((st["stream_url"] or "").strip(), [])
        donor = next((s for s in siblings if (s.get("favicon") or "").strip()), None)
        if not donor:
            continue
        new_logo = donor["favicon"].strip()
        if commit:
            await update_favicon(st["station_uuid"], new_logo)
        logger.info("  🖼 Logó feltöltve: %s (%s) <- %s", st["station_uuid"], st["name"], donor["station_uuid"])
        logo_fixes += 1
    logger.info("Logó feltöltés: %d állomás", logo_fixes)

    # ── 2. DUPLIKÁTUM DEDUP (1 maradjon) ──────────────
    dup_groups = []
    for url, group in by_url.items():
        active = [s for s in group if s["is_active"]]
        if len(active) > 1:
            dup_groups.append((url, group, active))

    logger.info("Duplikátum csoportok: %d", len(dup_groups))

    to_deactivate: list[str] = []
    for url, _group, active in dup_groups:
        best = max(active, key=_score)
        losers = [s for s in active if s["station_uuid"] != best["station_uuid"]]
        logger.info(
            "  🔁 %s (%d aktív) → marad: %s (%s)",
            url, len(active), best["station_uuid"], best["name"],
        )
        for loser in losers:
            logger.info("     deaktiválás: %s (%s)", loser["station_uuid"], loser["name"])
        to_deactivate.extend(s["station_uuid"] for s in losers)

    # ── 3. ICY DETEKT (info, a duplikátum URL-ekre) ────
    if dup_groups:
        unique_urls = sorted(set(g[0] for g in dup_groups))
        logger.info("ICY detektálás (%d egyedi URL, párhuzamosan)...", len(unique_urls))

        sem = asyncio.Semaphore(5)

        async def one(url: str):
            async with sem:
                try:
                    icy = await get_icy_support(url)
                    logger.info("  %s → %s", "ICY ✓" if icy else "icy ✗", url)
                except Exception as e:
                    logger.warning("  icy hiba %s: %s", url, e)

        await asyncio.gather(*(one(u) for u in unique_urls))
    else:
        logger.info("Nincs duplikátum csoport — ICY detekt kihagyva.")

    # ── KÖVETKEZTETÉS ─────────────────────────────────
    if not commit:
        logger.info("DRY-RUN: %d állomás lenne deaktiválva. Futtasd --commit-t a végrehajtáshoz.", len(to_deactivate))
        return

    await deactivate(to_deactivate)
    logger.info("Kész: %d állomás deaktiválva.", len(to_deactivate))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rádió tisztító: logó feltöltés + duplikátum dedup.")
    parser.add_argument("--commit", action="store_true", help="Tényleges módosítások (alapból dry-run).")
    args = parser.parse_args()
    asyncio.run(main(commit=args.commit))

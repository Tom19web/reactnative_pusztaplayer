"""
PusztaPlayer Rádió Import — 60k Radio Stations API (RapidAPI)
Letölti a magyar rádióállomásokat és betölti a radio_stations táblába.
"""
import asyncio
import logging
import os
import sys

import httpx
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import async_session_factory
from app.models.models import RadioStationModel
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] 📻 %(message)s")
logger = logging.getLogger("import_radio")

RAPIDAPI_KEY = settings.RAPIDAPI_KEY
if not RAPIDAPI_KEY:
    raise RuntimeError("Missing RAPIDAPI_KEY in .env — a rádió import nem fut RAPIDAPI_KEY nélkül")
RAPIDAPI_HOST = "60k-radio-stations.p.rapidapi.com"
API_BASE = "https://60k-radio-stations.p.rapidapi.com"
COUNTRY = "Hungary"
HEADERS = {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": RAPIDAPI_HOST,
}


async def fetch_page(page: int, limit: int = 60) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{API_BASE}/countries/{COUNTRY}/radios",
            params={"page": page, "limit": limit},
            headers=HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


def pick_best_stream(streams: list[dict]) -> tuple[str, str, int]:
    """Pick best stream: HTTPS first, then highest bitrate."""
    working = [s for s in streams if s.get("works")]
    if not working:
        return "", "", 0
    # Prefer HTTPS
    https_streams = [s for s in working if s.get("isHttps")]
    candidates = https_streams if https_streams else working
    best = max(candidates, key=lambda s: s.get("bitrate", 0))
    return best.get("url", ""), best.get("codec", ""), best.get("bitrate", 0)


async def main():
    logger.info("Fetching page 1 to get total...")
    first = await fetch_page(1, 60)
    total = first.get("meta", {}).get("total", 0)
    total_pages = first.get("meta", {}).get("totalPages", 1)
    logger.info("Total stations: %d, pages needed: %d", total, total_pages)

    all_stations = []
    for page in range(1, total_pages + 1):
        logger.info("Fetching page %d/%d...", page, total_pages)
        try:
            data = await fetch_page(page, 60)
            items = data.get("data") or []
            all_stations.extend(items)
            logger.info("  Got %d stations (running total: %d)", len(items), len(all_stations))
        except Exception as e:
            logger.error("  Failed page %d: %s", page, e)

    logger.info("Total fetched: %d stations", len(all_stations))

    imported = 0
    async with async_session_factory() as sess:
        for station in all_stations:
            stream_url, codec, bitrate = pick_best_stream(station.get("streams") or [])
            if not stream_url:
                continue

            tags_parts = []
            genre = station.get("genre") or {}
            if genre.get("text"):
                tags_parts.extend([t.strip() for t in genre["text"].split(" ") if t.strip()])
            for t in (genre.get("tags") or []):
                tags_parts.append(t)

            langs = station.get("languages") or []
            language = langs[0].get("name", "") if langs else ""

            try:
                async with sess.begin_nested():
                    stmt = pg_insert(RadioStationModel).values(
                        station_uuid=f"rapidapi_{station['id']}",
                        name=station.get("name", ""),
                        stream_url=stream_url,
                        favicon=station.get("logo", ""),
                        tags=",".join(tags_parts) if tags_parts else "",
                        country=station.get("location", {}).get("countryName", COUNTRY),
                        language=language,
                        codec=codec or "",
                        bitrate=bitrate or 0,
                        votes=station.get("popularity", {}).get("global", 0) or 0,
                        is_active=station.get("isActive", True),
                    ).on_conflict_do_update(
                        index_elements=['station_uuid'],
                        set_=dict(
                            name=station.get("name", ""),
                            stream_url=stream_url,
                            favicon=station.get("logo", ""),
                            tags=",".join(tags_parts) if tags_parts else "",
                            language=language,
                            codec=codec or "",
                            bitrate=bitrate or 0,
                            votes=station.get("popularity", {}).get("global", 0) or 0,
                            is_active=station.get("isActive", True),
                        ),
                    )
                    await sess.execute(stmt)
                imported += 1
            except Exception as e:
                logger.warning("  Skipping %s: %s", station.get("name", "?"), str(e)[:120])
        await sess.commit()

    logger.info("Imported %d stations into DB", imported)

    # Stats
    result = await sess.execute(
        text("SELECT COUNT(*) FROM radio_stations WHERE is_active = true")
    )
    logger.info("Total active radio stations in DB: %d", result.scalar())


if __name__ == "__main__":
    asyncio.run(main())

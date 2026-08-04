"""Bulk ICY meta checker — standalone script.
Eredmény Redis-ben cache-elve 7 napig, a WP plugin /admin/radio táblázata
automatikusan mutatja a ✅/❌ jeleket a cache-ből.

Futtatás: docker compose exec fastapi python /app/scripts/check_radio_icy.py
"""
import sys; sys.path.insert(0, "/app")
import asyncio, json, time
from sqlalchemy import select
from app.database import async_session_factory
from app.models.models import RadioStationModel
from app.core.icy_meta import fetch_metadata_with_fallback
from app.redis import get_redis

ICY_CACHE_TTL = 604800  # 7 nap


async def main():
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.is_active == True)
        )
        stations = result.scalars().all()

    if not stations:
        print("No active stations found.")
        return

    r = await get_redis()
    cache_keys = [f"icy:check:{s.station_uuid}" for s in stations]
    cached = await r.mget(cache_keys)
    cached_set = {stations[i].station_uuid for i, d in enumerate(cached) if d}

    checked = with_meta = without_meta = 0
    skipped = len(cached_set)
    total = len(stations)
    to_check = total - skipped

    print(f"Total: {total}, already cached: {skipped}, to check: {to_check}")
    if to_check == 0:
        print("All stations already cached. Done.")
        return

    for s in stations:
        if s.station_uuid in cached_set:
            continue
        n = checked + 1
        print(f"[{n}/{to_check}] {s.name}")
        try:
            meta = await fetch_metadata_with_fallback(s.stream_url)
            title = meta.get("title", "")
            await r.setex(f"icy:check:{s.station_uuid}", ICY_CACHE_TTL,
                          json.dumps({"has_meta": bool(title), "title": title, "ts": int(time.time())}))
            checked += 1
            if title:
                with_meta += 1
            else:
                without_meta += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            without_meta += 1
            checked += 1

    print(f"\nDone. Total: {total}, Checked: {checked}, Cached(skipped): {skipped}, With meta: {with_meta}, Without: {without_meta}")


if __name__ == "__main__":
    asyncio.run(main())

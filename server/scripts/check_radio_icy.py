"""Bulk ICY meta checker — standalone script.
Eredmény a radio_stations táblába mentve (icy_meta_title, icy_meta_checked_at).
A WP plugin /admin/radio táblázata automatikusan mutatja a ✅/❌ jeleket.

Futtatás: docker compose exec fastapi python /app/scripts/check_radio_icy.py
"""
import sys; sys.path.insert(0, "/app")
import asyncio, time
from datetime import datetime, timezone
from sqlalchemy import select, update, text
from app.database import async_session_factory
from app.models.models import RadioStationModel
from app.core.icy_meta import fetch_metadata_with_fallback

from app.core.constants import ICY_CHECK_TTL


async def main():
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.is_active == True)
        )
        stations = result.scalars().all()

    if not stations:
        print("No active stations found.")
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    total = len(stations)
    cached = skipped = 0
    checked = with_meta = without_meta = 0

    print(f"Total: {total}")

    for s in stations:
        # Skip if already checked within 7 days
        if s.icy_meta_checked_at and (now - s.icy_meta_checked_at).total_seconds() < ICY_CHECK_TTL:
            skipped += 1
            continue

        n = checked + 1
        print(f"[{n}/{total - skipped}] {s.name}")
        try:
            meta = await asyncio.wait_for(
                fetch_metadata_with_fallback(s.stream_url),
                timeout=15.0,
            )
            title = meta.get("title", "")
            checked += 1
            if title:
                with_meta += 1
            else:
                without_meta += 1
        except asyncio.TimeoutError:
            print("  TIMEOUT (15s)")
            title = ""
            without_meta += 1
            checked += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            title = ""
            without_meta += 1
            checked += 1

        # Persist to DB
        try:
            async with async_session_factory() as sess:
                stmt = (
                    update(RadioStationModel)
                    .where(RadioStationModel.station_uuid == s.station_uuid)
                    .values(icy_meta_title=title or None, icy_meta_checked_at=now)
                )
                await sess.execute(stmt)
                await sess.commit()
        except Exception as e:
            print(f"  DB SAVE ERROR: {e}")

    print(f"\nDone. Total: {total}, Checked: {checked}, Skipped(cached): {skipped}, With meta: {with_meta}, Without: {without_meta}")


if __name__ == "__main__":
    asyncio.run(main())

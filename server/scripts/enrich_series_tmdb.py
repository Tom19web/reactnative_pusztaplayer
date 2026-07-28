"""
Sorozatok TMDB ID feltöltése cím alapján kereséssel.

A series táblában lévő 2056 sorozaton végigmegy,
cím alapján TMDB keresést végez, és beállítja a tmdb_id mezőt.

Futtatás:
  docker compose exec fastapi python /app/scripts/enrich_series_tmdb.py
"""

import sys; sys.path.insert(0, "/app")
import asyncio, time
from sqlalchemy import select, update
from app.database import async_session_factory
from app.models.models import SeriesModel
from app.services.tmdb_client import search_series

CHECKPOINT_FILE = "/app/scripts/enrich_series_tmdb_checkpoint.txt"
TMDB_RATE_LIMIT = 0.3
COMMIT_EVERY = 50
CHECKPOINT_EVERY = 100


def save_checkpoint(index: int):
    with open(CHECKPOINT_FILE, "w") as f:
        f.write(str(index))


def load_checkpoint() -> int:
    try:
        with open(CHECKPOINT_FILE) as f:
            return int(f.read().strip())
    except:
        return 0


async def main():
    print("=" * 60)
    print("  PusztaPlayer — Sorozat TMDB ID feltöltés")
    print("=" * 60)

    async with async_session_factory() as session:
        all_series = (await session.execute(
            select(SeriesModel).where(SeriesModel.tmdb_id == 0).order_by(SeriesModel.id)
        )).scalars().all()

    print(f"  {len(all_series)} sorozat TMDB ID nélkül")
    print()

    checkpoint = load_checkpoint()
    if checkpoint > 0:
        print(f"  [CHECKPOINT] Folytatás: {checkpoint}. sorozattól")
        print()

    enriched = 0
    not_found = 0
    start_time = time.time()

    async with async_session_factory() as session:
        for si, series in enumerate(all_series):
            if si < checkpoint:
                continue

            title = series.title.strip() if series.title else ""
            if not title:
                not_found += 1
                continue

            result = await search_series(title)
            await asyncio.sleep(TMDB_RATE_LIMIT)

            if result and result.get("id"):
                tmdb_id = result["id"]
                result_name = result.get("name", "?")
                try:
                    await session.execute(
                        update(SeriesModel)
                        .where(SeriesModel.id == series.id)
                        .values(tmdb_id=tmdb_id)
                    )
                    enriched += 1
                    if (si + 1) % 10 == 0 or enriched <= 5:
                        print(f"  [{si+1}/{len(all_series)}] {title[:50]:50s} → TMDB:{tmdb_id} ({result_name[:30]})")
                except Exception as e:
                    print(f"  [ERR] {title[:50]}: {e}")
            else:
                not_found += 1

            if enriched > 0 and enriched % COMMIT_EVERY == 0:
                await session.commit()

            if (si + 1) % CHECKPOINT_EVERY == 0:
                await session.commit()
                save_checkpoint(si + 1)
                elapsed = time.time() - start_time
                print(f"  [CHECKPOINT] {si+1}/{len(all_series)}, {enriched} enriched, {elapsed:.0f}s")

        await session.commit()

    elapsed = time.time() - start_time
    print()
    print("=" * 60)
    print(f"  KÉSZ: {enriched} sorozathoz TMDB ID beállítva")
    print(f"  Nem talált: {not_found}")
    print(f"  Idő: {elapsed:.0f}s ({elapsed/60:.1f} perc)")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())

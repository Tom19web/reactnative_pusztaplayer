"""
Sorozatok TMDB ID feltöltése — v2: több keresési próbálkozás.

3 próbálkozás sorozatonként:
  1. Eredeti cím, language="hu"
  2. Tisztított cím (év, FHD/HD/SD/4K nélkül), language="hu"
  3. Tisztított cím első fele, language="en"

Futtatás:
  docker compose exec fastapi python /app/scripts/enrich_series_tmdb_v2.py
"""

import sys; sys.path.insert(0, "/app")
import asyncio, time, re
from sqlalchemy import select, update
from app.database import async_session_factory
from app.models.models import SeriesModel
from app.services.tmdb_client import search_series

CHECKPOINT_FILE = "/app/scripts/enrich_series_tmdb_v2_checkpoint.txt"
TMDB_RATE_LIMIT = 0.3
COMMIT_EVERY = 50
CHECKPOINT_EVERY = 100

# Regexek a cím tisztításához
RE_YEAR = re.compile(r"\s*\(\d{4}\)\s*$")           # "Film (2026)" → "Film"
RE_YEAR_START = re.compile(r"\d{4}\s*:\s*")          # "2026: Film" → "Film"
RE_QUALITY = re.compile(r"\s*(FHD|HD|SD|4K|UHD|1080p|720p)\s*$", re.IGNORECASE)  # "Film HD" → "Film"
RE_BRACKET = re.compile(r"\s*\(.*?\)\s*")            # "Film (Director's Cut)" → "Film"
RE_SEPARATORS = re.compile(r"\s*[;:\-\–,|]\s*")       # split ezeknél


def clean_title(title: str) -> str:
    """Tisztított cím: évszám, minőségi suffix nélkül."""
    t = title.strip()
    t = RE_YEAR.sub("", t)
    t = RE_YEAR_START.sub("", t)
    t = RE_QUALITY.sub("", t)
    t = t.strip()
    return t


def first_part(title: str) -> str:
    """Cím első értelmes része a szeparátorok előtt."""
    parts = RE_SEPARATORS.split(title)
    for part in parts:
        p = part.strip()
        if len(p) > 3:
            return p
    return title


def save_checkpoint(index: int):
    with open(CHECKPOINT_FILE, "w") as f:
        f.write(str(index))


def load_checkpoint() -> int:
    try:
        with open(CHECKPOINT_FILE) as f:
            return int(f.read().strip())
    except:
        return 0


async def try_search(title: str, lang: str, attempt_name: str) -> dict | None:
    """Egy keresési próbálkozás."""
    result = await search_series(title, lang)
    if result and result.get("id"):
        return result
    return None


async def main():
    print("=" * 60)
    print("  PusztaPlayer — Sorozat TMDB ID feltöltés v2")
    print("  (többszörös keresési próbálkozással)")
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

            title = (series.title or "").strip()
            if not title:
                not_found += 1
                continue

            found = None

            # Próbálkozás 1: eredeti cím, hu
            found = await search_series(title)
            attempt = 1
            await asyncio.sleep(TMDB_RATE_LIMIT)

            # Próbálkozás 2: tiszta cím, hu
            if not found or not found.get("id"):
                clean = clean_title(title)
                if clean and clean != title:
                    found = await search_series(clean)
                    attempt = 2
                    await asyncio.sleep(TMDB_RATE_LIMIT)

            # Próbálkozás 3: első rész, en
            if not found or not found.get("id"):
                fp = first_part(title)
                if fp and fp != title:
                    found = await search_series(fp, "en")
                    attempt = 3
                    await asyncio.sleep(TMDB_RATE_LIMIT)

            if found and found.get("id"):
                tmdb_id = found["id"]
                result_name = found.get("name", "?")
                try:
                    await session.execute(
                        update(SeriesModel)
                        .where(SeriesModel.id == series.id)
                        .values(tmdb_id=tmdb_id)
                    )
                    enriched += 1
                    tags = ["hu-eredeti", "hu-tiszta", "en-elso"][attempt - 1]
                    if (si + 1) % 20 == 0 or enriched <= 10:
                        print(f"  [{si+1}/{len(all_series)}] {title[:40]:40s} → TMDB:{tmdb_id} ({result_name[:25]}) [{tags}]")
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

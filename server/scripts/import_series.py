"""
Sorozatok importalasa Xtream API-rol + embedding generalas.

Futtatas:
  docker compose exec -e OPENAI_API_KEY=... fastapi python /app/scripts/import_series.py
"""

import sys; sys.path.insert(0, "/app")
import asyncio, os, time, httpx
from datetime import datetime, timedelta
from sqlalchemy import select

from app.database import async_session_factory
from app.models.models import SeriesModel
from app.config import settings

XTREAM_URL = "https://live.pusztaplay.eu/player_api.php"
USERNAME = settings.XTREAM_USERNAME
PASSWORD = settings.XTREAM_PASSWORD
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")
CHECKPOINT_FILE = "/app/scripts/import_series_checkpoint.txt"

RATE_LIMIT_S = 0.15
TMDB_RATE_LIMIT = 0.3
COMMIT_EVERY = 20
CHECKPOINT_EVERY = 50


def save_checkpoint(index: int):
    with open(CHECKPOINT_FILE, "w") as f:
        f.write(str(index))


def load_checkpoint() -> int:
    try:
        with open(CHECKPOINT_FILE) as f:
            return int(f.read().strip())
    except:
        return 0


async def embed_text(text: str) -> list[float] | None:
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{OPENAI_URL}/v1/embeddings",
                    headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
                    json={"model": "text-embedding-3-small", "input": text},
                )
                resp.raise_for_status()
                return resp.json()["data"][0]["embedding"]
        except Exception as e:
            if attempt == 2:
                print(f"  [EMBED ERR] {str(e)[:100]}")
                return None
            await asyncio.sleep(2)


async def main():
    if not OPENAI_KEY:
        print("HIBA: OPENAI_API_KEY nincs beallitva!")
        return

    print("=" * 60)
    print("  PusztaPlayer — Sorozat Import Xtream API-rol")
    print("=" * 60)
    print(f"  Xtream URL:  {XTREAM_URL}")
    print()

    checkpoint = load_checkpoint()
    if checkpoint > 0:
        print(f"  [CHECKPOINT] Folytatas: {checkpoint}. sorozattol")
        print()

    print("[1/2] Xtream series lekerese...")
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.get(
            f"{XTREAM_URL}?username={USERNAME}&password={PASSWORD}&action=get_series"
        )
        resp.raise_for_status()
        series_data = resp.json()
    print(f"  {len(series_data)} sorozat a valaszban")

    print()
    print(f"[2/2] Embedding generalas es import (rate: {1/RATE_LIMIT_S:.0f}/mp)...")
    total = len(series_data)
    imported = 0
    skipped = 0
    errors = 0
    start_time = time.time()

    async with async_session_factory() as session:
        for i, item in enumerate(series_data):
            if i < checkpoint:
                continue

            title = (item.get("name") or "").strip()
            sid = item.get("series_id", 0)
            plot = (item.get("plot") or "").strip()
            genre = (item.get("genre") or "").strip()
            cast = (item.get("cast") or "").strip()
            director = (item.get("director") or "").strip()
            rating = str(item.get("rating", ""))
            cover = item.get("cover", "")
            year = str(item.get("year", item.get("release_date", "")))

            if not title or sid == 0:
                continue

            exists = await session.execute(
                select(SeriesModel.series_id).where(SeriesModel.series_id == sid)
            )
            if exists.scalar_one_or_none():
                skipped += 1
                if i % COMMIT_EVERY == 0:
                    await session.commit()
                continue

            embed_text_content = f"Title: {title}. Year: {year}. Genres: {genre}. Plot: {plot}"
            embedding = await embed_text(embed_text_content)
            await asyncio.sleep(RATE_LIMIT_S)

            if embedding is None:
                errors += 1
                continue

            try:
                series = SeriesModel(
                    series_id=sid,
                    title=title,
                    year=year,
                    plot=plot,
                    genre=genre,
                    cast=cast,
                    director=director,
                    rating=rating,
                    tmdb_id=0,
                    cover=cover,
                    embedding=embedding,
                    meta={"source": "xtream_series"},
                )
                session.add(series)
                imported += 1

                if not plot or len(plot) < 50:
                    await try_tmdb_enrich(session, series, title)

                if imported % COMMIT_EVERY == 0:
                    await session.commit()

                if imported % CHECKPOINT_EVERY == 0:
                    save_checkpoint(i + 1)

            except Exception as e:
                await session.rollback()
                errors += 1

            if (i + 1) % 100 == 0:
                pct = (i + 1) / total * 100
                elapsed = time.time() - start_time
                eta = (elapsed / (i + 1 - checkpoint)) * (total - i - 1)
                print(f"  [{i+1}/{total} {pct:.0f}%] +{imported} uj, {skipped} skip, {errors} err | ETA: {timedelta(seconds=int(eta))}")

        await session.commit()
        save_checkpoint(total)

    elapsed = time.time() - start_time
    print()
    print("=" * 60)
    print(f"  KESZ! {imported} uj sorozat, {skipped} atugorva, {errors} hiba")
    print(f"  Ido: {timedelta(seconds=int(elapsed))}")
    print("=" * 60)


async def try_tmdb_enrich(session, series: SeriesModel, title: str):
    """TMDB kereses a sorozatra, ha nincs plot az Xtream-bol."""
    try:
        from app.services.tmdb_client import search_series, get_series_detail
        await asyncio.sleep(TMDB_RATE_LIMIT)
        result = await search_series(title)
        if result:
            tmdb_id = result.get("id", 0)
            if tmdb_id:
                series.tmdb_id = tmdb_id
                if not series.plot or len(series.plot) < 50:
                    detail = await get_series_detail(tmdb_id)
                    if detail and detail.get("overview"):
                        series.plot = detail["overview"]
                        session.add(series)
    except Exception:
        pass


asyncio.run(main())

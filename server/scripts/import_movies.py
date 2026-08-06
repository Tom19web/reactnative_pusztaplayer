"""
Filmek importalasa Xtream API-rol + embedding generalas.

Futtatas:
  docker compose exec -e OPENAI_API_KEY=... fastapi python /app/scripts/import_movies.py
"""

import sys; sys.path.insert(0, "/app")
import asyncio, os, time, json, httpx
from datetime import datetime, timedelta
from sqlalchemy import select

from app.database import async_session_factory
from app.models.models import MovieModel
from app.config import settings

XTREAM_URL = f"{settings.XTREAM_API_BASE}/player_api.php"
USERNAME = settings.XTREAM_USERNAME
PASSWORD = settings.XTREAM_PASSWORD
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")
CHECKPOINT_FILE = "/app/scripts/import_movies_checkpoint.txt"

RATE_LIMIT_S = 0.15
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
    print("  PusztaPlayer — Film Import Xtream API-rol")
    print("=" * 60)
    print(f"  Xtream URL:  {XTREAM_URL}")
    print(f"  OpenAI:      {OPENAI_URL}")
    print()

    checkpoint = load_checkpoint()
    if checkpoint > 0:
        print(f"  [CHECKPOINT] Folytatas: {checkpoint}. filmtol")
        print()

    print("[1/2] Xtream VOD streamek lekerese...")
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.get(
            f"{XTREAM_URL}?username={USERNAME}&password={PASSWORD}&action=get_vod_streams"
        )
        resp.raise_for_status()
        vod_data = resp.json()
    print(f"  {len(vod_data)} film a valaszban")

    print()
    print(f"[2/2] Embedding generalas es import (rate: {1/RATE_LIMIT_S:.0f}/mp)...")
    total = len(vod_data)
    imported = 0
    skipped = 0
    errors = 0
    start_time = time.time()
    batch = 0

    async with async_session_factory() as session:
        for i, item in enumerate(vod_data):
            if i < checkpoint:
                continue

            title = (item.get("name") or item.get("title") or "").strip()
            year = str(item.get("year", ""))
            stream_id = item.get("stream_id", 0)
            plot = (item.get("plot") or "").strip()
            genre = (item.get("genre") or "").strip()
            cast = (item.get("cast") or "").strip()
            director = (item.get("director") or "").strip()
            rating = str(item.get("rating", ""))
            icon = item.get("stream_icon", "")

            if not title or stream_id == 0:
                continue

            # Skip if already imported
            exists = await session.execute(
                select(MovieModel.stream_id).where(MovieModel.stream_id == stream_id)
            )
            if exists.scalar_one_or_none():
                skipped += 1
                batch += 1
                if batch % COMMIT_EVERY == 0:
                    await session.commit()
                if i % 100 == 0 and skipped > 0:
                    pct = (i + 1) / total * 100
                    elapsed = time.time() - start_time
                    eta = (elapsed / (i + 1 - checkpoint)) * (total - i - 1)
                    print(f"  [{i+1}/{total} {pct:.0f}%] +{imported} uj, {skipped} skip, {errors} err | ETA: {timedelta(seconds=int(eta))}")
                continue

            # Generate embedding
            embed_text_content = f"Title: {title}. Year: {year}. Genres: {genre}. Plot: {plot}"
            embedding = await embed_text(embed_text_content)
            await asyncio.sleep(RATE_LIMIT_S)

            if embedding is None:
                errors += 1
                batch += 1
                continue

            try:
                movie = MovieModel(
                    title=title,
                    year=year,
                    stream_id=stream_id,
                    plot=plot,
                    genre=genre,
                    cast=cast,
                    director=director,
                    rating=rating,
                    poster_full=icon,
                    embedding=embedding,
                    meta={"source": "xtream_vod"},
                )
                session.add(movie)
                imported += 1
                batch += 1

                if batch % COMMIT_EVERY == 0:
                    await session.commit()

                if imported % CHECKPOINT_EVERY == 0:
                    save_checkpoint(i + 1)

            except Exception as e:
                await session.rollback()
                errors += 1
                batch += 1

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
    print(f"  KESZ! {imported} uj film, {skipped} atugorva, {errors} hiba")
    print(f"  Ido: {timedelta(seconds=int(elapsed))}")
    print("=" * 60)


asyncio.run(main())

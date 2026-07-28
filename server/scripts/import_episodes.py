"""
Epizódok importálása TMDB API-ról + embedding generálás (Optimális verzió).
Futtatás:
  docker compose exec -e OPENAI_API_KEY=... fastapi python /app/scripts/import_episodes.py
"""

import sys; sys.path.insert(0, "/app")
import asyncio, os, time, httpx
from sqlalchemy import select
from app.database import async_session_factory
from app.models.models import SeriesModel, EpisodeModel
from app.services.tmdb_client import get_series_detail

OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")
TMDB_KEY = os.getenv("TMDB_API_KEY", "")
CHECKPOINT_FILE = "/app/scripts/import_episodes_checkpoint.txt"

RATE_LIMIT_S = 0.05
TMDB_RATE_LIMIT = 0.15
COMMIT_EVERY = 50
CHECKPOINT_EVERY = 20


def save_checkpoint(index: int):
    with open(CHECKPOINT_FILE, "w") as f:
        f.write(str(index))


def load_checkpoint() -> int:
    try:
        with open(CHECKPOINT_FILE) as f:
            return int(f.read().strip())
    except Exception:
        return 0


async def embed_text(client: httpx.AsyncClient, text: str) -> list[float] | None:
    """OpenAI text-embedding-3-small hívás újrahasznosított klienssel."""
    if not OPENAI_KEY:
        return None
    for attempt in range(3):
        try:
            resp = await client.post(
                f"{OPENAI_URL}/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {OPENAI_KEY}",
                    "Content-Type": "application/json",
                },
                json={"model": "text-embedding-3-small", "input": text},
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]
        except Exception as e:
            if attempt == 2:
                print(f"   [EMBED ERR] {str(e)[:100]}")
                return None
            await asyncio.sleep(1.5)


async def get_tmdb_season(client: httpx.AsyncClient, series_tmdb_id: int, season_num: int) -> dict | None:
    """Egy EGÉSZ ÉVAD epizódjainak lekérése 1etlen HTTP kéréssel."""
    url = f"https://api.themoviedb.org/3/tv/{series_tmdb_id}/season/{season_num}"
    try:
        resp = await client.get(url, params={"api_key": TMDB_KEY, "language": "hu-HU"})
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


async def main():
    if not OPENAI_KEY:
        print("HIBA: OPENAI_API_KEY nincs beállítva!")
        return

    print("=" * 60)
    print("  PusztaPlayer — Epizód Import TMDB API-ról (Optimálva)")
    print("=" * 60)

    async with async_session_factory() as session:
        all_series = (await session.execute(
            select(SeriesModel).where(SeriesModel.tmdb_id != 0).order_by(SeriesModel.id)
        )).scalars().all()

        print(f"  {len(all_series)} sorozat TMDB ID-vel")

        checkpoint = load_checkpoint()
        if checkpoint > 0:
            print(f"  [CHECKPOINT] Folytatás: {checkpoint}. sorozattól")

        print("  Meglévő epizódok betöltése...")
        existing = await session.execute(
            select(EpisodeModel.series_id, EpisodeModel.season, EpisodeModel.episode)
        )
        batch_keys = {(row.series_id, row.season, row.episode) for row in existing}
        print(f"  {len(batch_keys)} epizód már létezik, ezeket kihagyjuk\n")

    imported = 0
    skipped = 0
    errors = 0
    start_time = time.time()

    async with httpx.AsyncClient(timeout=30.0) as http_client:
        async with async_session_factory() as session:
            for si, series in enumerate(all_series):
                if si < checkpoint:
                    continue

                detail = await get_series_detail(series.tmdb_id)
                await asyncio.sleep(TMDB_RATE_LIMIT)

                if not detail or not detail.get("seasons"):
                    continue

                seasons = detail["seasons"]
                series_name = series.title or f"TMDB:{series.tmdb_id}"
                print(f"[{si+1}/{len(all_series)}] {series_name} ({len(seasons)} évad)")

                for season_data in seasons:
                    snum = season_data.get("season_number", 0)
                    if snum <= 0:
                        continue

                    # Egész évad lekérése 1 kéréssel!
                    season_detail = await get_tmdb_season(http_client, series.tmdb_id, snum)
                    await asyncio.sleep(TMDB_RATE_LIMIT)

                    if not season_detail or "episodes" not in season_detail:
                        continue

                    for ep_data in season_detail["episodes"]:
                        epnum = ep_data.get("episode_number", 0)
                        ep_key = (series.series_id, snum, epnum)

                        if ep_key in batch_keys:
                            skipped += 1
                            continue

                        ep_title = (ep_data.get("name") or "").strip()
                        ep_plot = (ep_data.get("overview") or "").strip()
                        ep_air = ep_data.get("air_date", "")

                        if not ep_plot and not ep_title:
                            errors += 1
                            continue

                        embed_input = f"Title: {ep_title}. Plot: {ep_plot}"
                        embedding = await embed_text(http_client, embed_input)
                        await asyncio.sleep(RATE_LIMIT_S)

                        if embedding is None:
                            errors += 1
                            continue

                        # Biztonságos Hozzáadás
                        session.add(EpisodeModel(
                            series_id=series.series_id,
                            title=ep_title,
                            season=snum,
                            episode=epnum,
                            plot=ep_plot,
                            air_date=ep_air,
                            embedding=embedding,
                        ))
                        batch_keys.add(ep_key)
                        imported += 1

                        if imported > 0 and imported % COMMIT_EVERY == 0:
                            await session.commit()
                            print(f"   ... {imported} epizód importálva (commit)")

                if (si + 1) % CHECKPOINT_EVERY == 0:
                    await session.commit()
                    save_checkpoint(si + 1)
                    elapsed = time.time() - start_time
                    print(f"  [CHECKPOINT] {si+1}/{len(all_series)} sorozat feldolgozva ({elapsed:.0f}s)")

            await session.commit()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print(f"  KÉSZ: {imported} epizód importálva")
    print(f"  Skipped: {skipped} | Errors: {errors}")
    print(f"  Összes idő: {elapsed:.0f}s ({elapsed/60:.1f} perc)")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
"""
Backfill üres epizód plotok — angol fallback a TMDB-ről.

Az import_episodes.py csak hu-HU nyelven kérte le a TMDB adatot,
ezért rengeteg epizódnak üres a plot mezője (100k+ sor). Ez a script:
  1. Megkeresi az üres plotú epizódokat (sorozat+évad szerint csoportosítva)
  2. Lekéri a TMDB évadot angolul (language=en-US)
  3. UPDATE az üres plotokat az angol overview-val

Csak a TMDB_API_KEY-re van szüksége (nincs OpenAI/DeepSeek függőség).

Futtatás:
  docker compose exec fastapi python /app/scripts/backfill_episode_plots.py
  docker compose exec fastapi python /app/scripts/backfill_episode_plots.py --dry-run
  docker compose exec fastapi python /app/scripts/backfill_episode_plots.py --language en-US
"""
import argparse
import asyncio
import os
import sys
import time

import httpx
from sqlalchemy import select, update, or_

sys.path.insert(0, "/app")

from app.config import settings
from app.database import async_session_factory
from app.models.models import EpisodeModel, SeriesModel

TMDB_KEY = settings.TMDB_API_KEY
TMDB_RATE_LIMIT = 0.15
COMMIT_EVERY = 50
CHECKPOINT_EVERY = 100
CHECKPOINT_FILE = "/app/scripts/backfill_episode_plots_checkpoint.txt"

BASE_URL = "https://api.themoviedb.org/3"


def save_checkpoint(index: int):
    with open(CHECKPOINT_FILE, "w") as f:
        f.write(str(index))


def load_checkpoint() -> int:
    try:
        with open(CHECKPOINT_FILE) as f:
            return int(f.read().strip())
    except Exception:
        return 0


async def fetch_season(
    client: httpx.AsyncClient, tmdb_id: int, season: int, language: str
) -> dict | None:
    """Egy évad epizódjainak lekérése egyetlen HTTP kéréssel."""
    url = f"{BASE_URL}/tv/{tmdb_id}/season/{season}"
    try:
        resp = await client.get(url, params={"api_key": TMDB_KEY, "language": language})
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None


async def main(args: argparse.Namespace) -> None:
    if not TMDB_KEY:
        print("HIBA: TMDB_API_KEY nincs beállítva!")
        return

    print("=" * 60)
    print("  PusztaPlayer — Epizód Plot Backfill (angol fallback)")
    print("=" * 60)

    # 1. Üres plotú epizódok összegyűjtése (tmdb_id + season szerint)
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(
                EpisodeModel.id,
                EpisodeModel.season,
                EpisodeModel.episode,
                SeriesModel.tmdb_id,
            )
            .join(SeriesModel, EpisodeModel.series_id == SeriesModel.series_id)
            .where(
                or_(EpisodeModel.plot.is_(None), EpisodeModel.plot == ""),
                SeriesModel.tmdb_id.isnot(None),
                SeriesModel.tmdb_id != 0,
            )
            .order_by(SeriesModel.tmdb_id, EpisodeModel.season, EpisodeModel.episode)
        )).all()

    print(f"  {len(rows)} üres plotú epizód")

    # (tmdb_id, season) → [(ep_id, ep_num)]
    groups: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for ep_id, season, ep_num, tmdb_id in rows:
        if tmdb_id is None:
            continue
        groups.setdefault((int(tmdb_id), int(season)), []).append((int(ep_id), int(ep_num)))

    print(f"  {len(groups)} egyedi (sorozat, évad) csoport")
    print(f"  Nyelv: {args.language}\n")

    checkpoint = load_checkpoint()
    if checkpoint > 0:
        print(f"  [CHECKPOINT] Folytatás: {checkpoint}. csoporttól\n")

    group_items = sorted(groups.items())

    filled = 0
    failed = 0
    start_time = time.time()

    async with httpx.AsyncClient(timeout=30.0) as client:
        async with async_session_factory() as session:
            for gi, ((tmdb_id, season), eps) in enumerate(group_items):
                if gi < checkpoint:
                    continue

                season_detail = await fetch_season(client, tmdb_id, season, args.language)
                await asyncio.sleep(TMDB_RATE_LIMIT)

                if not season_detail or "episodes" not in season_detail:
                    failed += 1
                    continue

                # episode_num → overview
                overview_map: dict[int, str] = {}
                for ep_data in season_detail["episodes"]:
                    ep_num = ep_data.get("episode_number", 0)
                    overview = (ep_data.get("overview") or "").strip()
                    if ep_num and overview:
                        overview_map[int(ep_num)] = overview

                if not overview_map:
                    failed += 1
                    continue

                for ep_id, ep_num in eps:
                    overview = overview_map.get(ep_num, "")
                    if not overview:
                        continue
                    if args.dry_run:
                        filled += 1
                        continue
                    await session.execute(
                        update(EpisodeModel)
                        .where(EpisodeModel.id == ep_id)
                        .values(plot=overview)
                    )
                    filled += 1

                if not args.dry_run and (gi + 1) % COMMIT_EVERY == 0:
                    await session.commit()
                    print(f"   ... {filled} plot kitöltve (commit)")

                if (gi + 1) % CHECKPOINT_EVERY == 0:
                    if not args.dry_run:
                        await session.commit()
                        save_checkpoint(gi + 1)
                    elapsed = time.time() - start_time
                    print(f"  [CHECKPOINT] {gi+1}/{len(group_items)} csoport, {filled} plot, {elapsed:.0f}s")

            if not args.dry_run:
                await session.commit()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    tag = "[DRY]" if args.dry_run else ""
    print(f"  {tag} KÉSZ: {filled} plot kitöltve, {failed} csoport sikertelen")
    print(f"  Idő: {elapsed:.0f}s ({elapsed/60:.1f} perc)")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Epizód plot backfill (angol fallback).")
    parser.add_argument("--dry-run", action="store_true", help="Csak számol, nem ír DB-be.")
    parser.add_argument("--language", type=str, default="en-US", help="TMDB nyelv (default: en-US).")
    asyncio.run(main(parser.parse_args()))

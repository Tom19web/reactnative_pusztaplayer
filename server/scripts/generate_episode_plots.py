"""
Üres epizód plotok generálása DeepSeek-kel.

Azok az epizódok, amiknek a TMDB-n sincs (se hu, se en) overview-ja,
kapnak egy rövid magyar plotot a címük + sorozat címük alapján.

A generikus címeket ("1. rész", "Episode 3", "S01E01", sima számok)
kihagyjuk — azokra nem lehet értelmes plotot írni.

Csak a plot mezőt tölti (az embeddinget NEM — az külön OpenAI pass lenne).

Futtatás:
  docker compose exec fastapi python /app/scripts/generate_episode_plots.py
  docker compose exec fastapi python /app/scripts/generate_episode_plots.py --dry-run
"""
import argparse
import asyncio
import re
import sys
import time

sys.path.insert(0, "/app")

from sqlalchemy import select, update, or_

from app.database import async_session_factory
from app.models.models import EpisodeModel, SeriesModel
from app.services.deepseek_client import call_deepseek

BATCH_SIZE = 20
RATE_LIMIT_S = 0.5
CHECKPOINT_FILE = "/app/scripts/generate_episode_plots_checkpoint.txt"


def is_generic_title(title: str) -> bool:
    """True, ha a cím generikus (pl. '1. rész', 'Episode 3', 'S01E01', '12')."""
    t = (title or "").strip().lower()
    if not t:
        return True
    if re.match(r"^\d+\s*[\.\)\-:]*\s*(rész|resz|epizód|epizod|episode|folge|featurette|bonus)\b", t):
        return True
    if re.match(r"^(rész|resz|epizód|epizod|episode|folge|featurette|bonus)\s*[\.\)\-:]*\s*\d+", t):
        return True
    if re.match(r"^s\d+\s*e\d+$", t):
        return True
    if re.match(r"^\d+$", t):
        return True
    return False


def save_checkpoint(index: int):
    with open(CHECKPOINT_FILE, "w") as f:
        f.write(str(index))


def load_checkpoint() -> int:
    try:
        with open(CHECKPOINT_FILE) as f:
            return int(f.read().strip())
    except Exception:
        return 0


async def main(args: argparse.Namespace) -> None:
    print("=" * 60)
    print("  PusztaPlayer — Epizód Plot Generálás (DeepSeek)")
    print("=" * 60)

    # 1. Üres plotú epizódok + sorozat cím
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(
                EpisodeModel.id,
                EpisodeModel.title,
                EpisodeModel.season,
                EpisodeModel.episode,
                SeriesModel.title,
            )
            .join(SeriesModel, EpisodeModel.series_id == SeriesModel.series_id)
            .where(or_(EpisodeModel.plot.is_(None), EpisodeModel.plot == ""))
            .order_by(EpisodeModel.id)
        )).all()

    print(f"  {len(rows)} üres plotú epizód")

    # 2. Generikus címek kihagyása
    meaningful = []
    for ep_id, title, season, ep_num, series_title in rows:
        if is_generic_title(title):
            continue
        meaningful.append((ep_id, title, season, ep_num, series_title))

    print(f"  {len(meaningful)} értelmes című (generikus kihagyva: {len(rows) - len(meaningful)})")

    if not meaningful:
        print("  Nincs mit generálni.")
        return

    checkpoint = load_checkpoint()
    if checkpoint > 0:
        print(f"  [CHECKPOINT] Folytatás: {checkpoint}. epizódtól")
        meaningful = meaningful[checkpoint:]

    total = len(meaningful)
    start_time = time.time()
    generated = 0
    failed = 0

    system_prompt = (
        "You are a TV episode plot writer for a Hungarian IPTV app. "
        "Write a short 1-2 sentence Hungarian plot summary for each episode below, "
        "based ONLY on the series title and the episode title. "
        "Do not invent specific characters, actors, or plot details that are not implied by the titles. "
        "Keep it generic but natural. "
        'Return ONLY JSON: {"plots": {"<episode_id>": "plot text", ...}}'
    )

    for i in range(0, total, BATCH_SIZE):
        batch = meaningful[i : i + BATCH_SIZE]

        lines = []
        for ep_id, title, season, ep_num, series_title in batch:
            lines.append(f"{ep_id}|{series_title or '?'}|S{season}E{ep_num}|{title}")

        if args.dry_run:
            generated += len(batch)
            if (i // BATCH_SIZE + 1) % 50 == 0:
                elapsed = time.time() - start_time
                print(f"  [DRY] {i + len(batch)}/{total} epizód megnézve ({elapsed:.0f}s)")
            continue

        user_prompt = "Episodes (id|series|season_episode|title):\n" + "\n".join(lines)

        result = await call_deepseek(system_prompt, user_prompt)
        plots = result.get("plots", {}) if isinstance(result, dict) else {}

        if not plots:
            failed += len(batch)
            await asyncio.sleep(RATE_LIMIT_S)
            continue

        batch_generated = 0
        async with async_session_factory() as session:
            for ep_id, title, season, ep_num, series_title in batch:
                plot = plots.get(str(ep_id)) or plots.get(ep_id)
                if not plot:
                    continue
                await session.execute(
                    update(EpisodeModel)
                    .where(EpisodeModel.id == ep_id)
                    .values(plot=str(plot).strip())
                )
                batch_generated += 1
            await session.commit()

        generated += batch_generated
        await asyncio.sleep(RATE_LIMIT_S)

        save_checkpoint(checkpoint + i + len(batch))
        if (i // BATCH_SIZE + 1) % 20 == 0:
            elapsed = time.time() - start_time
            print(f"  [{checkpoint + i + len(batch)}/{total}] {generated} plot generálva ({elapsed:.0f}s)")

    elapsed = time.time() - start_time
    tag = "[DRY]" if args.dry_run else ""
    print("=" * 60)
    print(f"  {tag} KÉSZ: {generated} plot generálva, {failed} epizód sikertelen")
    print(f"  Idő: {elapsed:.0f}s ({elapsed/60:.1f} perc)")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Üres epizód plot generálás DeepSeek-kel.")
    parser.add_argument("--dry-run", action="store_true", help="Csak számol, nem hív API-t és nem ír DB-be.")
    asyncio.run(main(parser.parse_args()))

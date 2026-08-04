"""
PusztaPlayer éjszakai EPG cron orchestration.

Szekvenciálisan futtatja:
  1. Regular EPG import  →  /app/scripts/import_epg.py
  2. Hiányzó csatornák    →  /app/scripts/import_epg_filtered.py --missing
  3. Halott csatornák EPG-jének törlése (amik már NINCSENek az Xtream live listában)

Minden kimenet a /var/log/pusztaplayer/night_epg_YYYYMMDD_HHMM.log fájlba kerül.

Host crontab (éjjel 3-kor):
  0 3 * * * cd /opt/pusztaplayer && docker compose exec -T fastapi python /app/scripts/night_epg.py >> /var/log/pusztaplayer/night_epg_cron.log 2>&1
"""
import asyncio
import json
import logging
import os
import subprocess
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.core.xtream_client import fetch_live_streams
from app.database import async_session_factory
from app.redis import get_redis

LOG_DIR = "/var/log/pusztaplayer"

logger = logging.getLogger("night_epg")
logger.setLevel(logging.INFO)

# Konzol + fájl log
_console = logging.StreamHandler()
_console.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] 🌙 %(message)s"))
logger.addHandler(_console)


def run_script(name: str, args: list[str] | None = None) -> int:
    cmd = ["python", f"/app/scripts/{name}"] + (args or [])
    logger.info("--- Fut: %s ---", " ".join(cmd))
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    except subprocess.TimeoutExpired:
        logger.error("  TIMEOUT (>2h)")
        return -1
    logger.info("  Exit: %d", proc.returncode)
    for line in (proc.stdout or "").splitlines()[-60:]:
        logger.info("    %s", line)
    if proc.stderr:
        logger.error("  STDERR: %s", proc.stderr[-2000:])
    return proc.returncode


async def get_xtream_credentials() -> tuple[str, str] | tuple[None, None]:
    try:
        r = await get_redis()
        keys = await r.keys("session:*")
        if not keys:
            return None, None
        data = json.loads(await r.get(keys[0]) or "{}")
        return data.get("xtream_user"), data.get("xtream_pass")
    except Exception:
        return None, None


async def purge_dead_channels() -> int:
    """Törli az epg_programs sorokat, amiknek a numerikus channel_id-je nincs
    a jelenlegi Xtream live stream listában (halott/kivezetett csatornák)."""
    username, password = await get_xtream_credentials()
    if not username:
        logger.warning("  Nincs Xtream session — purge kihagyva.")
        return 0

    streams, _ = await fetch_live_streams(username, password)
    current_ids = {str(s.get("stream_id")) for s in streams if s.get("stream_id")}
    logger.info("  Jelenlegi live stream_id-k: %d", len(current_ids))
    if not current_ids:
        logger.warning("  Üres stream lista — purge kihagyva (biztonság).")
        return 0

    async with async_session_factory() as sess:
        result = await sess.execute(
            text(
                "DELETE FROM epg_programs "
                "WHERE channel_id ~ '^[0-9]+$' "
                "AND NOT (channel_id = ANY(:ids))"
            ),
            {"ids": list(current_ids)},
        )
        await sess.commit()
        return result.rowcount or 0


async def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = os.path.join(LOG_DIR, f"night_epg_{datetime.now().strftime('%Y%m%d_%H%M')}.log")
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] 🌙 %(message)s"))
    logger.addHandler(fh)

    logger.info("=== Éjszakai EPG import indítása ===")

    # 1. Regular EPG import
    run_script("import_epg.py")

    # 2. Hiányzó csatornák feltöltése (XMLTV)
    run_script("import_epg_filtered.py", ["--missing"])

    # 3. Halott csatornák törlése
    try:
        purged = await purge_dead_channels()
        logger.info("  Halott csatornák EPG törölve: %d", purged)
    except Exception as e:
        logger.error("  Purge hiba: %s", e)

    logger.info("=== Kész. Log: %s ===", log_path)


if __name__ == "__main__":
    asyncio.run(main())

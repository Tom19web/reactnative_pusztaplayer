import asyncio
import logging

from app.redis import get_redis

logger = logging.getLogger(__name__)

_BG_TASKS: set[asyncio.Task] = set()


def _start_bg_task(coro):
    task = asyncio.create_task(coro)
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)
    return task


async def _run_import_script(task_id: str, script_name: str):
    """Run import script in subprocess and push output to Redis."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "python3", f"/app/scripts/{script_name}.py",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        r = await get_redis()
        async for line in proc.stdout:
            decoded = line.decode(errors="replace").rstrip()
            await r.rpush(f"admin:task:{task_id}:output", decoded)
        await proc.wait()
        await r.set(f"admin:task:{task_id}:status", "done", ex=3600)
        await r.set(f"admin:task:{task_id}:exit_code", str(proc.returncode), ex=3600)
    except Exception as e:
        logger.error("Import task %s (%s) failed: %s", task_id, script_name, e)
        try:
            r = await get_redis()
            await r.rpush(f"admin:task:{task_id}:output", f"ERROR: {e}")
            await r.set(f"admin:task:{task_id}:status", "done", ex=3600)
            await r.set(f"admin:task:{task_id}:exit_code", "1", ex=3600)
        except Exception:
            pass


_CACHE_PREFIXES = ("live:", "playlist:", "epg:", "ai:", "admin:", "icy:", "radio:icy:")

SCRIPTS_DIR = "/app/scripts"

VALID_TAGS = ["sport", "film_sorozat", "zene", "hir", "dokumentum", "szorakozas", "eletmod", "gyerek", "felnott", "vallasi", "helyi"]

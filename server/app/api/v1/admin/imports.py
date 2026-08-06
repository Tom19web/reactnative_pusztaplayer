import asyncio
import json
import secrets

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.redis import get_redis

from ._shared import _start_bg_task, _run_import_script, logger

router = APIRouter(tags=["admin"])


# ─── Import Triggers (SSE via Redis) ──────────────────

@router.post("/admin/epg/import")
async def trigger_epg_import():
    task_id = secrets.token_hex(8)
    try:
        r = await get_redis()
        await r.set(f"admin:task:{task_id}:status", "running", ex=3600)
    except Exception:
        task_id = "local_" + secrets.token_hex(8)
    _start_bg_task(_run_import_script(task_id, "import_epg"))
    return {"task_id": task_id, "status": "started"}


@router.post("/admin/epg/hu-direct-import")
async def trigger_hu_direct_import():
    task_id = secrets.token_hex(8)
    try:
        r = await get_redis()
        await r.set(f"admin:task:{task_id}:status", "running", ex=3600)
    except Exception:
        task_id = "local_" + secrets.token_hex(8)
    _start_bg_task(_run_import_script(task_id, "import_epg_hu_direct"))
    return {"task_id": task_id, "status": "started"}


@router.get("/admin/import/stream/{task_id}")
async def stream_import_log(task_id: str):
    try:
        r = await get_redis()
        status = await r.get(f"admin:task:{task_id}:status")
    except Exception:
        raise HTTPException(404, "Task not found")

    if not status:
        raise HTTPException(404, "Task not found")

    async def generate():
        r2 = await get_redis()
        last_idx = 0
        while True:
            lines = await r2.lrange(f"admin:task:{task_id}:output", last_idx, -1)
            for line in lines:
                yield f"data: {json.dumps({'line': line})}\n\n"
                last_idx += 1
            status_val = await r2.get(f"admin:task:{task_id}:status")
            if status_val == "done":
                exit_code = await r2.get(f"admin:task:{task_id}:exit_code")
                ec = int(exit_code or 0)
                yield f"event: done\ndata: {json.dumps({'exit_code': ec, 'message': 'Import complete'})}\n\n"
                break
            await asyncio.sleep(0.3)

        # Cleanup Redis keys
        await r2.delete(
            f"admin:task:{task_id}:output",
            f"admin:task:{task_id}:status",
            f"admin:task:{task_id}:exit_code",
        )

    return StreamingResponse(generate(), media_type="text/event-stream")


# ─── Cache Control ────────────────────────────────────

@router.post("/admin/cache/clear")
async def clear_cache():
    cleared = 0
    try:
        r = await get_redis()
        keys = []
        for prefix in ["playlist:live:", "playlist:movies:", "playlist:series:", "live:streams:"]:
            async for k in r.scan_iter(match=f"{prefix}*"):
                keys.append(k)
        if keys:
            await r.delete(*keys)
            cleared = len(keys)
    except Exception as e:
        logger.error("Cache clear failed: %s", e)
    return {"ok": True, "cleared": cleared}

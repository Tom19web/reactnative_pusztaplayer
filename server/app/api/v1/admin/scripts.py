import os
import secrets
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.redis import get_redis

from ._shared import _start_bg_task, _run_import_script, SCRIPTS_DIR, logger

router = APIRouter(tags=["admin"])


# ─── Script Manager ────────────────────────────────

@router.get("/admin/docker/scripts")
async def docker_scripts():
    if not os.path.isdir(SCRIPTS_DIR):
        return {"scripts": [], "error": f"Scripts dir not found: {SCRIPTS_DIR}"}

    files = []
    try:
        for name in sorted(os.listdir(SCRIPTS_DIR)):
            if not name.endswith(".py"):
                continue
            fp = os.path.join(SCRIPTS_DIR, name)
            try:
                stat = os.stat(fp)
                files.append({
                    "name": name,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                })
            except Exception:
                pass
    except Exception as e:
        return {"scripts": [], "error": str(e)}
    return {"scripts": files, "dir": SCRIPTS_DIR}


@router.get("/admin/docker/scripts/{name}")
async def docker_script_get(name: str):
    if not name.endswith(".py") or "/" in name or ".." in name:
        raise HTTPException(400, "Invalid script name.")
    path = os.path.join(SCRIPTS_DIR, name)
    resolved = os.path.realpath(path)
    if not resolved.startswith(os.path.realpath(SCRIPTS_DIR) + os.sep):
        raise HTTPException(400, "Invalid script path.")
    if not os.path.isfile(resolved):
        raise HTTPException(404, "Script not found.")
    with open(resolved, encoding="utf-8") as f:
        content = f.read()
    return {"name": name, "content": content}


@router.post("/admin/docker/scripts/{name}")
async def docker_script_save(name: str, payload: dict):
    """Save script content. payload: {"content": "..."}"""
    content = payload.get("content", "")
    path = os.path.join(SCRIPTS_DIR, name)
    resolved = os.path.realpath(path)
    if not resolved.startswith(os.path.realpath(SCRIPTS_DIR) + os.sep) or not name.endswith(".py"):
        raise HTTPException(400, "Invalid script path.")
    with open(resolved, "w", encoding="utf-8") as f:
        f.write(content)
    return {"ok": True, "name": name}


@router.post("/admin/docker/scripts/{name}/run")
async def docker_script_run(name: str):
    """Script futtatás background taskként (Redis log streaming)."""
    base = name[:-3] if name.endswith(".py") else name
    if "/" in base or ".." in base:
        raise HTTPException(400, "Invalid script name.")
    script_path = os.path.join(SCRIPTS_DIR, base + ".py")
    if not os.path.isfile(script_path):
        raise HTTPException(404, "Script not found")
    task_id = secrets.token_hex(8)
    try:
        r = await get_redis()
        await r.set(f"admin:task:{task_id}:status", "running", ex=3600)
    except Exception:
        task_id = "local_" + secrets.token_hex(8)
    _start_bg_task(_run_import_script(task_id, base))
    return {"task_id": task_id, "status": "started", "script": base + ".py"}

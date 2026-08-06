import struct

import httpx
from fastapi import APIRouter

from app.redis import get_redis

from ._shared import _CACHE_PREFIXES, logger

router = APIRouter(tags=["admin"])


# ─── Docker Management (socket API) ──────────────────

DOCKER_SOCK = "/var/run/docker.sock"


async def _docker_api(method: str, path: str, **kwargs) -> dict:
    transport = httpx.AsyncHTTPTransport(uds=DOCKER_SOCK)
    try:
        async with httpx.AsyncClient(transport=transport, timeout=60.0) as client:
            resp = await client.request(method, f"http://localhost{path}", **kwargs)
            data = None
            try:
                data = resp.json()
            except Exception:
                data = resp.content
            return {"ok": resp.is_success, "status": resp.status_code, "data": data}
    except Exception as e:
        return {"ok": False, "status": 0, "data": None, "error": str(e)}


def _demux_log(raw: bytes) -> str:
    """Demultiplex docker logs binary stream (8-byte header per frame)."""
    out = []
    i = 0
    while i + 8 <= len(raw):
        stype = raw[i]
        size = int.from_bytes(raw[i + 4:i + 8], "big")
        i += 8
        if i + size > len(raw):
            break
        out.append(raw[i:i + size].decode(errors="replace"))
        i += size
    return "".join(out) if out else raw.decode(errors="replace")


@router.get("/admin/docker/status")
async def docker_status():
    r = await _docker_api("GET", "/containers/json?all=true")
    if not r.get("ok"):
        return {"containers": [], "error": r.get("error") or "Docker socket unreachable"}

    containers = []
    for c in (r.get("data") or []):
        names = (c.get("Names") or [""])[0].lstrip("/")
        ports = ", ".join(
            f"{p.get('PublicPort', '')}->{p.get('PrivatePort', '')}/{p.get('Type', '')}"
            for p in (c.get("Ports") or []) if p.get("PublicPort")
        ) or ""
        containers.append({
            "name": names,
            "image": c.get("Image", ""),
            "status": c.get("Status", ""),
            "ports": ports,
            "state": c.get("State", ""),
        })
    return {"containers": containers}


@router.post("/admin/docker/restart/{container}")
async def docker_restart(container: str = "fastapi"):
    r = await _docker_api("POST", f"/containers/{container}/restart")
    return {"ok": r.get("ok"), "container": container}


@router.post("/admin/docker/restart-all")
async def docker_restart_all():
    ar = await _docker_api("GET", "/containers/json?all=true")
    if not ar.get("ok"):
        return {"ok": False, "error": "Cannot list containers"}
    results = []
    for c in (ar.get("data") or []):
        cid = c.get("Id", "")[:12]
        name = (c.get("Names") or [""])[0].lstrip("/")
        rr = await _docker_api("POST", f"/containers/{name}/restart")
        results.append(f"{name}: {'ok' if rr.get('ok') else 'FAIL'}")
    return {"ok": True, "restarted": len(results), "details": results}


@router.post("/admin/docker/stop")
async def docker_stop():
    ar = await _docker_api("GET", "/containers/json?all=true")
    if not ar.get("ok"):
        return {"ok": False, "error": "Cannot list containers"}
    results = []
    for c in (ar.get("data") or []):
        name = (c.get("Names") or [""])[0].lstrip("/")
        rr = await _docker_api("POST", f"/containers/{name}/stop")
        results.append(f"{name}: {'ok' if rr.get('ok') else 'FAIL'}")
    return {"ok": True, "stopped": len(results), "details": results}


@router.post("/admin/docker/cache-clear")
async def docker_cache_clear():
    try:
        r = await get_redis()
        to_delete = []
        for prefix in _CACHE_PREFIXES:
            async for key in r.scan_iter(match=f"{prefix}*"):
                to_delete.append(key)
        if to_delete:
            await r.delete(*to_delete)
        redis_ok = True
    except Exception as e:
        redis_ok = f"Redis error: {e}"

    rr = await _docker_api("POST", "/containers/fastapi/restart")
    return {"redis_flushed": redis_ok, "fastapi_restarted": rr.get("ok")}


@router.get("/admin/docker/logs/{container}")
async def docker_logs(container: str, tail: int = 200):
    resp = await _docker_api("GET", f"/containers/{container}/logs?stdout=1&stderr=1&tail={tail}")
    if not resp.get("ok"):
        return {"container": container, "output": str(resp.get("data") or resp.get("error", "Unknown error")), "ok": False}
    raw = resp.get("data", "")
    if isinstance(raw, bytes):
        output = _demux_log(raw)
    else:
        output = str(raw)
    return {"container": container, "output": output, "ok": True}

"""
PusztaPlayer Admin API
Védett végpontok, statisztika, import trigger, log streaming, logo file manager.
"""
import asyncio
import glob
import json
import logging
import os
import secrets
import subprocess
import sys
import time
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text

from app.config import settings
from app.database import async_session_factory
from app.models.models import ChannelLogoModel, EpgProgramModel, ChannelTagModel, RadioStationModel
from app.core.channel_merger import clean_channel_title
from app.redis import cache_get, cache_set, get_redis

_BG_TASKS: set[asyncio.Task] = set()


def _start_bg_task(coro):
    task = asyncio.create_task(coro)
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)
    return task

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


# ─── Stats ────────────────────────────────────────────

@router.get("/admin/stats")
async def get_stats():
    try:
        async with async_session_factory() as sess:
            logo_count = (await sess.execute(text("SELECT COUNT(*) FROM channel_logos"))).scalar() or 0
            epg_count = (await sess.execute(text("SELECT COUNT(*) FROM epg_programs"))).scalar() or 0
            epg_channels = (await sess.execute(text("SELECT COUNT(DISTINCT channel_id) FROM epg_programs"))).scalar() or 0
            now_ts = int(time.time())
            epg_current = (await sess.execute(
                text("SELECT COUNT(DISTINCT channel_id) FROM epg_programs WHERE start_timestamp <= :now AND stop_timestamp >= :now"),
                {"now": now_ts},
            )).scalar() or 0

        redis_sessions = 0
        try:
            r = await get_redis()
            keys = [k async for k in r.scan_iter(match="session:*")]
            users = set()
            for key in keys:
                try:
                    data = json.loads(await r.get(key) or "{}")
                    users.add(data.get("xtream_user", ""))
                except Exception: pass
            redis_sessions = len(users)
        except Exception:
            pass

        last_import = "N/A"
        try:
            async with async_session_factory() as sess:
                result = await sess.execute(text("SELECT MAX(created_at) FROM channel_logos"))
                last_logo = result.scalar()
                if last_logo:
                    last_import = str(last_logo)[:19]
        except Exception:
            pass

        return {
            "sessions": redis_sessions,
            "logos": logo_count,
            "epg_programs": epg_count,
            "channels_with_epg": epg_channels,
            "channels_now_playing": epg_current,
            "last_import": last_import,
        }
    except Exception as e:
        logger.error("Admin stats failed: %s", e)
        raise HTTPException(500, str(e))


# ─── Logo List (File Manager) ─────────────────────────

@router.get("/admin/logos/list")
async def list_logos(search: str = Query(default=""), page: int = Query(default=1, ge=1), per_page: int = Query(default=50, le=200)):
    async with async_session_factory() as sess:
        if search:
            stmt = (
                select(ChannelLogoModel)
                .where(ChannelLogoModel.logo_url.ilike(f"%{search}%"))
                .order_by(ChannelLogoModel.stream_id)
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        else:
            stmt = (
                select(ChannelLogoModel)
                .order_by(ChannelLogoModel.stream_id)
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        result = await sess.execute(stmt)
        logos = result.scalars().all()

        count_stmt = text("SELECT COUNT(*) FROM channel_logos")
        if search:
            count_stmt = text("SELECT COUNT(*) FROM channel_logos WHERE logo_url ILIKE :q").params(q=f"%{search}%")
        total = (await sess.execute(count_stmt)).scalar() or 0

    return {
        "logos": [
            {
                "stream_id": l.stream_id,
                "channel_name": l.channel_name or "",
                "matched_name": l.matched_name or "",
                "logo_url": l.logo_url,
                "source": l.source,
                "created_at": str(l.created_at)[:19] if l.created_at else "N/A",
                "local": l.logo_url.startswith(f"https://{settings.SERVER_DOMAIN}/logos/"),
            }
            for l in logos
        ],
        "total": total,
        "page": page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


@router.delete("/admin/logos/{stream_id}")
async def delete_logo(stream_id: int):
    async with async_session_factory() as sess:
        result = await sess.execute(select(ChannelLogoModel).where(ChannelLogoModel.stream_id == stream_id))
        logo = result.scalar_one_or_none()
        if not logo:
            raise HTTPException(404, "Logo not found")

        # Delete local file if cached
        local_path = f"/app/static/logos/{stream_id}.png"
        if os.path.exists(local_path):
            os.remove(local_path)

        await sess.delete(logo)
        await sess.commit()

    return {"ok": True, "deleted": stream_id}


# ─── Channel Name Merge ───────────────────────────────

@router.post("/admin/logos/merge")
async def merge_channel(
    stream_id: int = Query(...),
    channel_name: str = Query(...),
    matched_name: str = Query(...),
    country: str = Query(...),
):
    async with async_session_factory() as sess:
        result = await sess.execute(select(ChannelLogoModel).where(ChannelLogoModel.stream_id == stream_id))
        logo = result.scalar_one_or_none()
        if not logo:
            logo = ChannelLogoModel(stream_id=stream_id, logo_url="", source="manual")
            sess.add(logo)
        logo.channel_name = channel_name
        logo.matched_name = matched_name
        await sess.commit()

    # Update AI cache too
    cache_file = "/tmp/ai_channel_map.json"
    try:
        if os.path.exists(cache_file):
            with open(cache_file) as f:
                ai_cache = json.load(f)
            for key in ai_cache:
                if f"{country}:" in key:
                    ai_cache[key][channel_name] = matched_name
            with open(cache_file, "w") as f:
                json.dump(ai_cache, f)
    except Exception:
        pass

    return {"ok": True, "stream_id": stream_id, "matched_name": matched_name}


@router.get("/admin/xmltv-names/{country}")
async def xmltv_names(country: str, q: str = Query(default="")):
    from scripts.import_common import _EPG_SOURCES
    if country not in _EPG_SOURCES:
        return {"names": [], "count": 0, "error": f"Unknown country: {country}"}

    redis_key = f"admin:xmltv:{country}"
    try:
        r = await get_redis()
        cached = await r.get(redis_key)
        if cached:
            return {"names": json.loads(cached)[:100], "count": len(json.loads(cached)), "cached": True}
    except Exception as e:
        logger.warning("Redis read failed for xmltv names: %s", e)

    # Fetch from remote sources
    names: set[str] = set()
    import gzip
    import xml.etree.ElementTree as ET
    async with httpx.AsyncClient(verify=False, timeout=30.0, follow_redirects=True) as client:
        for url in _EPG_SOURCES[country]:
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    logger.warning("xmltv_names fetch %s → %d", url, resp.status_code)
                    continue
                content = resp.content
                if content and len(content) >= 2 and content[:2] == b'\x1f\x8b':
                    content = gzip.decompress(content)
                root = ET.fromstring(content.decode(errors="replace"))
                for ch in root.findall("channel"):
                    for dn in ch.findall("display-name"):
                        if dn.text:
                            names.add(dn.text.strip())
            except Exception as e:
                logger.warning("xmltv_names fetch error %s: %s", url, e)

    result = sorted(names)
    try:
        r = await get_redis()
        await r.setex(redis_key, 86400, json.dumps(result))
    except Exception as e:
        logger.warning("Redis write failed for xmltv names: %s", e)

    if q:
        result = [n for n in result if q.lower() in n.lower()]
    return {"names": result[:100], "count": len(result)}


# ─── Import Triggers (SSE via Redis) ──────────────────

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


# ─── Missing Analysis ─────────────────────────────────

@router.get("/admin/missing-analysis")
async def missing_analysis():
    """Per-category breakdown: which channels have no logo / no EPG."""
    cache_key = "admin:missing:analysis"
    try:
        r = await get_redis()
        cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    categories_data = []
    try:
        import redis.asyncio as aioredis
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        session_keys = [k async for k in redis.scan_iter(match="session:*")]
        if session_keys:
            raw = await redis.mget(session_keys)
            await redis.aclose()

            seen = set()
            for data in raw:
                if not data: continue
                try:
                    s = json.loads(data)
                    seen.add(json.dumps([s.get("xtream_user",""), s.get("xtream_pass","")]))
                except Exception: pass
            dedup_creds = [tuple(json.loads(x)) for x in seen]
        else:
            await redis.aclose()
            # Fallback
            if settings.XTREAM_USERNAME and settings.XTREAM_PASSWORD:
                dedup_creds = [(settings.XTREAM_USERNAME, settings.XTREAM_PASSWORD)]
            else:
                return {"categories": [], "note": "No active sessions and no admin credentials in config."}

        if not dedup_creds:
            return {"categories": [], "note": "No valid credentials"}

        # Process per credential pair — use first one only (same as before)
        u, p = dedup_creds[0]

        # Fetch categories
        async with httpx.AsyncClient(verify=False) as client:
            cat_resp = await client.get(
                f"{settings.XTREAM_API_BASE}/player_api.php?username={u}&password={p}&action=get_live_categories",
                timeout=30.0,
            )
            if cat_resp.status_code != 200:
                return {"error": "Xtream API unavailable"}
            cats = cat_resp.json()

            # Fetch all logos + EPG state from DB
            async with async_session_factory() as sess:
                logo_result = await sess.execute(select(ChannelLogoModel.stream_id))
                logo_ids = set(logo_result.scalars().all())

                now_ts = int(time.time())
                epg_result = await sess.execute(
                    text("SELECT DISTINCT channel_id FROM epg_programs WHERE start_timestamp <= :now AND stop_timestamp >= :now"),
                    {"now": now_ts},
                )
                epg_ids = set(row[0] for row in epg_result.fetchall())

            for cat in cats:
                cat_id = cat.get("category_id", 0)
                cat_name = cat.get("category_name", "")
                if not cat_id:
                    continue

                low = cat_name.lower()

                try:
                    streams_resp = await client.get(
                        f"{settings.XTREAM_API_BASE}/player_api.php?username={u}&password={p}&action=get_live_streams&category_id={cat_id}",
                        timeout=30.0,
                    )
                    if streams_resp.status_code != 200:
                        continue
                    streams = streams_resp.json()
                except Exception:
                    continue

                channels = []
                no_logo = 0
                no_epg = 0
                for s in (streams if isinstance(streams, list) else []):
                    sid = s.get("stream_id", 0)
                    name = s.get("name", "")
                    if not sid:
                        continue
                    has_logo = sid in logo_ids
                    has_epg = str(sid) in epg_ids
                    if not has_logo:
                        no_logo += 1
                    if not has_epg:
                        no_epg += 1
                    channels.append({
                        "stream_id": sid,
                        "name": name,
                        "has_logo": has_logo,
                        "has_epg": has_epg,
                        "epg_id": s.get("epg_channel_id"),
                    })

                if channels:
                    categories_data.append({
                        "category_id": cat_id,
                        "name": cat_name,
                        "total": len(channels),
                        "no_logo": no_logo,
                        "no_epg": no_epg,
                        "channels": channels,
                    })

    except Exception as e:
        logger.error("Missing analysis failed: %s", e)
        return {"error": str(e)}

    result = {"categories": categories_data, "cached_seconds": 300}
    try:
        r = await get_redis()
        await r.setex(cache_key, 300, json.dumps(result))
    except Exception:
        pass

    return result


# ─── Delete Category ──────────────────────────────────

@router.post("/admin/delete-category")
async def delete_category(category_id: int = Query(...)):
    # Get Xtream credentials from Redis
    creds = []
    try:
        import redis.asyncio as aioredis
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        session_keys = [k async for k in redis.scan_iter(match="session:*")]
        if session_keys:
            raw = await redis.mget(session_keys)
            for data in raw:
                if not data: continue
                try:
                    s = json.loads(data)
                    u, p = s.get("xtream_user", ""), s.get("xtream_pass", "")
                    if u and p: creds.append((u, p)); break
                except Exception: pass
        await redis.aclose()
    except Exception as e:
        raise HTTPException(500, f"Redis error: {e}")

    if not creds:
        raise HTTPException(400, "No active Xtream session found")

    u, p = creds[0]

    # Fetch stream IDs for this category
    try:
        cat_url = f"{settings.XTREAM_API_BASE}/player_api.php?username={u}&password={p}&action=get_live_streams&category_id={category_id}"
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            resp = await client.get(cat_url)
            resp.raise_for_status()
            streams = resp.json()
    except Exception as e:
        raise HTTPException(502, f"Xtream API error: {e}")

    stream_ids = [str(s.get("stream_id", 0)) for s in streams if isinstance(s, dict) and s.get("stream_id")]

    if not stream_ids:
        raise HTTPException(404, "No streams found for this category")

    # Delete from DB
    async with async_session_factory() as sess:
        from sqlalchemy import delete as sqla_delete
        logo_del = await sess.execute(sqla_delete(ChannelLogoModel).where(ChannelLogoModel.stream_id.in_([int(x) for x in stream_ids])))
        epg_del = await sess.execute(text("DELETE FROM epg_programs WHERE channel_id = ANY(:ids)"), {"ids": stream_ids})
        await sess.commit()
        logo_count = logo_del.rowcount
        epg_count = epg_del.rowcount

    # Clear Redis tracking + AI cache
    try:
        r = await get_redis()
        for sid in stream_ids:
            r.delete(f"epg:imported:{sid}")
        r.delete("admin:missing:analysis")
    except Exception:
        pass

    try:
        os.remove("/tmp/ai_channel_map.json")
    except Exception:
        pass

    return {"ok": True, "deleted_logos": logo_count, "deleted_epg": epg_count, "streams": len(stream_ids)}


# ─── EPG Check ───────────────────────────────────────

@router.get("/admin/epg-check/{stream_id}")
async def epg_check(stream_id: str):
    now_ts = int(time.time())
    async with async_session_factory() as sess:
        total = (await sess.execute(text("SELECT COUNT(*) FROM epg_programs WHERE channel_id = :cid"), {"cid": stream_id})).scalar() or 0
        if total == 0:
            return {"stream_id": stream_id, "total": 0, "note": "No EPG data"}

        fl = (await sess.execute(
            text("SELECT MIN(start_timestamp), MAX(stop_timestamp) FROM epg_programs WHERE channel_id = :cid"),
            {"cid": stream_id},
        )).fetchone()
        min_ts, max_ts = (fl[0], fl[1]) if fl else (None, None)

        nr = (await sess.execute(
            text("SELECT title, start_timestamp, stop_timestamp FROM epg_programs WHERE channel_id = :cid AND start_timestamp <= :now AND stop_timestamp >= :now ORDER BY start_timestamp DESC LIMIT 1"),
            {"cid": stream_id, "now": now_ts},
        )).fetchone()

        up = (await sess.execute(
            text("SELECT title, start_timestamp, stop_timestamp FROM epg_programs WHERE channel_id = :cid AND stop_timestamp > :now ORDER BY start_timestamp LIMIT 5"),
            {"cid": stream_id, "now": now_ts},
        )).fetchall()

    return {
        "stream_id": stream_id,
        "total": total,
        "first_ts": min_ts,
        "last_ts": max_ts,
        "now_playing": {"title": nr[0], "start": nr[1], "stop": nr[2]} if nr else None,
        "upcoming": [{"title": r[0], "start": r[1], "stop": r[2]} for r in up],
    }


# ─── HU EPG Manual Mapping ──────────────────────────

_HU_MAPPING_FILE = "/tmp/epg_hu_port_mapping.json"


@router.get("/admin/epg-hu-mapping")
async def get_hu_mapping():
    if not os.path.exists(_HU_MAPPING_FILE):
        return {"channels": [], "note": "Run grab_hu_port.py first"}
    with open(_HU_MAPPING_FILE, encoding="utf-8") as f:
        channels = json.load(f)
    mapped = sum(1 for c in channels if c.get("xtream_sid"))
    return {
        "channels": channels,
        "total": len(channels),
        "mapped": mapped,
    }


@router.post("/admin/epg-hu-mapping")
async def save_hu_mapping(payload: dict):
    """Save manual xtream_sid assignments. payload: {"mapping": {"M1": 476, ...}}"""
    updates = payload.get("mapping", {})
    if not updates:
        raise HTTPException(400, "Mapping is required.")

    if not os.path.exists(_HU_MAPPING_FILE):
        raise HTTPException(404, "Run grab_hu_port.py first to generate the channel list.")

    with open(_HU_MAPPING_FILE, encoding="utf-8") as f:
        channels = json.load(f)

    updated = 0
    for ch in channels:
        new_sid = updates.get(ch["name"])
        if new_sid is not None:
            ch["xtream_sid"] = None if new_sid == 0 else int(new_sid)
            updated += 1

    with open(_HU_MAPPING_FILE, "w", encoding="utf-8") as f:
        json.dump(channels, f, ensure_ascii=False, indent=2)

    mapped = sum(1 for c in channels if c.get("xtream_sid"))
    return {"updated": updated, "total": len(channels), "mapped": mapped}


# ─── Docker Management (socket API) ──────────────────

import struct

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


_CACHE_PREFIXES = ("live:", "playlist:", "epg:", "ai:", "admin:", "icy:", "radio:icy:")


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


# ─── Script Manager ────────────────────────────────

SCRIPTS_DIR = "/app/scripts"


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


# ─── Channel List + EPG ────────────────────────────

@router.get("/admin/channel-list")
async def channel_list(
    category: str = "",
    search: str = "",
    epg_filter: str = "",
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """
    Full channel list with EPG status.
    Filters: category, search (name), epg_filter (has_epg | no_epg | all).
    """
    async with async_session_factory() as sess:
        # Get cat_by_id map
        cats_by_id: dict[int, str] = {}
        streams: list[dict] = []

        # Read from Redis sessions to get creds, fallback to .env
        username = None
        password = None
        try:
            r = await get_redis()
            keys = [k async for k in r.scan_iter(match="session:*")]
            if keys:
                data = json.loads(await r.get(keys[0]) or "{}")
                username = data.get("xtream_user")
                password = data.get("xtream_pass")
        except Exception:
            pass
        if not username:
            username = settings.XTREAM_USERNAME
            password = settings.XTREAM_PASSWORD
        try:
            if username and password:
                import httpx
                async with httpx.AsyncClient(verify=False, timeout=15.0) as client:
                    cat_resp = await client.get(
                        f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_live_categories"
                    )
                    if cat_resp.status_code == 200:
                        for c in cat_resp.json():
                            cats_by_id[int(c.get("category_id", 0))] = c.get("category_name", "")
                    stream_resp = await client.get(
                        f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}&action=get_live_streams"
                    )
                    if stream_resp.status_code == 200:
                        for s in stream_resp.json():
                            sid = s.get("stream_id", 0)
                            if not sid:
                                continue
                            name = clean_channel_title(str(s.get("name", "")))
                            if search and search.lower() not in name.lower():
                                continue
                            cat_id = int(s.get("category_id", 0))
                            cat_name = cats_by_id.get(cat_id, s.get("category_name", ""))
                            if category and cat_name != category:
                                continue
                            streams.append({
                                "stream_id": sid,
                                "name": name,
                                "category": cat_name,
                                "logo": s.get("stream_icon", ""),
                                "epg_channel_id": s.get("epg_channel_id") or "",
                            })
        except Exception as e:
            logger.error("Channel list fetch failed: %s", e)

        if not streams:
            return {"channels": [], "total": 0, "categories": [], "page": page, "pages": 1}

        # EPG status
        now_ts = int(time.time())
        sids = [s["stream_id"] for s in streams]
        epg_result = await sess.execute(
            text("SELECT DISTINCT channel_id FROM epg_programs WHERE channel_id = ANY(:ids) AND start_timestamp <= :now AND stop_timestamp >= :now"),
            {"ids": [str(s) for s in sids], "now": now_ts},
        )
        epg_ids = set(r[0] for r in epg_result.fetchall())
        now_result = await sess.execute(
            text("SELECT channel_id, title FROM epg_programs WHERE channel_id = ANY(:ids) AND start_timestamp <= :now AND stop_timestamp >= :now"),
            {"ids": [str(s) for s in sids], "now": now_ts},
        )
        now_map = {r[0]: r[1] for r in now_result.fetchall()}

        for s in streams:
            sid = str(s["stream_id"])
            s["has_epg"] = sid in epg_ids
            s["now_playing"] = now_map.get(sid, "")

        # Filter by EPG
        if epg_filter == "has_epg":
            streams = [s for s in streams if s["has_epg"]]
        elif epg_filter == "no_epg":
            streams = [s for s in streams if not s["has_epg"]]

        total = len(streams)
        pages = max(1, (total + per_page - 1) // per_page)
        start = (page - 1) * per_page
        page_items = streams[start : start + per_page]

        # Categories
        cats = sorted(set(s["category"] for s in streams if s["category"]))

    return {"channels": page_items, "total": total, "categories": cats, "page": page, "pages": pages}


@router.get("/admin/channel-list/{stream_id}/epg")
async def channel_epg_detail(stream_id: str, count: int = Query(10, ge=1, le=50)):
    now_ts = int(time.time())
    async with async_session_factory() as sess:
        now_r = await sess.execute(
            text("SELECT title, start_timestamp, stop_timestamp, description FROM epg_programs WHERE channel_id = :cid AND start_timestamp <= :now AND stop_timestamp >= :now LIMIT 1"),
            {"cid": stream_id, "now": now_ts},
        )
        now_prog = now_r.fetchone()
        up_r = await sess.execute(
            text("SELECT title, start_timestamp, stop_timestamp, description FROM epg_programs WHERE channel_id = :cid AND stop_timestamp > :now ORDER BY start_timestamp LIMIT :lim"),
            {"cid": stream_id, "now": now_ts, "lim": count},
        )
        upcoming = up_r.fetchall()
    return {
        "stream_id": stream_id,
        "now_playing": {"title": now_prog[0], "start": now_prog[1], "stop": now_prog[2], "desc": (now_prog[3] or "")[:200]} if now_prog else None,
        "upcoming": [{"title": r[0], "start": r[1], "stop": r[2], "desc": (r[3] or "")[:200]} for r in upcoming],
    }


# ─── Channel Tags ──────────────────────────────────

VALID_TAGS = ["sport", "film_sorozat", "zene", "hir", "dokumentum", "szorakozas", "eletmod", "gyerek", "felnott", "vallasi", "helyi"]


@router.get("/admin/channel-tags")
async def list_channel_tags(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    search: str = Query("", max_length=100),
    tag: str = Query("", max_length=50),
    untagged_only: bool = Query(False),
):
    offset = (page - 1) * per_page
    async with async_session_factory() as sess:
        if untagged_only:
            from sqlalchemy import text as sa_text
            # Get all stream_ids from channel_list (via Redis/Xtream) that have no tags
            # For simplicity, return everything from channel_tags where tags is empty
            base_q = "SELECT stream_id, name, tags, language, confidence, auto_tagged, updated_at FROM channel_tags WHERE 1=1"
            params: dict = {"limit": per_page, "offset": offset}
            if search:
                base_q += " AND name ILIKE :search"
                params["search"] = f"%{search}%"
            if tag:
                base_q += " AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS t WHERE t = :tag)"
                params["tag"] = tag

            count_q = f"SELECT COUNT(*) FROM ({base_q}) AS sub"
            result = await sess.execute(sa_text(count_q), params)
            total = result.scalar() or 0

            data_q = base_q + " ORDER BY confidence ASC, name LIMIT :limit OFFSET :offset"
            result = await sess.execute(sa_text(data_q), params)
            rows = result.fetchall()
        else:
            params: dict = {"limit": per_page, "offset": offset, "search": f"%{search}%", "tag": tag}
            count_q = """
                SELECT COUNT(*) FROM channel_tags
                WHERE (name ILIKE :search OR :search = '')
                AND (:tag = '' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS t WHERE t = :tag))
            """
            result = await sess.execute(text(count_q), params)
            total = result.scalar() or 0

            data_q = """
                SELECT stream_id, name, tags, language, confidence, auto_tagged, updated_at
                FROM channel_tags
                WHERE (name ILIKE :search OR :search = '')
                AND (:tag = '' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS t WHERE t = :tag))
                ORDER BY name LIMIT :limit OFFSET :offset
            """
            result = await sess.execute(text(data_q), params)
            rows = result.fetchall()

    items = []
    for r in rows:
        items.append({
            "stream_id": r[0],
            "name": r[1] or "",
            "tags": r[2] or [],
            "language": r[3] or "",
            "confidence": float(r[4] or 0),
            "auto_tagged": bool(r[5]),
            "updated_at": str(r[6]) if r[6] else None,
        })

    return {"items": items, "total": total, "valid_tags": VALID_TAGS}


@router.post("/admin/channel-tags")
async def save_channel_tag(stream_id: int = Query(...), tags: str = Query(""), language: str = Query("")):
    tag_list = [t.strip() for t in tags.split(",") if t.strip() in VALID_TAGS] if tags else []
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(ChannelTagModel).where(ChannelTagModel.stream_id == stream_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.tags = tag_list
            existing.language = language
            existing.auto_tagged = False
            existing.confidence = 1.0
        else:
            sess.add(ChannelTagModel(
                stream_id=stream_id,
                name=str(stream_id),
                tags=tag_list,
                language=language,
                auto_tagged=False,
                confidence=1.0,
            ))
        await sess.commit()
    return {"stream_id": stream_id, "tags": tag_list, "language": language, "saved": True}


# ─── Radio Station Management ──────────────────────


@router.get("/admin/radio")
async def list_radio_stations(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    search: str = Query("", max_length=200),
    tag: str = Query("", max_length=100),
    country: str = Query("", max_length=100),
    language: str = Query("", max_length=100),
    active_only: bool = Query(False),
    no_logo: bool = Query(False),
    dup_only: bool = Query(False),
    sort: str = Query("votes", max_length=30),
    order: str = Query("desc", max_length=4),
):
    offset = (page - 1) * per_page
    sort_whitelist = {
        "name", "stream_url", "favicon", "tags", "country", "state",
        "language", "codec", "bitrate", "votes", "is_active", "created_at", "station_uuid",
    }
    if sort not in sort_whitelist:
        sort = "votes"
    direction = "ASC" if order.lower() == "asc" else "DESC"

    async with async_session_factory() as sess:
        count_q = "SELECT COUNT(*) FROM radio_stations WHERE 1=1"
        data_q = "SELECT id, station_uuid, name, stream_url, favicon, homepage, tags, country, state, language, codec, bitrate, votes, is_active, created_at FROM radio_stations WHERE 1=1"
        params: dict = {"limit": per_page, "offset": offset}

        if search:
            cond = " AND (name ILIKE :search OR station_uuid ILIKE :search)"
            count_q += cond
            data_q += cond
            params["search"] = f"%{search}%"
        if tag:
            cond = " AND tags ILIKE :tag"
            count_q += cond
            data_q += cond
            params["tag"] = f"%{tag}%"
        if country:
            cond = " AND country ILIKE :country"
            count_q += cond
            data_q += cond
            params["country"] = f"%{country}%"
        if language:
            cond = " AND language ILIKE :language"
            count_q += cond
            data_q += cond
            params["language"] = f"%{language}%"
        if active_only:
            cond = " AND is_active = true"
            count_q += cond
            data_q += cond
        if no_logo:
            cond = " AND (favicon IS NULL OR favicon = '')"
            count_q += cond
            data_q += cond
        if dup_only:
            cond = (
                " AND stream_url IN ("
                " SELECT stream_url FROM radio_stations"
                " WHERE stream_url IS NOT NULL AND stream_url != ''"
                " GROUP BY stream_url HAVING COUNT(*) > 1)"
            )
            count_q += cond
            data_q += cond

        result = await sess.execute(text(count_q), params)
        total = result.scalar() or 0

        data_q += f" ORDER BY {sort} {direction} NULLS LAST, name ASC LIMIT :limit OFFSET :offset"
        result = await sess.execute(text(data_q), params)
        rows = result.fetchall()

    stations = []
    for r in rows:
        stations.append({
            "id": r[0],
            "station_uuid": r[1],
            "name": r[2],
            "stream_url": r[3],
            "favicon": r[4],
            "homepage": r[5],
            "tags": r[6] or "",
            "country": r[7] or "",
            "state": r[8] or "",
            "language": r[9] or "",
            "codec": r[10] or "",
            "bitrate": r[11],
            "votes": r[12],
            "is_active": bool(r[13]),
            "created_at": str(r[14]) if r[14] else None,
        })

    return {"stations": stations, "total": total, "page": page, "pages": max(1, (total + per_page - 1) // per_page)}


@router.post("/admin/radio/batch-deactivate")
async def batch_deactivate_radio(payload: dict):
    """Tömeges deaktiválás. payload: {"uuids": ["rapidapi_1", ...]}"""
    uuids = payload.get("uuids") or []
    if not uuids or not isinstance(uuids, list):
        raise HTTPException(400, "No station UUIDs provided")
    uuids = [str(u)[:200] for u in uuids if str(u).strip()]
    if not uuids:
        raise HTTPException(400, "No station UUIDs provided")
    async with async_session_factory() as sess:
        result = await sess.execute(
            text("UPDATE radio_stations SET is_active = false WHERE station_uuid = ANY(:uuids)"),
            {"uuids": uuids},
        )
        await sess.commit()
        updated = result.rowcount
    return {"deactivated": updated}


@router.post("/admin/radio/purge-deactivated")
async def purge_deactivated_radio():
    """Fizikailag törli az összes deaktivált rádióállomást az adatbázisból."""
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.is_active == False)
        )
        stations = result.scalars().all()
        count = len(stations)
        for s in stations:
            await sess.delete(s)
        await sess.commit()
    return {"ok": True, "purged": count}


@router.post("/admin/radio/{station_uuid}")
async def update_radio_station(station_uuid: str, payload: dict):
    allowed = {"name", "stream_url", "favicon", "homepage", "tags", "country", "state", "language", "codec", "bitrate", "votes", "is_active"}
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.station_uuid == station_uuid)
        )
        station = result.scalar_one_or_none()
        if not station:
            raise HTTPException(404, "Rádióállomás nem található")
        for key, value in payload.items():
            if key in allowed:
                setattr(station, key, value)
        await sess.commit()
    return {"station_uuid": station_uuid, "saved": True}


@router.delete("/admin/radio/{station_uuid}")
async def delete_radio_station(station_uuid: str):
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.station_uuid == station_uuid)
        )
        station = result.scalar_one_or_none()
        if not station:
            raise HTTPException(404, "Rádióállomás nem található")
        station.is_active = False
        await sess.commit()
    return {"station_uuid": station_uuid, "deactivated": True}

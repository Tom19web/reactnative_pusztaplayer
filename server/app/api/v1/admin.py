"""
PusztaPlayer Admin API
Védett végpontok, statisztika, import trigger, log streaming, logo file manager.
"""
import asyncio
import json
import logging
import os
import secrets
import sys
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text

from app.config import settings
from app.database import async_session_factory
from app.models.models import ChannelLogoModel, EpgProgramModel
from app.redis import cache_get, cache_set, get_redis

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


# ─── Stats ────────────────────────────────────────────

@router.get("/admin/stats")
async def get_stats():
    try:
        async with async_session_factory() as sess:
            logo_count = (await sess.execute(select(text("COUNT(*) FROM channel_logos")))).scalar() or 0
            epg_count = (await sess.execute(select(text("COUNT(*) FROM epg_programs")))).scalar() or 0
            epg_channels = (await sess.execute(select(text("COUNT(DISTINCT channel_id) FROM epg_programs")))).scalar() or 0
            now_ts = int(time.time())
            epg_current = (await sess.execute(
                text("SELECT COUNT(DISTINCT channel_id) FROM epg_programs WHERE start_timestamp <= :now AND stop_timestamp >= :now"),
                {"now": now_ts},
            )).scalar() or 0

        redis_sessions = 0
        try:
            r = await get_redis()
            keys = await r.keys("session:*")
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
                result = await sess.execute(select(text("SELECT MAX(created_at) FROM channel_logos")))
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

        count_stmt = select(text("COUNT(*) FROM channel_logos"))
        if search:
            count_stmt = select(text("COUNT(*) FROM channel_logos WHERE logo_url ILIKE :q")).params(q=f"%{search}%")
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
    _XMLTV_SOURCES = {
        "at": ["https://www.open-epg.com/files/austria.xml", "https://www.free-epg.de/api/epg/at.xml.gz", "https://iptv-epg.org/files/epg-at.xml"],
        "de": ["https://www.free-epg.de/api/epg/de.xml.gz", "https://iptv-epg.org/files/epg-de.xml"],
        "ch": ["https://www.free-epg.de/api/epg/ch.xml.gz", "https://iptv-epg.org/files/epg-ch.xml"],
        "it": ["https://iptv-epg.org/files/epg-it.xml"],
        "ro": ["https://iptv-epg.org/files/epg-ro.xml"],
        "hu": ["https://iptv-epg.org/files/epg-hu.xml"],
    }
    if country not in _XMLTV_SOURCES:
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
        for url in _XMLTV_SOURCES[country]:
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
    asyncio.create_task(_run_import_script(task_id, "import_epg"))
    return {"task_id": task_id, "status": "started"}


@router.post("/admin/epg/hu-direct-import")
async def trigger_hu_direct_import():
    task_id = secrets.token_hex(8)
    try:
        r = await get_redis()
        await r.set(f"admin:task:{task_id}:status", "running", ex=3600)
    except Exception:
        task_id = "local_" + secrets.token_hex(8)
    asyncio.create_task(_run_import_script(task_id, "import_epg_hu_direct"))
    return {"task_id": task_id, "status": "started"}


@router.post("/admin/logos/import")
async def trigger_logo_import():
    task_id = secrets.token_hex(8)
    try:
        r = await get_redis()
        await r.set(f"admin:task:{task_id}:status", "running", ex=3600)
    except Exception:
        task_id = "local_" + secrets.token_hex(8)
    asyncio.create_task(_run_import_script(task_id, "import_logos"))
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
            keys.extend(await r.keys(f"{prefix}*"))
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
        session_keys = await redis.keys("session:*")
        if not session_keys:
            await redis.aclose()
            return {"categories": [], "note": "No active sessions"}
        raw = await redis.mget(session_keys)
        await redis.aclose()

        seen = set()
        creds = []
        for data in raw:
            if not data: continue
            try:
                s = json.loads(data)
                u, p = s.get("xtream_user", ""), s.get("xtream_pass", "")
                if u and p and (u, p) not in seen:
                    seen.add((u, p)); creds.append((u, p))
            except Exception: pass

        if not creds:
            return {"categories": [], "note": "No valid credentials"}

        u, p = creds[0]

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
        session_keys = await redis.keys("session:*")
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

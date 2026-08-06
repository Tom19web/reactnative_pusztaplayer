import json
import os
import time

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text

from app.config import settings
from app.core.channel_merger import clean_channel_title
from app.database import async_session_factory
from app.models.models import ChannelLogoModel
from app.redis import get_redis

from ._shared import logger

router = APIRouter(tags=["admin"])


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
        redis = await get_redis()
        session_keys = [k async for k in redis.scan_iter(match="session:*")]
        if session_keys:
            raw = await redis.mget(session_keys)

            seen = set()
            for data in raw:
                if not data: continue
                try:
                    s = json.loads(data)
                    seen.add(json.dumps([s.get("xtream_user",""), s.get("xtream_pass","")]))
                except Exception: pass
            dedup_creds = [tuple(json.loads(x)) for x in seen]
        else:
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
        redis = await get_redis()
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

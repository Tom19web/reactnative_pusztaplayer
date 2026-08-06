import json
import time

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.database import async_session_factory
from app.redis import get_redis

from ._shared import logger
from .schemas import AdminStatsResponse

router = APIRouter(tags=["admin"])


# ─── Stats ────────────────────────────────────────────

@router.get("/admin/stats", response_model=AdminStatsResponse)
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

import json
import os

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text

from app.config import settings
from app.database import async_session_factory
from app.models.models import ChannelLogoModel
from app.redis import get_redis

from ._shared import logger

router = APIRouter(tags=["admin"])


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
    from app.services.epg_sources import _EPG_SOURCES
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

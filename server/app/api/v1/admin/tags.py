from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text

from app.database import async_session_factory
from app.models.models import ChannelTagModel

from ._shared import VALID_TAGS, logger

router = APIRouter(tags=["admin"])


# ─── Channel Tags ──────────────────────────────────

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

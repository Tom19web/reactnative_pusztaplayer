import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.core.auth import require_session
from app.core.xtream_client import fetch_live_streams
from app.core.channel_merger import clean_channel_title, merge_and_sort

logger = logging.getLogger(__name__)
router = APIRouter(tags=["live"])


class QualityVariant(BaseModel):
    label: str
    stream_id: int
    stream_url: str
    key: str


class ChannelItem(BaseModel):
    key: str
    stream_id: int
    title: str
    group: str
    logo: str
    stream_url: str
    quality_variants: list[QualityVariant] = []


class LiveStreamsResponse(BaseModel):
    channels: list[ChannelItem]
    groups: list[str]


@router.get("/live/streams", response_model=LiveStreamsResponse)
async def get_live_streams(
    session: dict = Depends(require_session),
):
    xtream_user = session["xtream_user"]
    xtream_pass = session["xtream_pass"]

    try:
        raw_streams, cat_by_id = await fetch_live_streams(xtream_user, xtream_pass)
    except Exception as e:
        logger.error("Xtream live fetch failed for user %s: %s", xtream_user, e)
        raise HTTPException(status_code=502, detail="Xtream API unavailable")

    groups: set[str] = set()
    channels: list[dict] = []

    for i, s in enumerate(raw_streams):
        raw_cat_id = s.get("category_id")
        group = cat_by_id.get(int(raw_cat_id) if raw_cat_id is not None else 0, s.get("category_name", "Egyéb"))
        groups.add(group)
        raw_title = s.get("name", "Ismeretlen csatorna")
        clean_title = clean_channel_title(str(raw_title))
        stream_id = s.get("stream_id", i)
        key = f"live_{stream_id}"
        channels.append({
            "key": key,
            "stream_id": stream_id,
            "title": clean_title,
            "group": group,
            "logo": s.get("stream_icon", ""),
            "stream_url": f"https://{settings.SERVER_DOMAIN}/live/{xtream_user}/{xtream_pass}/{stream_id}.ts",
        })

    merged = merge_and_sort(channels)

    return LiveStreamsResponse(
        channels=[ChannelItem(**ch) for ch in merged],
        groups=sorted(groups),
    )

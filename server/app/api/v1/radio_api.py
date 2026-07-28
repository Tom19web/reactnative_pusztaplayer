from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db_readonly
from app.redis import cache_get, cache_set
from app.models.models import RadioStationModel
from app.core.icy_meta import fetch_icy_metadata

router = APIRouter(tags=["radio"])


class RadioStationOut(BaseModel):
    id: int
    name: str
    stream_url: str
    favicon: str = ""
    tags: str = ""
    bitrate: int = 0
    codec: str = ""
    votes: int = 0

    class Config:
        from_attributes = True


@router.get("/radio", response_model=list[RadioStationOut])
async def get_radio_stations(
    limit: int = Query(300, ge=1, le=500),
    tag: str | None = Query(None),
    db: AsyncSession = Depends(get_db_readonly),
):
    stmt = (
        select(RadioStationModel)
        .where(RadioStationModel.is_active == True)
    )
    if tag:
        stmt = stmt.where(RadioStationModel.tags.ilike(f"%{tag}%"))
    stmt = stmt.order_by(RadioStationModel.votes.desc()).limit(limit)

    result = await db.execute(stmt)
    stations = result.scalars().all()
    return stations


class RadioMetadataResponse(BaseModel):
    title: str = ""


@router.get("/radio/metadata", response_model=RadioMetadataResponse)
async def get_radio_metadata(
    stream_url: str = Query(..., min_length=1),
):
    """Fetch current song title from an ICY/Shoutcast radio stream."""
    cache_key = f"icy:meta:{stream_url}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return RadioMetadataResponse(title=cached)

    result = await fetch_icy_metadata(stream_url)
    title = result.get("title", "")

    # Cache successful results 30s, empty results 10s (to allow recovery)
    ttl = 30 if title else 10
    await cache_set(cache_key, title, ttl_seconds=ttl)

    return RadioMetadataResponse(title=title)

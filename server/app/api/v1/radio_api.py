from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db_readonly
from app.models.models import RadioStationModel

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

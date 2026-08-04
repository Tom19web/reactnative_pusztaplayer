"""
PusztaPlayer - EPG (Műsorújság) Router
Optimalizált, párhuzamosított lekérdezésekkel és precíz időszűréssel.
"""

import json
import logging
import time
import asyncio

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_readonly, async_session_factory
from app.redis import cache_get, cache_set
from app.models.models import EpgProgramModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["epg"])

EPG_CACHE_TTL = 21600  # 6 hours
EPG_MASTER_CACHE_TTL = 600  # 10 perc a teljes EPG lekéréshez


# --- DTOs ---
class EpgProgramOut(BaseModel):
    id: str
    channel_id: str
    title: str
    clean_title: str = ""
    start: str
    end: str
    description: str = ""
    start_timestamp: int = 0
    stop_timestamp: int = 0
    category: str = ""
    genres: list[str] = []
    cast: list[str] = []

    class Config:
        from_attributes = True

class EpgResponse(BaseModel):
    channel_id: str
    programs: list[EpgProgramOut]


# --- 1. A STATIKUS VÉGPONTOK (Mindig a dinamikusak elé!) ---

@router.get("/epg/search", response_model=list[EpgProgramOut])
async def search_epg(
    q: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db_readonly),
):
    now_ts = int(time.time())
    stmt = (
        select(EpgProgramModel)
        .where(
            EpgProgramModel.title.ilike(f"%{q}%"),
            EpgProgramModel.stop_timestamp > now_ts  # Ne keressünk a múlt heti Híradóban!
        )
        .order_by(EpgProgramModel.start_timestamp.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    programs = result.scalars().all()
    return [_program_to_out(p) for p in programs]


@router.get("/epg", response_model=list[EpgResponse])
async def get_all_epg(
    db: AsyncSession = Depends(get_db_readonly),
):
    master_cache_key = "epg:all:master_response"
    cached = await cache_get(master_cache_key)
    if cached:
        return json.loads(cached)

    stmt = select(EpgProgramModel.channel_id).distinct()
    result = await db.execute(stmt)
    channel_ids = result.scalars().all()

    now_ts = int(time.time())
    batch_stmt = (
        select(EpgProgramModel)
        .where(
            EpgProgramModel.channel_id.in_(channel_ids),
            EpgProgramModel.stop_timestamp > now_ts,
        )
        .order_by(EpgProgramModel.channel_id.asc(), EpgProgramModel.start_timestamp.asc())
    )
    result = await db.execute(batch_stmt)
    all_programs = result.scalars().all()

    from collections import defaultdict
    channel_programs: dict[str, list[EpgProgramModel]] = defaultdict(list)
    for p in all_programs:
        if len(channel_programs[p.channel_id]) < 50:
            channel_programs[p.channel_id].append(p)

    valid_responses = []
    for cid in channel_ids:
        programs = channel_programs.get(cid, [])
        programs_out = [_program_to_out(p) for p in programs]
        response = EpgResponse(channel_id=cid, programs=programs_out)
        if programs_out:
            valid_responses.append(response)
            cache_key = f"epg:live:{cid}"
            await cache_set(cache_key, response.model_dump_json(), EPG_MASTER_CACHE_TTL)
    
    await cache_set(master_cache_key, json.dumps([r.model_dump() for r in valid_responses]), EPG_MASTER_CACHE_TTL)
    
    return valid_responses

# --- 2. A DINAMIKUS VÉGPONTOK ({channel_id}) ---

@router.get("/epg/{channel_id}/now", response_model=EpgProgramOut | None)
async def get_now_playing(
    channel_id: str,
    db: AsyncSession = Depends(get_db_readonly),
):
    now_ts = int(time.time())  # Búcsú az utcai __import__-tól!
    stmt = (
        select(EpgProgramModel)
        .where(
            EpgProgramModel.channel_id == channel_id,
            EpgProgramModel.start_timestamp <= now_ts,
            EpgProgramModel.stop_timestamp >= now_ts,
        )
        .order_by(EpgProgramModel.start_timestamp.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    program = result.scalar_one_or_none()
    return _program_to_out(program) if program else None


@router.get("/epg/{channel_id}/upcoming", response_model=list[EpgProgramOut])
async def get_upcoming(
    channel_id: str,
    count: int = Query(4, ge=1, le=10),
    db: AsyncSession = Depends(get_db_readonly),
):
    now_ts = int(time.time())
    stmt = (
        select(EpgProgramModel)
        .where(
            EpgProgramModel.channel_id == channel_id,
            EpgProgramModel.stop_timestamp > now_ts,  # Csak ami még tart vagy jön!
        )
        .order_by(EpgProgramModel.start_timestamp.asc())
        .limit(count)
    )
    result = await db.execute(stmt)
    programs = result.scalars().all()
    return [_program_to_out(p) for p in programs]


@router.get("/epg/{channel_id}", response_model=EpgResponse)
async def get_channel_epg(
    channel_id: str,
    db: AsyncSession = Depends(get_db_readonly),
):
    return await _fetch_single_channel_epg(channel_id, db)


# --- Core Logika & Segédfüggvények ---

async def _fetch_single_channel_epg(channel_id: str, db: AsyncSession) -> EpgResponse:
    """Belső segédfüggvény egy csatorna műsorának lekéréséhez (cache-elve)."""
    cache_key = f"epg:live:{channel_id}"
    cached = await cache_get(cache_key)
    if cached:
        data = json.loads(cached)
        return EpgResponse(**data)

    now_ts = int(time.time())
    stmt = (
        select(EpgProgramModel)
        .where(
            EpgProgramModel.channel_id == channel_id,
            EpgProgramModel.stop_timestamp > now_ts  # AZ IDŐGÉP KIJAVÍTVA!
        )
        .order_by(EpgProgramModel.start_timestamp.asc())
        .limit(50)
    )
    result = await db.execute(stmt)
    programs = result.scalars().all()

    programs_out = [_program_to_out(p) for p in programs]
    response = EpgResponse(channel_id=channel_id, programs=programs_out)

    if programs_out:
        try:
            await cache_set(cache_key, response.model_dump_json(), EPG_CACHE_TTL)
        except Exception:
            logger.warning("Redis cache set failed for epg:%s", channel_id)

    return response


def _program_to_out(p: EpgProgramModel) -> EpgProgramOut:
    genres = []
    cast = []
    if p.ai_enriched and isinstance(p.ai_enriched, dict):
        enriched = p.ai_enriched
        if isinstance(enriched.get("genres"), list):
            genres = enriched["genres"]
        if isinstance(enriched.get("cast"), list):
            cast = enriched["cast"]

    return EpgProgramOut(
        id=p.id,
        channel_id=p.channel_id,
        title=p.title or "",
        clean_title=p.clean_title or "",
        start=p.start or "",
        end=p.end or "",
        description=p.description or "",
        start_timestamp=p.start_timestamp or 0,
        stop_timestamp=p.stop_timestamp or 0,
        category=p.category or "",
        genres=genres,
        cast=cast,
    )
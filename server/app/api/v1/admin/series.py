from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import select, func

from app.database import async_session_factory
from app.models.models import SeriesModel, EpisodeModel
from app.core.vector_engine import _rewrite_image_url

router = APIRouter(tags=["admin"])

SERIES_PER_PAGE = 50


@router.get("/admin/vod/series")
async def list_series(
    recent_days: int = Query(0, ge=0, le=3650, description="Days to look back. 0 = all series"),
    page: int = Query(1, ge=1),
    per_page: int = Query(SERIES_PER_PAGE, ge=1, le=200),
):
    """Paginated series list from SeriesModel, filtered by recency."""
    async with async_session_factory() as db:
        if recent_days > 0:
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=recent_days)
            count_q = select(func.count()).select_from(SeriesModel).where(
                SeriesModel.created_at >= cutoff
            )
            q = select(
                SeriesModel.series_id,
                SeriesModel.title,
                SeriesModel.year,
                SeriesModel.plot,
                SeriesModel.genre,
                SeriesModel.cast,
                SeriesModel.director,
                SeriesModel.rating,
                SeriesModel.tmdb_id,
                SeriesModel.cover,
                SeriesModel.created_at,
            ).where(SeriesModel.created_at >= cutoff).order_by(SeriesModel.created_at.desc())
        else:
            count_q = select(func.count()).select_from(SeriesModel)
            q = select(
                SeriesModel.series_id,
                SeriesModel.title,
                SeriesModel.year,
                SeriesModel.plot,
                SeriesModel.genre,
                SeriesModel.cast,
                SeriesModel.director,
                SeriesModel.rating,
                SeriesModel.tmdb_id,
                SeriesModel.cover,
                SeriesModel.created_at,
            ).order_by(SeriesModel.created_at.desc())

        total = (await db.execute(count_q)).scalar() or 0
        offset = (page - 1) * per_page
        q = q.limit(per_page).offset(offset)

        result = await db.execute(q)
        series = []
        for row in result.all():
            series.append({
                "series_id": row.series_id,
                "title": row.title,
                "year": row.year,
                "plot": row.plot,
                "genre": row.genre,
                "cast": row.cast,
                "director": row.director,
                "rating": row.rating,
                "tmdb_id": row.tmdb_id,
                "cover": _rewrite_image_url(row.cover or ""),
                "created_at": str(row.created_at) if row.created_at else None,
            })

        pages = max(1, (total + per_page - 1) // per_page)
        return {"series": series, "total": total, "page": page, "pages": pages}


@router.get("/admin/vod/series/{series_id}")
async def get_series(series_id: int):
    """Get detailed info for a single series by Xtream series_id."""
    async with async_session_factory() as db:
        q = select(SeriesModel).where(SeriesModel.series_id == series_id)
        result = await db.execute(q)
        row = result.scalar_one_or_none()

        if row is None:
            return {"series_id": series_id, "found": False}

        return {
            "series_id": row.series_id,
            "title": row.title,
            "year": row.year,
            "plot": row.plot,
            "genre": row.genre,
            "cast": row.cast,
            "director": row.director,
            "rating": row.rating,
            "tmdb_id": row.tmdb_id,
            "cover": _rewrite_image_url(row.cover or ""),
            "meta": row.meta,
            "created_at": str(row.created_at) if row.created_at else None,
            "found": True,
        }


@router.get("/admin/vod/series/{series_id}/episodes")
async def list_episodes(series_id: int):
    """Get all episodes for a series, grouped by season."""
    async with async_session_factory() as db:
        q = select(EpisodeModel).where(
            EpisodeModel.series_id == series_id
        ).order_by(EpisodeModel.season, EpisodeModel.episode)

        result = await db.execute(q)
        rows = result.scalars().all()

        seasons = {}
        for ep in rows:
            s = str(ep.season)
            if s not in seasons:
                seasons[s] = []
            seasons[s].append({
                "episode": ep.episode,
                "title": ep.title or "",
                "plot": ep.plot or "",
                "air_date": ep.air_date or "",
            })

        return {
            "series_id": series_id,
            "seasons": seasons,
            "total_episodes": len(rows),
        }

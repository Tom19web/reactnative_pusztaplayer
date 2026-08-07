import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import select, func

from app.database import async_session_factory
from app.models.models import MovieModel

from ._shared import logger

router = APIRouter(tags=["admin"])

VOD_PER_PAGE = 50


@router.get("/admin/vod/movies")
async def list_movies(
    recent_days: int = Query(14, ge=1, le=365, description="Only movies from last N days"),
    page: int = Query(1, ge=1),
    per_page: int = Query(VOD_PER_PAGE, ge=1, le=200),
):
    """Paginated movie list from MovieModel, filtered by recency."""
    async with async_session_factory() as db:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=recent_days)

        count_q = select(func.count()).select_from(MovieModel).where(
            MovieModel.created_at >= cutoff
        )
        total = (await db.execute(count_q)).scalar() or 0

        q = select(
            MovieModel.stream_id,
            MovieModel.title,
            MovieModel.year,
            MovieModel.plot,
            MovieModel.genre,
            MovieModel.cast,
            MovieModel.director,
            MovieModel.rating,
            MovieModel.tmdb_id,
            MovieModel.poster_full,
            MovieModel.poster_thumb,
            MovieModel.duration,
            MovieModel.country,
            MovieModel.created_at,
        ).where(MovieModel.created_at >= cutoff).order_by(MovieModel.created_at.desc())

        offset = (page - 1) * per_page
        q = q.limit(per_page).offset(offset)

        result = await db.execute(q)
        movies = []
        for row in result.all():
            movies.append({
                "stream_id": row.stream_id,
                "title": row.title,
                "year": row.year,
                "plot": row.plot,
                "genre": row.genre,
                "cast": row.cast,
                "director": row.director,
                "rating": row.rating,
                "tmdb_id": row.tmdb_id,
                "poster_full": row.poster_full,
                "poster_thumb": row.poster_thumb,
                "duration": row.duration,
                "country": row.country,
                "created_at": str(row.created_at) if row.created_at else None,
            })

        pages = max(1, (total + per_page - 1) // per_page)
        return {"movies": movies, "total": total, "page": page, "pages": pages}


@router.get("/admin/vod/movies/{stream_id}")
async def get_movie(stream_id: int):
    """Get detailed info for a single movie by Xtream stream_id."""
    async with async_session_factory() as db:
        q = select(MovieModel).where(MovieModel.stream_id == stream_id)
        result = await db.execute(q)
        row = result.scalar_one_or_none()

        if row is None:
            return {"stream_id": stream_id, "found": False}

        return {
            "stream_id": row.stream_id,
            "title": row.title,
            "year": row.year,
            "plot": row.plot,
            "genre": row.genre,
            "cast": row.cast,
            "director": row.director,
            "rating": row.rating,
            "tmdb_id": row.tmdb_id,
            "poster_full": row.poster_full,
            "poster_thumb": row.poster_thumb,
            "backdrop_url": row.backdrop_url,
            "duration": row.duration,
            "country": row.country,
            "meta": row.meta,
            "created_at": str(row.created_at) if row.created_at else None,
            "found": True,
        }

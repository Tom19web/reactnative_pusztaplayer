"""Cast-based search across movies and series."""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select, union_all, literal

from app.database import async_session_factory
from app.models.models import MovieModel, SeriesModel
from app.core.vector_engine import _rewrite_image_url

router = APIRouter(tags=["cast search"])


class CastSearchResult(BaseModel):
    title: str
    type: str  # "movie" or "series"
    key: str
    stream_id: int | None = None
    series_id: int | None = None
    year: str = ""
    poster: str = ""


@router.get("/search/cast", response_model=list[CastSearchResult])
async def cast_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=100),
):
    """Search movies and series by cast member name."""
    async with async_session_factory() as sess:
        movie_stmt = (
            select(
                MovieModel.title,
                literal("movie").label("type"),
                MovieModel.stream_id,
                literal(None).label("series_id"),
                MovieModel.year,
                MovieModel.poster_full.label("poster"),
            )
            .where(MovieModel.cast.ilike(f"%{q}%"))
            .limit(limit)
        )

        series_stmt = (
            select(
                SeriesModel.title,
                literal("series").label("type"),
                literal(None).label("stream_id"),
                SeriesModel.series_id,
                SeriesModel.year,
                SeriesModel.cover.label("poster"),
            )
            .where(SeriesModel.cast.ilike(f"%{q}%"))
            .limit(limit)
        )

        union = union_all(movie_stmt, series_stmt).alias()

        result = await sess.execute(
            select(union.c.title, union.c.type, union.c.stream_id, union.c.series_id, union.c.year, union.c.poster)
            .order_by(union.c.year.desc().nullslast())
            .limit(limit)
        )
        rows = result.fetchall()

    return [
        CastSearchResult(
            title=r.title,
            type=r.type,
            key=f"{r.type}_{r.stream_id or r.series_id}",
            stream_id=r.stream_id,
            series_id=r.series_id,
            year=r.year or "",
            poster=_rewrite_image_url(r.poster or ""),
        )
        for r in rows
    ]

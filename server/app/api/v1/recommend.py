import logging

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from app.database import async_session_factory
from app.core.vector_engine import VectorEngine
from app.models.models import MovieModel, SeriesModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["recommend"])


class HistoryItem(BaseModel):
    key: str
    title: str
    type: str  # "movie" or "series"


class RecommendRequest(BaseModel):
    history_items: list[HistoryItem]
    limit: int = 10


class RecommendResult(BaseModel):
    key: str
    title: str
    type: str
    year: str = ""
    similarity: float = 0.0
    description: str = ""
    reason: str = ""
    poster_url: str = ""


class RecommendResponse(BaseModel):
    recommendations: list[RecommendResult]


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(request: RecommendRequest):
    if not request.history_items:
        return RecommendResponse(recommendations=[])

    movie_ids: list[int] = []
    series_ids: list[int] = []
    for item in request.history_items:
        try:
            if item.type == "movie":
                movie_ids.append(int(item.key))
            else:
                series_ids.append(int(item.key))
        except (ValueError, TypeError):
            continue

    if not movie_ids and not series_ids:
        return RecommendResponse(recommendations=[])

    embeddings: list[list[float]] = []
    genres: list[str] = []

    async with async_session_factory() as session:
        if movie_ids:
            for row in (await session.execute(
                select(MovieModel.embedding, MovieModel.genre).where(MovieModel.stream_id.in_(movie_ids))
            )).fetchall():
                if row[0]:
                    embeddings.append(list(row[0]))
                    if row[1]:
                        genres.append(row[1])

        if series_ids:
            for row in (await session.execute(
                select(SeriesModel.embedding, SeriesModel.genre).where(SeriesModel.series_id.in_(series_ids))
            )).fetchall():
                if row[0]:
                    embeddings.append(list(row[0]))
                    if row[1]:
                        genres.append(row[1])

        if not embeddings:
            return RecommendResponse(recommendations=[])

        centroid = np.mean(embeddings, axis=0).tolist()

        engine = VectorEngine(session)
        try:
            results = await engine.recommend_by_vector(centroid, limit=request.limit, threshold=0.40)
        except Exception as e:
            logger.error("pgvector recommend failed: %s", e)
            raise HTTPException(status_code=500, detail="Recommendation error") from e

    dominant_genre = _most_common(genres) if genres else ""
    return RecommendResponse(
        recommendations=[
            RecommendResult(
                key=r["key"],
                title=r["title"],
                type=r["type"],
                year=r["year"],
                similarity=r["similarity"],
                description=r["description"],
                reason=r["genre"] or dominant_genre,
                poster_url=r.get("poster_url", ""),
            )
            for r in results
        ]
    )


@router.get("/recommend/similar", response_model=RecommendResponse)
async def recommend_similar(
    seed_id: int = Query(...),
    seed_type: str = Query("movie"),
    limit: int = Query(5, ge=1, le=10),
):
    async with async_session_factory() as session:
        model = MovieModel if seed_type == "movie" else SeriesModel
        id_col = model.stream_id if seed_type == "movie" else model.series_id
        row = (await session.execute(
            select(model.embedding, model.genre).where(id_col == seed_id).limit(1)
        )).one_or_none()
        if not row or row[0] is None:
            return RecommendResponse(recommendations=[])

        seed_embedding = list(row[0])
        engine = VectorEngine(session)
        try:
            results = await engine.recommend_by_vector(seed_embedding, limit=limit + 1, threshold=0.40)
        except Exception as e:
            logger.error("pgvector similar recommend failed: %s", e)
            raise HTTPException(status_code=500, detail="Similar recommendation error") from e

    filtered = [r for r in results if not (
        r["type"] == seed_type and r["key"] == str(seed_id)
    )][:limit]

    return RecommendResponse(
        recommendations=[
            RecommendResult(
                key=r["key"],
                title=r["title"],
                type=r["type"],
                year=r["year"],
                similarity=r["similarity"],
                description=r["description"],
                reason=r["genre"] or (row[1] or ""),
                poster_url=r.get("poster_url", ""),
            )
            for r in filtered
        ]
    )


def _most_common(items: list[str]) -> str:
    if not items:
        return ""
    return max(set(items), key=items.count)

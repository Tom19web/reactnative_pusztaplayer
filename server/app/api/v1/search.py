import logging

import httpx
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.vector_engine import VectorEngine

logger = logging.getLogger(__name__)
router = APIRouter(tags=["search"])


class SemanticSearchRequest(BaseModel):
    query: str
    limit: int = 10


class SemanticSearchResult(BaseModel):
    title: str
    year: str = ""
    similarity: float = 0.0
    description: str = ""
    poster_url: str = ""


@router.post("/search/semantic", response_model=list[SemanticSearchResult])
async def semantic_search_post(request: SemanticSearchRequest):
    return await _do_semantic_search(request.query, request.limit)


@router.get("/search/semantic", response_model=list[SemanticSearchResult])
async def semantic_search_get(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
):
    return await _do_semantic_search(q, limit)


async def _do_semantic_search(query_text: str, limit: int) -> list[SemanticSearchResult]:
    if not query_text.strip():
        return []

    query_vector = await _embed_text(query_text)
    if not query_vector:
        raise HTTPException(status_code=502, detail="Embedding generation failed")

    from app.database import async_session_factory
    async with async_session_factory() as session:
        engine = VectorEngine(session)
        try:
            results = await engine.search_by_vector(query_vector, limit=limit, threshold=0.45)
        except Exception as e:
            logger.error("pgvector search failed: %s", e)
            raise HTTPException(status_code=500, detail="Vector search error") from e

    return [
        SemanticSearchResult(
            title=r.get("title", ""),
            year=r.get("year", ""),
            similarity=round(r.get("similarity", 0.0), 4),
            description=r.get("description", ""),
            poster_url=r.get("poster_url", ""),
        )
        for r in results
    ]


async def _embed_text(text: str) -> list[float] | None:
    if not settings.OPENAI_API_KEY:
        return _fallback_zero_vector()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.OPENAI_BASE_URL}/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "text-embedding-3-small",
                    "input": text,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]
    except Exception as e:
        logger.error("OpenAI embedding call failed: %s", e)
        return _fallback_zero_vector()


def _fallback_zero_vector() -> list[float]:
    return [0.0] * 1536

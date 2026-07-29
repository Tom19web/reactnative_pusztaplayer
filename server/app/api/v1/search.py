"""
PusztaPlayer - Szemantikus Kereső Router (Lt. Dan)
Optimalizált HTTP kapcsolatokkal és szigorú hibaáramlással.
"""

import logging
import httpx
from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.core.vector_engine import VectorEngine
from app.database import async_session_factory

logger = logging.getLogger(__name__)
router = APIRouter(tags=["search"])

# Globális HTTP kliens a TCP portok megmentésére! (Nincs több connection mészárlás)
_openai_client: httpx.AsyncClient | None = None

def get_openai_client() -> httpx.AsyncClient:
    global _openai_client
    if _openai_client is None or _openai_client.is_closed:
        _openai_client = httpx.AsyncClient(timeout=30.0)
    return _openai_client

# --- DTOs ---

class SemanticSearchRequest(BaseModel):
    query: str
    limit: int = 10

class SemanticSearchResult(BaseModel):
    title: str
    year: str = ""
    similarity: float = 0.0
    description: str = ""
    poster_url: str = ""

# --- Végpontok ---

@router.post("/search/semantic", response_model=list[SemanticSearchResult])
async def semantic_search_post(request: SemanticSearchRequest):
    return await _do_semantic_search(request.query, request.limit)


@router.get("/search/semantic", response_model=list[SemanticSearchResult])
async def semantic_search_get(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
):
    return await _do_semantic_search(q, limit)


# --- Core Logika ---

async def _do_semantic_search(query_text: str, limit: int) -> list[SemanticSearchResult]:
    if not query_text.strip():
        return []

    # 1. Szöveg beágyazása (Embedding lekérése)
    query_vector = await _embed_text(query_text)

    # 2. Vektoros keresés az adatbázisban
    async with async_session_factory() as session:
        engine = VectorEngine(session)
        try:
            results = await engine.search_by_vector(query_vector, limit=limit, threshold=0.45)
        except Exception as e:
            logger.error("pgvector search failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                detail="Hiba történt a szemantikus keresés során."
            ) from e

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


async def _embed_text(text: str) -> list[float]:
    """Generál egy 1536 dimenziós vektort az OpenAI API-val, optimalizált klienssel."""
    if not settings.OPENAI_API_KEY:
        logger.error("Kritikus hiba: OPENAI_API_KEY hiányzik a környezeti változókból!")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="AI beágyazási szolgáltatás nincs konfigurálva."
        )

    client = get_openai_client()
    try:
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
        logger.error("OpenAI embedding hívás elszállt: %s", e)
        # Nincs több matematikai blaszfémia (nullás vektor)! Határozottan elutasítjuk a kérést.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, 
            detail="Az AI beágyazási szolgáltatás jelenleg nem elérhető."
        )
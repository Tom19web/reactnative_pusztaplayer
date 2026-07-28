"""TMDB API client — sorozatok es filmek keresesere."""

import httpx
from app.config import settings

BASE_URL = "https://api.themoviedb.org/3"


async def search_series(query: str, lang: str = "hu") -> dict | None:
    """TMDB kereses sorozat cimere. Visszaadja az elso talalatot."""
    if not settings.TMDB_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{BASE_URL}/search/tv",
                params={
                    "api_key": settings.TMDB_API_KEY,
                    "query": query,
                    "language": lang,
                },
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])
            return results[0] if results else None
    except Exception:
        return None


async def get_series_detail(tmdb_id: int) -> dict | None:
    """TMDB sorozat reszletei (overview, genres, status)."""
    if not settings.TMDB_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{BASE_URL}/tv/{tmdb_id}",
                params={
                    "api_key": settings.TMDB_API_KEY,
                    "language": "hu",
                },
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None


async def search_movie(query: str) -> dict | None:
    """TMDB kereses film cimere."""
    if not settings.TMDB_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{BASE_URL}/search/movie",
                params={
                    "api_key": settings.TMDB_API_KEY,
                    "query": query,
                    "language": "hu",
                },
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])
            return results[0] if results else None
    except Exception:
        return None


async def get_episode(tmdb_id: int, season: int, episode: int) -> dict | None:
    """TMDB epizod reszletek (cim, overview, kep)."""
    if not settings.TMDB_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{BASE_URL}/tv/{tmdb_id}/season/{season}/episode/{episode}",
                params={
                    "api_key": settings.TMDB_API_KEY,
                    "language": "hu",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("name") or data.get("overview"):
                return data
            return None
    except Exception:
        return None

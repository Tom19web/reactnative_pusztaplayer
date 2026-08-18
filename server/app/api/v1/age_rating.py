"""Korhatár-besorolás (TMDB + DeepSeek) — a film/sorozat adatlapokhoz és a
VOD-indulás overlay-hez.

A kliens a filmnél a TMDB id-t (az Xtream get_vod_info `tmdb_id` mezőjéből),
sorozatnál az Xtream series_id-t küldi (a TMDB id a SeriesModel-ből jön).
A válasz: magyar korhatár (age_hungarian) + tartalmi meghatározások
(descriptors, max 4 — DeepSeek generálás + TMDB keywords kitöltő).
Redis cache 24 óra a teljes válaszra.
"""

import json
import logging

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.models.models import MovieModel, SeriesModel
from app.redis import cache_get, cache_set

logger = logging.getLogger(__name__)

router = APIRouter(tags=["age-rating"])

TMDB_BASE = "https://api.themoviedb.org/3"
AGE_CACHE_TTL = 24 * 3600

# US → magyar korhatár-skála (a HU besorolás eleve a magyar KN-szám)
US_TO_HU = {
    "G": "6", "PG": "6", "TV-Y": "6", "TV-G": "6", "TV-PG": "6",
    "PG-13": "12", "TV-14": "12",
    "R": "16",
    "NC-17": "18", "X": "18", "TV-MA": "18",
}

# TMDB kulcsszó-minták (hu-HU néven vizsgálva) → magyar figyelmeztető címke
KEYWORD_PATTERNS = [
    ("erőszak", "Erőszak"), ("gyilkosság", "Erőszak"), ("verekedés", "Erőszak"),
    ("vér", "Véres jelenetek"), ("gore", "Véres jelenetek"),
    ("drog", "Kábítószer"), ("kábítószer", "Kábítószer"),
    ("fegyver", "Lőfegyverek"), ("lövöld", "Lőfegyverek"), ("puska", "Lőfegyverek"),
    ("szex", "Szexualitás"), ("meztelen", "Meztelenség"), ("erotik", "Szexualitás"),
    ("alkohol", "Alkohol"), ("dohány", "Dohányzás"),
    ("trágár", "Trágár beszéd"), ("káromkod", "Trágár beszéd"),
    ("horror", "Rémisztő jelenetek"), ("félel", "Rémisztő jelenetek"),
    ("háború", "Háború"), ("kínzás", "Kínzás"), ("öngyilkosság", "Öngyilkosság"),
]


class AgeRatingResponse(BaseModel):
    certification: str = ""
    country: str = ""
    age_hungarian: str = ""
    descriptors: list[str] = []


def _map_to_hungarian(cert: str, country: str) -> str:
    if not cert:
        return ""
    if country.upper() == "HU":
        return cert.strip()
    return US_TO_HU.get(cert.strip().upper(), "")


def _normalize_descriptors(items: list[str], max_n: int = 4) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for it in items:
        t = (it or "").strip()
        if not t or t.lower() in seen:
            continue
        seen.add(t.lower())
        out.append(t[:40])
        if len(out) >= max_n:
            break
    return out


async def _tmdb_keywords(path: str) -> list[str]:
    """TMDB keywords (hu-HU) → magyar figyelmeztető címkék a mintaszótárból."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{TMDB_BASE}{path}",
                params={"api_key": settings.TMDB_API_KEY, "language": "hu-HU"},
            )
            resp.raise_for_status()
            names = [kw.get("name", "") for kw in resp.json().get("keywords", [])]
        labels: list[str] = []
        for name in names:
            n = (name or "").lower()
            for pattern, label in KEYWORD_PATTERNS:
                if pattern in n:
                    labels.append(label)
                    break
        return labels
    except Exception:
        return []


async def _deepseek_descriptors(title: str, genre: str, plot: str) -> list[str]:
    """DeepSeek: 1-4 magyar tartalmi figyelmeztető címke a tartalomról."""
    if not settings.DEEPSEEK_API_KEY:
        return []
    system_prompt = (
        "Te egy streaming-platform tartalmi címkézője vagy. Add meg, MIÉRT kaphat "
        "korhatár-besorolást az adott film/sorozat. Csak a megadott listából válassz "
        "1-4 rövid magyar címkét, semmi mást ne írj: Erőszak, Véres jelenetek, "
        "Kábítószer, Lőfegyverek, Szexualitás, Meztelenség, Alkohol, Dohányzás, "
        "Trágár beszéd, Rémisztő jelenetek, Háború, Kínzás, Öngyilkosság. "
        'Válasz JSON formátumban: {"descriptors": ["Címke1", "Címke2"]}'
    )
    user_prompt = f"Cím: {title}\nMűfaj: {genre}\nLeírás: {(plot or '')[:600]}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.DEEPSEEK_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat"),
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 200,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                items = parsed.get("descriptors", [])
                return [str(x) for x in items if isinstance(x, str)]
            return []
    except Exception as e:
        logger.warning("DeepSeek descriptor call failed: %s", e)
        return []


async def _fetch_movie_certification(tmdb_id: int) -> tuple[str, str]:
    """TMDB /movie/{id}/release_dates — HU preferencia, US fallback, majd az első nem üres."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{TMDB_BASE}/movie/{tmdb_id}/release_dates",
            params={"api_key": settings.TMDB_API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results", [])
    for country_pref in ("HU", "US"):
        for r in results:
            if (r.get("iso_3166_1") or "").upper() != country_pref:
                continue
            for rd in r.get("release_dates", []):
                cert = (rd.get("certification") or "").strip()
                if cert:
                    return cert, country_pref
    for r in results:
        for rd in r.get("release_dates", []):
            cert = (rd.get("certification") or "").strip()
            if cert:
                return cert, (r.get("iso_3166_1") or "").upper()
    return "", ""


async def _fetch_tv_certification(tmdb_id: int) -> tuple[str, str]:
    """TMDB /tv/{id}/content_ratings — HU preferencia, US fallback, majd az első nem üres."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{TMDB_BASE}/tv/{tmdb_id}/content_ratings",
            params={"api_key": settings.TMDB_API_KEY},
        )
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results", [])
    for country_pref in ("HU", "US"):
        for r in results:
            if (r.get("iso_3166_1") or "").upper() != country_pref:
                continue
            cert = (r.get("rating") or "").strip()
            if cert:
                return cert, country_pref
    for r in results:
        cert = (r.get("rating") or "").strip()
        if cert:
            return cert, (r.get("iso_3166_1") or "").upper()
    return "", ""


@router.get("/vod/age", response_model=AgeRatingResponse)
async def get_age_rating(
    type: str = Query(...),
    id: int = Query(...),
    title: str = Query(default=""),
    genre: str = Query(default=""),
    plot: str = Query(default=""),
):
    """Korhatár + meghatározások. type: movie (id = TMDB id) | series (id = Xtream series_id)."""
    if not settings.TMDB_API_KEY:
        return AgeRatingResponse()

    try:
        tmdb_id: int | None = None
        db_title, db_genre, db_plot = title, genre, plot
        if type == "movie":
            tmdb_id = id
            if not db_plot:
                # Movie-nál az id = TMDB id — a DB-ből is a tmdb_id oszlopon keresünk
                async with async_session_factory() as session:
                    row = (
                        await session.execute(
                            select(MovieModel.title, MovieModel.genre, MovieModel.plot).where(
                                MovieModel.tmdb_id == id
                            )
                        )
                    ).one_or_none()
                    if row:
                        db_title, db_genre, db_plot = row[0] or "", row[1] or "", row[2] or ""
        elif type == "series":
            async with async_session_factory() as session:
                row = (
                    await session.execute(
                        select(
                            SeriesModel.tmdb_id,
                            SeriesModel.title,
                            SeriesModel.genre,
                            SeriesModel.plot,
                        ).where(SeriesModel.series_id == id)
                    )
                ).one_or_none()
            if not row or not row[0]:
                return AgeRatingResponse()
            tmdb_id = int(row[0])
            if not db_plot:
                db_title, db_genre, db_plot = row[1] or "", row[2] or "", row[3] or ""
        else:
            raise HTTPException(status_code=400, detail="type must be 'movie' or 'series'")

        cache_key = f"age:full:{type}:{id}"
        cached = await cache_get(cache_key)
        if cached:
            d = json.loads(cached)
            return AgeRatingResponse(**d)

        cert, country = (
            await _fetch_movie_certification(tmdb_id)
            if type == "movie"
            else await _fetch_tv_certification(tmdb_id)
        )
        age_hu = _map_to_hungarian(cert, country)

        # Meghatározások: DeepSeek elsődleges + TMDB keywords kitöltő
        descriptors = await _deepseek_descriptors(db_title, db_genre, db_plot)
        if len(descriptors) < 3:
            keywords = await _tmdb_keywords(f"/{'movie' if type == 'movie' else 'tv'}/{tmdb_id}/keywords")
            descriptors = _normalize_descriptors(descriptors + keywords)
        else:
            descriptors = _normalize_descriptors(descriptors)

        result = AgeRatingResponse(
            certification=cert,
            country=country,
            age_hungarian=age_hu,
            descriptors=descriptors,
        )
        try:
            await cache_set(cache_key, result.model_dump_json(), AGE_CACHE_TTL)
        except Exception:
            logger.warning("Redis cache set failed for %s", cache_key)
        return result
    except HTTPException:
        raise
    except Exception:
        return AgeRatingResponse()

"""
PusztaPlayer - Unified Playlist BFF Router
Replaces direct Xtream calls with backend-enriched responses.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.config import settings
from app.core.auth import require_session
from app.core.xtream_client import fetch_live_streams, fetch_vod_streams, fetch_series, fetch_vod_categories, fetch_series_categories
from app.core.channel_merger import clean_channel_title, merge_and_sort
from app.models.models import ChannelLogoModel, MovieModel, SeriesModel, ChannelTagModel
from app.database import async_session_factory
from app.redis import cache_get, cache_set
import time

logger = logging.getLogger(__name__)
router = APIRouter(tags=["playlist"])
from app.core.constants import CACHE_TTL_LIVE, CACHE_TTL_VOD

LIVE_CACHE_TTL = CACHE_TTL_LIVE
VOD_CACHE_TTL = CACHE_TTL_VOD


# --- DTOs ---

class QualityVariant(BaseModel):
    label: str
    stream_id: int
    stream_url: str
    key: str

class LiveChannel(BaseModel):
    key: str
    stream_id: int
    title: str
    group: str
    logo: str
    stream_url: str
    now_playing: str = ""
    quality_variants: list[QualityVariant] = []

class MovieItem(BaseModel):
    key: str
    stream_id: int
    title: str
    group: str
    logo: str
    stream_url: str
    plot: str = ""
    genre: str = ""
    cast: str = ""
    rating: str = ""
    poster: str = ""
    year: str = ""

class SeriesItem(BaseModel):
    key: str
    series_id: int
    title: str
    group: str
    logo: str
    plot: str = ""
    genre: str = ""
    cast: str = ""
    rating: str = ""
    cover: str = ""
    year: str = ""
    seasons: list[dict] = []


# --- Végpontok ---

@router.get("/playlist/live")
async def get_playlist_live(session: dict = Depends(require_session)):
    xtream_user = session["xtream_user"]
    xtream_pass = session["xtream_pass"]

    cache_key = f"playlist:live:{xtream_user}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        raw_streams, cat_by_id = await fetch_live_streams(xtream_user, xtream_pass)
    except Exception as e:
        logger.error("Playlist live fetch failed for %s: %s", xtream_user, e)
        raise HTTPException(status_code=502, detail="Xtream API unavailable")

    channels: list[dict] = []
    for s in raw_streams:
        if not isinstance(s, dict):
            continue
        cat_id = s.get("category_id")
        group = cat_by_id.get(int(cat_id) if cat_id is not None else 0, s.get("category_name", "Egyéb"))
        stream_id = s.get("stream_id", 0)
        channels.append({
            "key": f"live_{stream_id}",
            "stream_id": stream_id,
            "title": clean_channel_title(str(s.get("name", ""))),
            "group": group,
            "logo": s.get("stream_icon", ""),
            "stream_url": f"https://{settings.SERVER_DOMAIN}/live/{xtream_user}/{xtream_pass}/{stream_id}.ts",
        })

    merged = merge_and_sort(channels)

    # Logo fallback
    missing_logos = [ch["stream_id"] for ch in merged if not ch.get("logo")]
    if missing_logos:
        try:
            async with async_session_factory() as sess:
                result = await sess.execute(
                    select(ChannelLogoModel.stream_id, ChannelLogoModel.logo_url)
                    .where(ChannelLogoModel.stream_id.in_(missing_logos))
                )
                logo_map = {row.stream_id: row.logo_url for row in result}
            for ch in merged:
                if not ch.get("logo") and ch["stream_id"] in logo_map:
                    ch["logo"] = logo_map[ch["stream_id"]]
        except Exception:
            pass

    # Tag & nyelv betöltése
    try:
        async with async_session_factory() as sess:
            sids = [ch["stream_id"] for ch in merged]
            result = await sess.execute(
                select(ChannelTagModel.stream_id, ChannelTagModel.tags, ChannelTagModel.language)
                .where(ChannelTagModel.stream_id.in_(sids))
            )
            tag_map = {row.stream_id: {"tags": row.tags or [], "language": row.language or ""} for row in result}
        for ch in merged:
            ct = tag_map.get(ch["stream_id"], {})
            ch["tags"] = ct.get("tags") or [ch["group"]]
            ch["language"] = ct.get("language") or ""
    except Exception:
        pass

    # Now playing (single query)
    try:
        now_ts = int(time.time())
        async with async_session_factory() as sess:
            from sqlalchemy import text
            epg_result = await sess.execute(
                text("SELECT channel_id, title FROM epg_programs WHERE channel_id = ANY(:ids) AND start_timestamp <= :now AND stop_timestamp >= :now ORDER BY start_timestamp DESC"),
                {"ids": [str(ch["stream_id"]) for ch in merged], "now": now_ts},
            )
            now_map = {row.channel_id: row.title for row in epg_result}
        for ch in merged:
            epg_title = now_map.get(str(ch["stream_id"]), "")
            ch["now_playing"] = epg_title
            ch["logo"] = ch.get("logo") or ""
            ch["quality_variants"] = ch.get("quality_variants") or []
    except Exception:
        pass

    response = {"channels": [ch for ch in merged], "count": len(merged)}
    try:
        await cache_set(cache_key, json.dumps(response), LIVE_CACHE_TTL)
    except Exception:
        pass
    return response


@router.get("/playlist/movies")
async def get_playlist_movies(session: dict = Depends(require_session)):
    xtream_user = session["xtream_user"]
    xtream_pass = session["xtream_pass"]

    cache_key = f"playlist:movies:{xtream_user}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        movies, cat_by_id = await fetch_vod_streams(xtream_user, xtream_pass)
    except Exception as e:
        logger.error("Playlist movies fetch failed for %s: %s", xtream_user, e)
        raise HTTPException(status_code=502, detail="Xtream API unavailable")

    stream_ids = [m.get("stream_id", 0) for m in movies if isinstance(m, dict) and m.get("stream_id")]
    tmdb_map: dict[int, dict] = {}
    if stream_ids:
        try:
            async with async_session_factory() as sess:
                result = await sess.execute(
                    select(MovieModel).where(MovieModel.stream_id.in_(stream_ids))
                )
                for row in result.scalars():
                    tmdb_map[row.stream_id] = {
                        "plot": row.plot or "",
                        "genre": row.genre or "",
                        "cast": row.cast or "",
                        "rating": row.rating or "",
                        "poster": row.poster_full or row.poster_thumb or "",
                        "year": row.year or "",
                    }
        except Exception:
            pass

    items = []
    for m in movies:
        if not isinstance(m, dict):
            continue
        sid = m.get("stream_id", 0)
        cat_id = m.get("category_id")
        group = cat_by_id.get(int(cat_id) if cat_id is not None else 0, m.get("category_name", "Egyéb"))
        enrichment = tmdb_map.get(sid, {})
        items.append({
            "key": f"movie_{sid}",
            "stream_id": sid,
            "title": m.get("name", ""),
            "group": group,
            "logo": m.get("stream_icon", ""),
            "stream_url": m.get("direct_source", "") or f"https://{settings.SERVER_DOMAIN}/movie/{xtream_user}/{xtream_pass}/{sid}.ts",
            "plot": enrichment.get("plot", ""),
            "genre": enrichment.get("genre", ""),
            "cast": enrichment.get("cast", ""),
            "rating": enrichment.get("rating", ""),
            "poster": enrichment.get("poster", m.get("stream_icon", "")),
            "year": enrichment.get("year", ""),
        })

    response = {"movies": items, "count": len(items)}
    try:
        await cache_set(cache_key, json.dumps(response), VOD_CACHE_TTL)
    except Exception:
        pass
    return response


@router.get("/playlist/series")
async def get_playlist_series(session: dict = Depends(require_session)):
    xtream_user = session["xtream_user"]
    xtream_pass = session["xtream_pass"]

    cache_key = f"playlist:series:{xtream_user}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        series, cat_by_id = await fetch_series(xtream_user, xtream_pass)
    except Exception as e:
        logger.error("Playlist series fetch failed for %s: %s", xtream_user, e)
        raise HTTPException(status_code=502, detail="Xtream API unavailable")

    series_ids = [s.get("series_id", 0) for s in series if isinstance(s, dict) and s.get("series_id")]
    tmdb_map: dict[int, dict] = {}
    if series_ids:
        try:
            async with async_session_factory() as sess:
                result = await sess.execute(
                    select(SeriesModel).where(SeriesModel.series_id.in_(series_ids))
                )
                for row in result.scalars():
                    tmdb_map[row.series_id] = {
                        "plot": row.plot or "",
                        "genre": row.genre or "",
                        "cast": row.cast or "",
                        "rating": row.rating or "",
                        "cover": row.cover or "",
                        "year": row.year or "",
                    }
        except Exception:
            pass

    items = []
    for s in series:
        if not isinstance(s, dict):
            continue
        sid = s.get("series_id", 0)
        cat_id = s.get("category_id")
        group = cat_by_id.get(int(cat_id) if cat_id is not None else 0, s.get("category_name", "Egyéb"))
        enrichment = tmdb_map.get(sid, {})
        items.append({
            "key": f"series_{sid}",
            "series_id": sid,
            "title": s.get("name", ""),
            "group": group,
            "logo": s.get("cover", ""),
            "plot": enrichment.get("plot", ""),
            "genre": enrichment.get("genre", ""),
            "cast": enrichment.get("cast", ""),
            "rating": enrichment.get("rating", ""),
            "cover": enrichment.get("cover", s.get("cover", "")),
            "year": enrichment.get("year", ""),
            "seasons": [],
        })

    response = {"series": items, "count": len(items)}
    try:
        await cache_set(cache_key, json.dumps(response), VOD_CACHE_TTL)
    except Exception:
        pass
    return response

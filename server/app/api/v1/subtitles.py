import logging

import httpx
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.config import settings
from app.services.subtitle_downloader import search_subtitles

logger = logging.getLogger(__name__)
router = APIRouter(tags=["subtitles"])


class SubtitleInfo(BaseModel):
    imdb_id: str
    language: str
    download_url: str = ""
    filename: str = ""
    release_name: str = ""


class SubtitleSearchResult(BaseModel):
    subtitles: list[SubtitleInfo]


@router.get("/subtitles/{imdb_id}", response_model=SubtitleSearchResult)
async def get_subtitles(
    imdb_id: str,
    language: str = Query("hu", min_length=2, max_length=3),
):
    if not settings.OPENSUBTITLES_API_KEY:
        raise HTTPException(status_code=400, detail="OPENSUBTITLES_API_KEY not configured")

    results = await search_subtitles(imdb_id, language, settings.OPENSUBTITLES_API_KEY)

    if not results:
        raise HTTPException(status_code=404, detail="No subtitles found")

    return SubtitleSearchResult(
        subtitles=[
            SubtitleInfo(
                imdb_id=imdb_id,
                language=language,
                download_url=f"https://live.pusztaplay.eu/api/v1/subtitles/{imdb_id}/download?language={language}&file_id={r.get('file_id', '')}",
                filename=r.get("file_name", ""),
                release_name=r.get("release", ""),
            )
            for r in results
        ]
    )


@router.get("/subtitles/{imdb_id}/download")
async def download_subtitle(
    imdb_id: str,
    language: str = Query("hu"),
    file_id: str = Query(""),
):
    if not file_id:
        results = await search_subtitles(imdb_id, language, settings.OPENSUBTITLES_API_KEY)
        if not results:
            raise HTTPException(status_code=404)
        file_id = results[0].get("file_id", "")

    download_url = f"https://api.opensubtitles.com/api/v1/download"
    headers = {
        "Api-Key": settings.OPENSUBTITLES_API_KEY,
        "User-Agent": "PusztaPlayer v1.0",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            download_url,
            headers=headers,
            json={"file_id": int(file_id) if file_id.isdigit() else file_id},
        )
        resp.raise_for_status()
        data = resp.json()
        link = data.get("link", "")

    if not link:
        raise HTTPException(status_code=404, detail="Subtitle download link not available")

    return RedirectResponse(url=link)

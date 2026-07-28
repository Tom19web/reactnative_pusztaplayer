import httpx
import logging

logger = logging.getLogger(__name__)


async def search_subtitles(imdb_id: str, language: str, api_key: str) -> list[dict]:
    url = "https://api.opensubtitles.com/api/v1/subtitles"
    params: dict = {}
    if imdb_id.startswith("tt"):
        params["imdb_id"] = imdb_id
    else:
        params["imdb_id"] = f"tt{imdb_id.lstrip('tt')}"
    params["languages"] = language
    params["order_by"] = "download_count"
    params["page"] = 1

    headers = {
        "Api-Key": api_key,
        "User-Agent": "PusztaPlayer v1.0",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("data", [])
            return [
                {
                    "file_id": str(r.get("attributes", {}).get("files", [{}])[0].get("file_id", "")),
                    "file_name": r.get("attributes", {}).get("files", [{}])[0].get("file_name", ""),
                    "release": r.get("attributes", {}).get("release", ""),
                    "download_count": r.get("attributes", {}).get("download_count", 0),
                }
                for r in results[:5]
            ]
    except Exception as e:
        logger.error("OpenSubtitles search failed: %s", e)
        return []

import logging
from typing import Any

import httpx
from app.config import settings

logger = logging.getLogger(__name__)


async def _api_get(
    username: str,
    password: str,
    action: str = "",
    extra: str = "",
) -> list[dict[str, Any]]:
    url = f"{settings.XTREAM_API_BASE}/player_api.php?username={username}&password={password}"
    if action:
        url += f"&action={action}"
    url += extra

    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        return resp.json()


async def fetch_live_streams(
    username: str,
    password: str,
) -> tuple[list[dict[str, Any]], dict[int, str]]:
    """Fetch live streams + categories. Returns (streams, cat_id→name)."""
    streams, cats = await _api_get(username, password, "get_live_streams"), await _api_get(
        username, password, "get_live_categories"
    )
    cat_by_id: dict[int, str] = {}
    if isinstance(cats, list):
        for c in cats:
            cat_by_id[int(c.get("category_id", 0))] = c.get("category_name", "Egyéb")
    else:
        logger.warning("Unexpected categories response: %s", type(cats))
    return streams, cat_by_id

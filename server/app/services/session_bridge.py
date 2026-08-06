"""Shared Xtream credential resolver — session-first, .env fallback."""
import json
from app.config import settings
from app.redis import get_redis


async def get_xtream_credentials() -> tuple[str, str] | tuple[None, None]:
    """Scan Redis sessions for Xtream credentials. Falls back to .env admin creds."""
    try:
        r = await get_redis()
        keys = [k async for k in r.scan_iter(match="session:*")]
        if keys:
            data = json.loads(await r.get(keys[0]) or "{}")
            u = data.get("xtream_user")
            p = data.get("xtream_pass")
            if u and p:
                return u, p
        if settings.XTREAM_USERNAME and settings.XTREAM_PASSWORD:
            return settings.XTREAM_USERNAME, settings.XTREAM_PASSWORD
        return None, None
    except Exception:
        if settings.XTREAM_USERNAME and settings.XTREAM_PASSWORD:
            return settings.XTREAM_USERNAME, settings.XTREAM_PASSWORD
        return None, None

import secrets
import json
import logging

import redis.asyncio as aioredis
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.redis import get_redis

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

SESSION_TTL = 604800  # 7 days


async def create_session(xtream_user: str, xtream_pass: str) -> str:
    """Store credentials in Redis, return session token."""
    token = secrets.token_hex(32)
    data = json.dumps({"xtream_user": xtream_user, "xtream_pass": xtream_pass})
    try:
        redis = await get_redis()
        await redis.setex(f"session:{token}", SESSION_TTL, data)
    except aioredis.RedisError as e:
        logger.error("Redis error creating session: %s", e)
        raise HTTPException(status_code=503, detail="Session service unavailable")
    logger.info("Session created for user %s (ttl=%ds)", xtream_user, SESSION_TTL)
    return token


async def delete_session(token: str) -> None:
    try:
        redis = await get_redis()
        await redis.delete(f"session:{token}")
    except aioredis.RedisError as e:
        logger.error("Redis error deleting session: %s", e)


async def require_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str]:
    """FastAPI dependency: extract and validate session token from Bearer header."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
        )
    token = credentials.credentials
    try:
        redis = await get_redis()
        data = await redis.get(f"session:{token}")
    except aioredis.RedisError as e:
        logger.error("Redis error validating session: %s", e)
        raise HTTPException(status_code=503, detail="Session service unavailable")
    if not data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    session = json.loads(data)
    try:
        await redis.expire(f"session:{token}", SESSION_TTL)
    except aioredis.RedisError as e:
        logger.warning("Redis error refreshing session TTL: %s", e)
    return session

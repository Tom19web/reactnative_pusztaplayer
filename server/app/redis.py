from datetime import datetime, UTC

import redis.asyncio as aioredis
from app.config import settings

redis_client: aioredis.Redis | None = None


async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return redis_client


async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None


async def cache_get(key: str) -> str | None:
    r = await get_redis()
    return await r.get(key)


async def cache_set(key: str, value: str, ttl_seconds: int = 21600):
    r = await get_redis()
    await r.setex(key, ttl_seconds, value)

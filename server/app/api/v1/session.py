from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.auth import create_session, delete_session
from app.redis import get_redis

router = APIRouter(tags=["session"])
SESSION_RATE_LIMIT = 5
SESSION_RATE_WINDOW = 60


class SessionRegisterRequest(BaseModel):
    api_key: str = ""
    xtream_user: str
    xtream_pass: str


class SessionResponse(BaseModel):
    session_token: str
    expires_in: int = 86400


@router.post("/session/register", response_model=SessionResponse)
async def session_register(req: SessionRegisterRequest, request: Request):
    if not req.xtream_user or not req.xtream_pass:
        raise HTTPException(status_code=400, detail="Missing Xtream credentials")

    # Rate limit: 5 registrations per minute per IP (proxy-aware)
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()
    rate_key = f"rate:session:{client_ip}"
    try:
        redis = await get_redis()
        count = await redis.incr(rate_key)
        if count == 1:
            await redis.expire(rate_key, SESSION_RATE_WINDOW)
        if count > SESSION_RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Túl sok próbálkozás. Próbáld újra 1 perc múlva.")
    except HTTPException:
        raise
    except Exception:
        pass  # Degrade gracefully if Redis is down

    token = await create_session(req.xtream_user, req.xtream_pass)
    return SessionResponse(session_token=token)


@router.post("/session/logout")
async def session_logout(token: str):
    await delete_session(token)
    return {"status": "ok"}

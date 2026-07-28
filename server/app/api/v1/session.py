from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.auth import create_session, delete_session

router = APIRouter(tags=["session"])


class SessionRegisterRequest(BaseModel):
    api_key: str = ""
    xtream_user: str
    xtream_pass: str


class SessionResponse(BaseModel):
    session_token: str
    expires_in: int = 86400


@router.post("/session/register", response_model=SessionResponse)
async def session_register(req: SessionRegisterRequest):
    if not req.xtream_user or not req.xtream_pass:
        raise HTTPException(status_code=400, detail="Missing Xtream credentials")
    token = await create_session(req.xtream_user, req.xtream_pass)
    return SessionResponse(session_token=token)


@router.post("/session/logout")
async def session_logout(token: str):
    await delete_session(token)
    return {"status": "ok"}

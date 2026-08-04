import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.models import UserProfileModel
from app.services.epg_matcher import run_epg_golf_match

router = APIRouter(tags=["profiles"])
_basic = HTTPBasic()


def _verify_cron_auth(credentials: HTTPBasicCredentials = Depends(_basic)):
    if not settings.ADMIN_USER or not settings.ADMIN_PASS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin auth not configured")
    if not secrets.compare_digest(credentials.username, settings.ADMIN_USER):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    if not secrets.compare_digest(credentials.password, settings.ADMIN_PASS):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


@router.post("/profiles/register")
async def register_fcm_token(
    profile_id: str,
    fcm_token: str,
    interests: str = "",
    db: AsyncSession = Depends(get_db),
):
    interests_list = [i.strip() for i in interests.split(",") if i.strip()] if interests else []

    stmt = select(UserProfileModel).where(UserProfileModel.profile_id == profile_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        user.fcm_token = fcm_token
        if interests_list:
            user.interests = interests_list
    else:
        user = UserProfileModel(
            profile_id=profile_id,
            fcm_token=fcm_token,
            interests=interests_list,
            is_active=True,
        )
        db.add(user)

    await db.flush()
    return {"status": "ok", "profile_id": profile_id, "interests_count": len(interests_list)}


@router.post("/profiles/golf-check", dependencies=[Depends(_verify_cron_auth)])
async def trigger_golf_check(_db: AsyncSession = Depends(get_db)):
    await run_epg_golf_match()
    return {"status": "golf_scan_complete"}

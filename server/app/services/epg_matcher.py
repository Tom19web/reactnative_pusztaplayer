import json
import logging
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.models import EpgProgramModel, UserProfileModel

logger = logging.getLogger(__name__)

CHECK_WINDOW_SECONDS = 24 * 3600
NOTIFY_BEFORE_SECONDS = 600


async def run_epg_golf_match():
    """Scan upcoming 24h EPG against user interests. Trigger FCM push 10min before."""
    async with async_session_factory() as session:
        users = await _get_active_users_with_interests(session)
        if not users:
            logger.info("No active users with interests found")
            return

        now_ts = int(datetime.now(UTC).timestamp())
        future_window = now_ts + CHECK_WINDOW_SECONDS

        stmt = (
            select(EpgProgramModel)
            .where(
                EpgProgramModel.start_timestamp.between(now_ts, future_window),
                EpgProgramModel.ai_enriched.isnot(None),
            )
            .order_by(EpgProgramModel.start_timestamp.asc())
        )
        result = await session.execute(stmt)
        upcoming = result.scalars().all()

        if not upcoming:
            logger.info("No enriched EPG programs in the next 24h")
            return

        matches = _match_interests(users, upcoming)
        for match in matches:
            user, program = match["user"], match["program"]
            time_until_start = program.start_timestamp - now_ts
            should_notify_now = 0 <= time_until_start <= NOTIFY_BEFORE_SECONDS

            if should_notify_now and user.fcm_token:
                _send_push(user.fcm_token, program)

            logger.info(
                "Golf match: user=%s program=%s in %ds notify=%s",
                user.profile_id, program.title, time_until_start, should_notify_now,
            )

        if matches:
            logger.info("Golf-Riaszto scan complete: %d matches found", len(matches))
        else:
            logger.info("Golf-Riaszto scan complete: 0 matches found")


async def _get_active_users_with_interests(session: AsyncSession) -> list[UserProfileModel]:
    stmt = select(UserProfileModel).where(UserProfileModel.is_active.is_(True))
    result = await session.execute(stmt)
    users = result.scalars().all()
    return [
        u for u in users
        if u.interests and isinstance(u.interests, list) and len(u.interests) > 0
    ]


def _match_interests(
    users: list[UserProfileModel],
    programs: list[EpgProgramModel],
) -> list[dict]:
    matches = []
    for user in users:
        interests_lower = {i.lower().strip() for i in user.interests if isinstance(i, str)}
        if not interests_lower:
            continue
        for prog in programs:
            if _program_matches_interest(prog, interests_lower):
                matches.append({"user": user, "program": prog})
    return matches


def _program_matches_interest(prog: EpgProgramModel, interests: set[str]) -> bool:
    search_text = f"{prog.title or ''} {prog.description or ''}".lower()
    if prog.ai_enriched and isinstance(prog.ai_enriched, dict):
        enriched = prog.ai_enriched
        for field in ("genres", "cast", "tropes"):
            items = enriched.get(field, [])
            if isinstance(items, list):
                search_text += " " + " ".join(str(i).lower() for i in items)
    return any(interest in search_text for interest in interests)


def _send_push(fcm_token: str, program: EpgProgramModel):
    from app.services.fcm_sender import init_fcm, send_push_notification

    try:
        init_fcm(settings.FCM_CREDENTIALS_JSON)
    except Exception:
        logger.warning("FCM init failed, push notifications disabled")
        return

    import asyncio
    title = f"Kezdodik: {program.clean_title or program.title}"
    body = program.description[:120] if program.description else "Ne maradj le!"
    asyncio.ensure_future(
        send_push_notification(
            token=fcm_token,
            title=title,
            body=body,
            stream_id=0,
        )
    )

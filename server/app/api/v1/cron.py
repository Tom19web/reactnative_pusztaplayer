import asyncio
import logging
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.config import settings
from app.services.epg_matcher import run_epg_golf_match

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cron"])

_basic = HTTPBasic()


def _verify_cron_auth(credentials: HTTPBasicCredentials = Depends(_basic)):
    if not secrets.compare_digest(credentials.username, settings.ADMIN_USER or ""):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    if not secrets.compare_digest(credentials.password, settings.ADMIN_PASS or ""):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


async def _run_epg_import_async():
    proc = await asyncio.create_subprocess_exec(
        "python3", "/app/scripts/import_epg.py",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    await proc.wait()


@router.post("/cron/epg-enrich-and-match", dependencies=[Depends(_verify_cron_auth)])
async def cron_epg_enrich_and_match():
    """Scheduled job: enrich upcoming EPG then run Golf-Riaszto matching."""
    logger.info("Cron: EPG enrich + Golf match started")
    try:
        await run_epg_golf_match()
    except Exception as e:
        logger.error("Cron EPG match failed: %s", e)
        return {"status": "error", "detail": str(e)}
    return {"status": "ok", "message": "Golf-Riaszto scan completed"}


@router.post("/cron/epg-import", dependencies=[Depends(_verify_cron_auth)])
async def cron_epg_import(background_tasks: BackgroundTasks):
    logger.info("Cron: EPG XMLTV import started (background)")
    background_tasks.add_task(_run_epg_import_async)
    return {"status": "ok", "message": "EPG import started in background"}

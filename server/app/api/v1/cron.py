import logging

from fastapi import APIRouter

from app.services.epg_matcher import run_epg_golf_match

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cron"])


@router.post("/cron/epg-enrich-and-match")
async def cron_epg_enrich_and_match():
    """Scheduled job: enrich upcoming EPG then run Golf-Riaszto matching."""
    logger.info("Cron: EPG enrich + Golf match started")
    try:
        await run_epg_golf_match()
    except Exception as e:
        logger.error("Cron EPG match failed: %s", e)
        return {"status": "error", "detail": str(e)}
    return {"status": "ok", "message": "Golf-Riaszto scan completed"}

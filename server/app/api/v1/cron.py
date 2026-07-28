import logging

from fastapi import APIRouter, BackgroundTasks

from app.services.epg_matcher import run_epg_golf_match

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cron"])


def _run_epg_import_sync():
    import asyncio
    from app.scripts.import_epg_xmltv import main as epg_main
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.run(epg_main())
    else:
        import nest_asyncio  # type: ignore
        nest_asyncio.apply()
        asyncio.get_event_loop().run_until_complete(epg_main())


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


@router.post("/cron/epg-import")
async def cron_epg_import(background_tasks: BackgroundTasks):
    """Scheduled job: check Xtream EPG coverage, fill gaps via XMLTV."""
    logger.info("Cron: EPG XMLTV import started (background)")
    background_tasks.add_task(_run_epg_import_sync)
    return {"status": "ok", "message": "EPG import started in background"}

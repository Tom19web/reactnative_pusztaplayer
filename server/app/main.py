"""
PusztaPlayer API - Fő Belépési Pont
Verzió: 2.0.0 (Unified AI & BFF Engine)
"""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import text
import secrets

from app.config import settings
from app.database import engine, async_session_factory
from app.redis import get_redis, close_redis

# --- Routers importálása ---
from app.api.v1.search import router as search_router
from app.api.v1.epg import router as epg_router
from app.api.v1.enrich import router as enrich_router
from app.api.v1.subtitles import router as subtitles_router
from app.api.v1.profiles import router as profiles_router
from app.api.v1.cron import router as cron_router
from app.api.v1.radio_api import router as radio_router
from app.api.v1.recommend import router as recommend_router
from app.api.v1.qr_auth import router as qr_auth_router
from app.api.v1.episodes import router as episodes_router
from app.api.v1.session import router as session_router
from app.api.v1.live import router as live_router
from app.api.v1.playlist import router as playlist_router
from app.api.v1.admin import router as admin_router
from app.api.v1.ai import router as ai_router  # 🚀 AZ ÚJ UNIFIED AI PROXY!
from app.api.v1.cast_search import router as cast_search_router

# --- Admin Auth (must be defined before router registration) ---
security = HTTPBasic()
ADMIN_USER = settings.ADMIN_USER
ADMIN_PASS = settings.ADMIN_PASS

def verify_admin_access(credentials: HTTPBasicCredentials = Depends(security)):
    is_user_valid = secrets.compare_digest(credentials.username, ADMIN_USER)
    is_pass_valid = secrets.compare_digest(credentials.password, ADMIN_PASS)
    if not (is_user_valid and is_pass_valid):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hozzáférés megtagadva.",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # 1. Bemelegítés (Warmup fázis)
    logger.info("👑 PusztaPlayer Backend feléledése... Rendszerek inicializálása.")
    # Ide jöhet majd a globális AI HTTP kliens felébresztése is!
    
    yield  # A szerver itt fogadja a kéréseket
    
    # 2. Leállítás (Teardown fázis)
    logger.info("🛑 PusztaPlayer Backend leállása... Kapcsolatok kíméletes bontása.")
    await engine.dispose()
    await close_redis()


app = FastAPI(
    title="PusztaPlayer BFF & AI Engine",
    version="2.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Globális Hibakezelő (A tökéletes JSON kimenetért) ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Végzetes hiba a %s végponton: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error", 
            "detail": str(exc) if settings.DEBUG else "A PusztaPlayer szerver pillanatnyi zavarral küzd."
        }
    )

# --- Végpontok (Routers) Regisztrálása ---
app.include_router(ai_router, prefix="/api/v1")  # Az új büszkeségünk legelöl!
app.include_router(search_router, prefix="/api/v1")
app.include_router(epg_router, prefix="/api/v1")
app.include_router(enrich_router, prefix="/api/v1")
app.include_router(subtitles_router, prefix="/api/v1")
app.include_router(profiles_router, prefix="/api/v1")
app.include_router(cron_router, prefix="/api/v1")
app.include_router(radio_router, prefix="/api/v1")
app.include_router(recommend_router, prefix="/api/v1")
app.include_router(qr_auth_router, prefix="/api/v1")
app.include_router(episodes_router, prefix="/api/v1")
app.include_router(session_router, prefix="/api/v1")
app.include_router(live_router, prefix="/api/v1")
app.include_router(playlist_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1", dependencies=[Depends(verify_admin_access)])
app.include_router(cast_search_router, prefix="/api/v1")


# --- Az IGAZI Health Check ---
@app.get("/health", tags=["System"])
async def health_check():
    """Rárúgja az ajtót az adatbázisra és a Redisre, hogy ne hazudjon a státuszról."""
    status_dict = {
        "status": "ok", 
        "version": "2.0.0", 
        "domain": settings.SERVER_DOMAIN, 
        "services": {}
    }
    
    # 1. PostgreSQL teszt
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        status_dict["services"]["postgres"] = "online"
    except Exception as e:
        status_dict["status"] = "degraded"
        status_dict["services"]["postgres"] = f"offline ({str(e)})"

    # 2. Redis teszt
    try:
        redis = await get_redis()
        await redis.ping()
        status_dict["services"]["redis"] = "online"
    except Exception as e:
        status_dict["status"] = "degraded"
        status_dict["services"]["redis"] = f"offline ({str(e)})"

    return JSONResponse(
        status_code=200 if status_dict["status"] == "ok" else 503,
        content=status_dict
    )
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Statikus fájlok és a védett admin végpont csatolása
app.mount("/admin-assets", StaticFiles(directory="app/static"), name="static")

@app.get("/admin", include_in_schema=False)
async def serve_admin_dashboard(username: str = Depends(verify_admin_access)):
    """Csak a legkiváltságosabb adminisztrátor számára elérhető vezérlőpult."""
    return FileResponse("app/static/admin.html")
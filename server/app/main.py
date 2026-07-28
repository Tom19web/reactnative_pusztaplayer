from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.redis import close_redis
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


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()
    await close_redis()


app = FastAPI(
    title="PusztaPlayer API",
    version="1.0.0",
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


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0", "domain": "live.pusztaplay.eu"}

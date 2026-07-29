"""
PusztaPlayer - Élő Csatornák (Live BFF) Router
Optimalizált Redis cache-eléssel és memóriabarát SQL Chunking logikával.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select  # PEP8 tisztelet: Az import a helyére került!

from app.config import settings
from app.core.auth import require_session
from app.core.xtream_client import fetch_live_streams
from app.core.channel_merger import clean_channel_title, merge_and_sort
from app.models.models import ChannelLogoModel
from app.database import async_session_factory
from app.redis import cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter(tags=["live"])


# --- DTOs ---

class QualityVariant(BaseModel):
    label: str
    stream_id: int
    stream_url: str
    key: str

class ChannelItem(BaseModel):
    key: str
    stream_id: int
    title: str
    group: str
    logo: str
    stream_url: str
    quality_variants: list[QualityVariant] = []

class LiveStreamsResponse(BaseModel):
    channels: list[ChannelItem]
    groups: list[str]


# --- Végpont ---

@router.get("/live/streams", response_model=LiveStreamsResponse)
async def get_live_streams(
    session: dict = Depends(require_session),
):
    xtream_user = session["xtream_user"]
    xtream_pass = session["xtream_pass"]

    # 1. 🚀 REDIS CACHE ELLENŐRZÉS (Ne gyilkoljuk az Xtream szervert feleslegesen!)
    cache_key = f"live:streams:{xtream_user}"
    cached = await cache_get(cache_key)
    if cached:
        return LiveStreamsResponse(**json.loads(cached))

    # 2. ADATOK LEKÉRÉSE AZ XTREAM API-TÓL
    try:
        raw_streams, cat_by_id = await fetch_live_streams(xtream_user, xtream_pass)
    except Exception as e:
        logger.error("Xtream live fetch failed for user %s: %s", xtream_user, e)
        raise HTTPException(status_code=502, detail="Xtream API jelenleg nem elérhető")

    groups: set[str] = set()
    channels: list[dict] = []

    for i, s in enumerate(raw_streams):
        raw_cat_id = s.get("category_id")
        group = cat_by_id.get(int(raw_cat_id) if raw_cat_id is not None else 0, s.get("category_name", "Egyéb"))
        groups.add(group)
        
        raw_title = s.get("name", "Ismeretlen csatorna")
        clean_title = clean_channel_title(str(raw_title))
        stream_id = s.get("stream_id", i)
        key = f"live_{stream_id}"
        
        channels.append({
            "key": key,
            "stream_id": stream_id,
            "title": clean_title,
            "group": group,
            "logo": s.get("stream_icon", ""),
            "stream_url": f"https://{settings.SERVER_DOMAIN}/live/{xtream_user}/{xtream_pass}/{stream_id}.ts",
        })

    # Csatornák tisztítása és minőség alapján történő összevonása
    merged = merge_and_sort(channels)

    # 3. 🛡️ BIZTONSÁGOS LOGÓ FALLBACK (Chunking a memória védelmében!)
    missing_logo_ids = [ch["stream_id"] for ch in merged if not ch.get("logo")]
    if missing_logo_ids:
        logo_map = {}
        try:
            async with async_session_factory() as sess:
                chunk_size = 1000
                # A hatalmas lista 1000-es darabokra vágása, hogy a Postgres ne kapjon sokkot
                for i in range(0, len(missing_logo_ids), chunk_size):
                    chunk = missing_logo_ids[i:i + chunk_size]
                    result = await sess.execute(
                        select(ChannelLogoModel.stream_id, ChannelLogoModel.logo_url)
                        .where(ChannelLogoModel.stream_id.in_(chunk))
                    )
                    logo_map.update({row.stream_id: row.logo_url for row in result})
            
            # Visszapótlás a memóriában
            for ch in merged:
                if not ch.get("logo") and ch["stream_id"] in logo_map:
                    ch["logo"] = logo_map[ch["stream_id"]]
        except Exception as e:
            logger.debug("Logo fallback lookup failed: %s", e)

    # Válasz objektum összeállítása
    response_obj = LiveStreamsResponse(
        channels=[ChannelItem(**ch) for ch in merged],
        groups=sorted(groups),
    )

    # 4. 💾 MENTÉS A REDIS CACHE-BE (TTL: 30 perc = 1800 másodperc)
    try:
        await cache_set(cache_key, response_obj.model_dump_json(), ttl=1800)
    except Exception as e:
        logger.warning("Nem sikerült elmenteni a live streameket a Redisbe a(z) %s felhasználónak: %s", xtream_user, e)

    return response_obj
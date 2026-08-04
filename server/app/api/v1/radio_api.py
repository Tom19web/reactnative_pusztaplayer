from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import ipaddress
import socket
import re
from urllib.parse import urlparse

from app.database import get_db_readonly
from app.redis import cache_get, cache_set
from app.models.models import RadioStationModel
from app.core.icy_meta import fetch_metadata_with_fallback

router = APIRouter(tags=["radio"])


class RadioStationOut(BaseModel):
    id: int
    name: str
    stream_url: str
    favicon: str = ""
    tags: str = ""
    bitrate: int = 0
    codec: str = ""
    votes: int = 0

    class Config:
        from_attributes = True


@router.get("/radio", response_model=list[RadioStationOut])
async def get_radio_stations(
    limit: int = Query(300, ge=1, le=500),
    tag: str | None = Query(None),
    db: AsyncSession = Depends(get_db_readonly),
):
    stmt = (
        select(RadioStationModel)
        .where(RadioStationModel.is_active == True)
    )
    if tag:
        stmt = stmt.where(RadioStationModel.tags.ilike(f"%{tag}%"))
    stmt = stmt.order_by(RadioStationModel.votes.desc()).limit(limit)

    result = await db.execute(stmt)
    stations = result.scalars().all()
    return stations


class RadioMetadataResponse(BaseModel):
    title: str = ""

# Privát/loopback IP tartományok (HTTP streaming-re nem érvényesek)
_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]
_SAFE_PORT_RE = re.compile(r"^(:80|:443|:\d{4,5})$")


def _validate_stream_url(stream_url: str) -> None:
    parsed = urlparse(stream_url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "Only http/https stream URLs are allowed")
    host = parsed.hostname
    if not host:
        raise HTTPException(400, "Invalid stream URL — no host")
    try:
        ip = ipaddress.ip_address(host)
        for net in _PRIVATE_NETS:
            if ip in net:
                raise HTTPException(400, "Private/internal IP addresses are not allowed")
    except ValueError:
        pass  # hostname, DNS resolution below
    port = f":{parsed.port}" if parsed.port else ""
    if port and not _SAFE_PORT_RE.match(port):
        raise HTTPException(400, f"Port {parsed.port} is not allowed for streaming")


@router.get("/radio/metadata", response_model=RadioMetadataResponse)
async def get_radio_metadata(
    stream_url: str = Query(..., min_length=1),
):
    """Fetch current song title from an ICY/Shoutcast radio stream."""
    _validate_stream_url(stream_url)
    cache_key = f"icy:meta:{stream_url}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return RadioMetadataResponse(title=cached)

    result = await fetch_metadata_with_fallback(stream_url)
    title = result.get("title", "")

    # Cache successful results 30s, empty results 10s (to allow recovery)
    ttl = 30 if title else 10
    await cache_set(cache_key, title, ttl_seconds=ttl)

    return RadioMetadataResponse(title=title)

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text

from app.database import async_session_factory
from app.models.models import RadioStationModel

from ._shared import logger

router = APIRouter(tags=["admin"])


# ─── Radio Station Management ──────────────────────


@router.get("/admin/radio")
async def list_radio_stations(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    search: str = Query("", max_length=200),
    tag: str = Query("", max_length=100),
    country: str = Query("", max_length=100),
    language: str = Query("", max_length=100),
    active_only: bool = Query(False),
    no_logo: bool = Query(False),
    dup_only: bool = Query(False),
    icy_meta: str = Query("", max_length=10),
    sort: str = Query("votes", max_length=30),
    order: str = Query("desc", max_length=4),
):
    offset = (page - 1) * per_page
    sort_whitelist = {
        "name", "stream_url", "favicon", "tags", "country", "state",
        "language", "codec", "bitrate", "votes", "is_active", "created_at", "station_uuid",
    }
    if sort not in sort_whitelist:
        sort = "votes"
    direction = "ASC" if order.lower() == "asc" else "DESC"

    async with async_session_factory() as sess:
        count_q = "SELECT COUNT(*) FROM radio_stations WHERE 1=1"
        data_q = "SELECT id, station_uuid, name, stream_url, favicon, homepage, tags, country, state, language, codec, bitrate, votes, is_active, created_at, icy_meta_title, icy_meta_checked_at FROM radio_stations WHERE 1=1"
        params: dict = {"limit": per_page, "offset": offset}

        if search:
            cond = " AND (name ILIKE :search OR station_uuid ILIKE :search)"
            count_q += cond
            data_q += cond
            params["search"] = f"%{search}%"
        if tag:
            cond = " AND tags ILIKE :tag"
            count_q += cond
            data_q += cond
            params["tag"] = f"%{tag}%"
        if country:
            cond = " AND country ILIKE :country"
            count_q += cond
            data_q += cond
            params["country"] = f"%{country}%"
        if language:
            cond = " AND language ILIKE :language"
            count_q += cond
            data_q += cond
            params["language"] = f"%{language}%"
        if active_only:
            cond = " AND is_active = true"
            count_q += cond
            data_q += cond
        if no_logo:
            cond = " AND (favicon IS NULL OR favicon = '')"
            count_q += cond
            data_q += cond
        if dup_only:
            cond = (
                " AND stream_url IN ("
                " SELECT stream_url FROM radio_stations"
                " WHERE stream_url IS NOT NULL AND stream_url != ''"
                " GROUP BY stream_url HAVING COUNT(*) > 1)"
            )
            count_q += cond
            data_q += cond

        result = await sess.execute(text(count_q), params)
        total = result.scalar() or 0

        data_q += f" ORDER BY {sort} {direction} NULLS LAST, name ASC LIMIT :limit OFFSET :offset"
        result = await sess.execute(text(data_q), params)
        rows = result.fetchall()

    stations = []
    for r in rows:
        stations.append({
            "id": r[0],
            "station_uuid": r[1],
            "name": r[2],
            "stream_url": r[3],
            "favicon": r[4],
            "homepage": r[5],
            "tags": r[6] or "",
            "country": r[7] or "",
            "state": r[8] or "",
            "language": r[9] or "",
            "codec": r[10] or "",
            "bitrate": r[11],
            "votes": r[12],
            "is_active": bool(r[13]),
            "created_at": str(r[14]) if r[14] else None,
            "icy_meta": {
                "has_meta": bool(r[15]) if r[16] else None,
                "title": r[15],
                "checked_at": str(r[16]) if r[16] else None,
            } if r[16] else None,
        })

    # Poszt-filter: icy_meta
    if icy_meta == "has":
        stations = [s for s in stations if s.get("icy_meta") and s["icy_meta"].get("has_meta")]
    elif icy_meta == "no":
        stations = [s for s in stations if not s.get("icy_meta") or s["icy_meta"].get("has_meta") is False]
    elif icy_meta == "unchecked":
        stations = [s for s in stations if s.get("icy_meta") is None]

    return {"stations": stations, "total": total, "page": page, "pages": max(1, (total + per_page - 1) // per_page)}


@router.post("/admin/radio/batch-deactivate")
async def batch_deactivate_radio(payload: dict):
    """Tömeges deaktiválás. payload: {"uuids": ["rapidapi_1", ...]}"""
    uuids = payload.get("uuids") or []
    if not uuids or not isinstance(uuids, list):
        raise HTTPException(400, "No station UUIDs provided")
    uuids = [str(u)[:200] for u in uuids if str(u).strip()]
    if not uuids:
        raise HTTPException(400, "No station UUIDs provided")
    async with async_session_factory() as sess:
        result = await sess.execute(
            text("UPDATE radio_stations SET is_active = false WHERE station_uuid = ANY(:uuids)"),
            {"uuids": uuids},
        )
        await sess.commit()
        updated = result.rowcount
    return {"deactivated": updated}


@router.post("/admin/radio/purge-deactivated")
async def purge_deactivated_radio():
    """Fizikailag törli az összes deaktivált rádióállomást az adatbázisból."""
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.is_active == False)
        )
        stations = result.scalars().all()
        count = len(stations)
        for s in stations:
            await sess.delete(s)
        await sess.commit()
    return {"ok": True, "purged": count}


@router.get("/admin/radio/check-meta")
async def check_radio_meta(station_uuid: str = Query("")):
    """Single or bulk ICY meta check. Eredmény DB-be mentve (7 napig cache-elve)."""
    from app.core.icy_meta import fetch_metadata_with_fallback
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.is_active == True)
        )
        stations = result.scalars().all()

    # Single station check
    if station_uuid:
        station = next((s for s in stations if s.station_uuid == station_uuid), None)
        if not station:
            return {"error": "Station not found"}
        # Check if already cached in DB (< 7 days)
        if station.icy_meta_checked_at and (now - station.icy_meta_checked_at).total_seconds() < 604800:
            return {"station_uuid": station_uuid, "name": station.name,
                    "has_meta": bool(station.icy_meta_title), "title": station.icy_meta_title, "cached": True}
        try:
            meta = await fetch_metadata_with_fallback(station.stream_url)
            title = meta.get("title", "")
        except Exception:
            title = ""
        async with async_session_factory() as sess:
            stmt = select(RadioStationModel).where(RadioStationModel.station_uuid == station_uuid)
            r2 = await sess.execute(stmt)
            s = r2.scalar_one_or_none()
            if s:
                s.icy_meta_title = title or None
                s.icy_meta_checked_at = now
                await sess.commit()
        return {"station_uuid": station_uuid, "name": station.name,
                "has_meta": bool(title), "title": title or None, "cached": False}

    # Bulk check (DB cache-first)
    checked = with_meta = without_meta = 0
    skipped = sum(1 for s in stations if s.icy_meta_checked_at and (now - s.icy_meta_checked_at).total_seconds() < 604800)

    for s in stations:
        if s.icy_meta_checked_at and (now - s.icy_meta_checked_at).total_seconds() < 604800:
            continue
        try:
            meta = await fetch_metadata_with_fallback(s.stream_url)
            title = meta.get("title", "")
            checked += 1
            if title: with_meta += 1
            else: without_meta += 1
        except Exception:
            without_meta += 1
            title = ""
            checked += 1
        async with async_session_factory() as sess:
            stmt = select(RadioStationModel).where(RadioStationModel.station_uuid == s.station_uuid)
            r2 = await sess.execute(stmt)
            sobj = r2.scalar_one_or_none()
            if sobj:
                sobj.icy_meta_title = title or None
                sobj.icy_meta_checked_at = now
                await sess.commit()

    return {
        "total": len(stations),
        "checked": checked,
        "skipped_cached": skipped,
        "with_meta": with_meta,
        "without_meta": without_meta,
    }


@router.post("/admin/radio/{station_uuid}")
async def update_radio_station(station_uuid: str, payload: dict):
    allowed = {"name", "stream_url", "favicon", "homepage", "tags", "country", "state", "language", "codec", "bitrate", "votes", "is_active"}
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.station_uuid == station_uuid)
        )
        station = result.scalar_one_or_none()
        if not station:
            raise HTTPException(404, "Rádióállomás nem található")
        for key, value in payload.items():
            if key in allowed:
                setattr(station, key, value)
        await sess.commit()
    return {"station_uuid": station_uuid, "saved": True}


@router.delete("/admin/radio/{station_uuid}")
async def delete_radio_station(station_uuid: str):
    async with async_session_factory() as sess:
        result = await sess.execute(
            select(RadioStationModel).where(RadioStationModel.station_uuid == station_uuid)
        )
        station = result.scalar_one_or_none()
        if not station:
            raise HTTPException(404, "Rádióállomás nem található")
        station.is_active = False
        await sess.commit()
    return {"station_uuid": station_uuid, "deactivated": True}

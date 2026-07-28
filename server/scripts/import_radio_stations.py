"""Magyar radiok importalasa radio-browser API-rol.

Forras: https://de1.api.radio-browser.info/json/stations/bycountry/hungary
Futtatas: docker compose exec -e PYTHONPATH=/app fastapi python /app/scripts/import_radio_stations.py
"""

import sys; sys.path.insert(0, "/app")
import asyncio, httpx
from datetime import datetime
from sqlalchemy import select, func
from app.database import async_session_factory
from app.models.models import RadioStationModel

API_URL = "https://de1.api.radio-browser.info/json/stations/bycountry/hungary"


async def main():
    print("=" * 60)
    print("  PusztaPlayer — Magyar Radiok Importalasa")
    print("=" * 60)

    print("[1/2] Radio-browser API lekerese...")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            API_URL,
            params={
                "limit": 500,
                "order": "votes",
                "hidebroken": "true",
            },
        )
        resp.raise_for_status()
        stations = resp.json()
    print(f"  {len(stations)} magyar radio a valaszban")

    print()
    print("[2/2] Importalas az adatbazisba...")
    imported = 0
    skipped = 0
    errors = 0

    async with async_session_factory() as session:
        for i, s in enumerate(stations):
            uuid = s.get("stationuuid", "")
            name = (s.get("name") or "").strip()
            stream = (s.get("url_resolved") or s.get("url") or "").strip()

            if not uuid or not name or not stream:
                continue

            try:
                exists = await session.execute(
                    select(RadioStationModel.id).where(
                        RadioStationModel.station_uuid == uuid
                    )
                )
                if exists.scalar_one_or_none():
                    skipped += 1
                    continue

                station = RadioStationModel(
                    station_uuid=uuid,
                    name=name,
                    stream_url=stream,
                    favicon=s.get("favicon", ""),
                    homepage=s.get("homepage", ""),
                    tags=s.get("tags", ""),
                    country=s.get("country", "Hungary"),
                    state=s.get("state", ""),
                    language=s.get("language", ""),
                    codec=s.get("codec", ""),
                    bitrate=int(s.get("bitrate", 0) or 0),
                    votes=int(s.get("votes", 0) or 0),
                    is_active=True,
                )
                session.add(station)
                imported += 1
            except Exception as e:
                errors += 1

        await session.commit()

    print(f"  +{imported} uj, {skipped} mar letezo, {errors} hiba")
    print(f"  Osszesen: {imported + skipped} magyar radio az adatbazisban")
    print("=" * 60)


asyncio.run(main())

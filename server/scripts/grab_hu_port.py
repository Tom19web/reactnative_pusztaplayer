"""
Hungarian EPG grabber — pulls TV listings from port.hu JSON API.
Produces standard XMLTV output compatible with parse_xmltv().

Usage:
  docker compose exec fastapi python /app/scripts/grab_hu_port.py
  docker compose exec fastapi python /app/scripts/grab_hu_port.py --days 3
"""
import asyncio
import json
import logging
import sys
import os
from datetime import datetime, timedelta, timezone
from xml.etree.ElementTree import Element, SubElement, tostring

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("grab_hu_port")

API_ORIGIN = "https://port.hu"
INIT_URL = f"{API_ORIGIN}/tvapi/init"
PROG_URL = f"{API_ORIGIN}/tvapi?channel_id=tvchannel-{{ch_id}}" \
            "&i_datetime_from={date_from}&i_datetime_to={date_to}"
OUTPUT_FILE = "/tmp/epg_hu_port.xml"

CET = timezone(timedelta(hours=2))       # CEST
PROG_DAYS = 7


# ─── API helpers ──────────────────────────────────────

async def _fetch_json(client: httpx.AsyncClient, url: str, label: str = "") -> dict | None:
    try:
        resp = await client.get(url, timeout=30.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("  fetch failed %s: %s", label, e)
        return None


# ─── Channel list ─────────────────────────────────────

async def fetch_channels(client: httpx.AsyncClient) -> list[dict]:
    data = await _fetch_json(client, INIT_URL, "channel list")
    if not data:
        return []
    channels: list[dict] = []
    for ch in data.get("channels", []):
        cid = (ch.get("id") or "").replace("tvchannel-", "")
        name = (ch.get("name") or "").strip()
        logo = ch.get("logo", "")
        if cid and name:
            channels.append({"id": cid, "name": name, "logo": logo})
    logger.info("  %d channels from port.hu", len(channels))
    return channels


# ─── Programme fetching ───────────────────────────────

async def fetch_programmes(
    client: httpx.AsyncClient, ch_id: str, date_from: str, date_to: str,
    ch_xmltv_id: str,
) -> list[dict]:
    """date_from/date_to = YYYY-MM-DD; returns list of programme dicts."""
    url = PROG_URL.format(ch_id=ch_id, date_from=date_from, date_to=date_to)
    data = await _fetch_json(client, url, f"ch {ch_id} {date_from}")
    if not data:
        return []

    programmes: list[dict] = []
    for _ts, day_data in sorted(data.items()):
        if not isinstance(day_data, dict):
            continue
        for ch_block in day_data.get("channels", []):
            if not isinstance(ch_block, dict):
                continue
            for prog in ch_block.get("programs", []):
                title = (prog.get("title") or "").strip()
                if not title:
                    continue
                start = _ts_to_xmltv(prog.get("start_datetime"))
                end = _ts_to_xmltv(prog.get("end_datetime"))
                if not start:
                    continue
                start_ts = _parse_iso(prog.get("start_datetime"))
                stop_ts = _parse_iso(prog.get("end_datetime"))
                desc = prog.get("short_description") or prog.get("description") or ""
                programmes.append({
                    "xml_channel": ch_xmltv_id,
                    "title": title,
                    "start": start,
                    "end": end or "",
                    "start_timestamp": start_ts,
                    "stop_timestamp": stop_ts,
                    "description": desc.strip(),
                    "category": "",
                })
    return programmes


def _ts_to_xmltv(iso_str: str | None) -> str:
    """2026-07-30T19:00:00+02:00 → 20260730190000 +0200"""
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%Y%m%d%H%M%S") + " " + dt.strftime("%z").replace("+0", "+").replace("-0", "-")
    except Exception:
        return ""


def _parse_iso(iso_str: str | None) -> int:
    if not iso_str:
        return 0
    try:
        return int(datetime.fromisoformat(iso_str).timestamp())
    except Exception:
        return 0


# ─── XML builder ───────────────────────────────────────

def build_xmltv(channels: list[dict], all_progs: list[dict]) -> str:
    root = Element("tv", {
        "source-info-url": "https://port.hu/",
        "source-data-url": "https://port.hu/tvapi",
        "generator-info-name": "PusztaPlayer grab_hu_port",
    })

    for ch in channels:
        ch_el = SubElement(root, "channel", {"id": ch["xmltv_id"]})
        dn = SubElement(ch_el, "display-name")
        dn.text = ch["name"]
        if ch.get("logo"):
            icon = SubElement(ch_el, "icon", {"src": ch["logo"]})

    for prog in all_progs:
        prog_el = SubElement(root, "programme", {
            "start": prog.get("start", ""),
            "stop": prog.get("end", ""),
            "channel": prog.get("xml_channel", ""),
        })
        title_el = SubElement(prog_el, "title")
        title_el.text = prog.get("title", "")
        if prog.get("description"):
            desc_el = SubElement(prog_el, "desc")
            desc_el.text = prog.get("description", "")
        if prog.get("category"):
            cat_el = SubElement(prog_el, "category")
            cat_el.text = prog.get("category", "")

    xml_decl = '<?xml version="1.0" encoding="UTF-8"?>\n'
    return xml_decl + tostring(root, encoding="unicode")


# ─── Main ──────────────────────────────────────────────

async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=PROG_DAYS)
    parser.add_argument("--output", type=str, default=OUTPUT_FILE)
    args = parser.parse_args()

    logger.info("=== Port.hu EPG Grab ===")
    today = datetime.now(CET).strftime("%Y-%m-%d")
    end_date = (datetime.now(CET) + timedelta(days=args.days)).strftime("%Y-%m-%d")

    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        channels = await fetch_channels(client)
        if not channels:
            logger.error("No channels found, aborting.")
            return

        total = 0
        all_progs: list[dict] = []
        channel_defs: list[dict] = []

        for i, ch in enumerate(channels):
            xmltv_id = f"{ch['name'].replace(' ', '').replace('/', '-')}.hu"
            ch["xmltv_id"] = xmltv_id
            channel_defs.append(ch)

            progs = await fetch_programmes(client, ch["id"], today, end_date, xmltv_id)
            all_progs.extend(progs)
            total += len(progs)

            # Rate limit: port.hu blocks at ~120 req/s
            if (i + 1) % 20 == 0:
                logger.info("  %d/%d channels, %d programmes so far...", i + 1, len(channels), total)
            await asyncio.sleep(0.15)

        logger.info("  total: %d channels, %d programmes", len(channel_defs), total)

    xml_str = build_xmltv(channel_defs, all_progs)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(xml_str)
    logger.info("  written to %s (%.1f MB)", args.output, len(xml_str) / 1_000_000)

    # Write channel map for import pipeline (clean name → xmltv_id)
    map_file = "/tmp/epg_hu_port_map.json"
    ch_map = {ch["name"]: ch["xmltv_id"] for ch in channel_defs}
    with open(map_file, "w", encoding="utf-8") as f:
        json.dump(ch_map, f, ensure_ascii=False, indent=2)
    logger.info("  channel map written to %s (%d entries)", map_file, len(ch_map))


if __name__ == "__main__":
    asyncio.run(main())

"""XMLTV EPG parser + database import."""
import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import async_session_factory
from app.models.models import EpgProgramModel

logger = logging.getLogger(__name__)


def parse_xmltv(xml_text: str) -> list[dict]:
    """Parse XMLTV string into list of program dicts."""
    programs: list[dict] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.error("XMLTV parse error: %s", e)
        return programs

    for prog_elem in root.findall("programme"):
        start_str = prog_elem.get("start", "")
        stop_str = prog_elem.get("stop", "")
        channel_xml = prog_elem.get("channel", "")

        title_elem = prog_elem.find("title")
        desc_elem = prog_elem.find("desc")
        category_elems = prog_elem.findall("category")

        title = title_elem.text.strip() if title_elem is not None and title_elem.text else ""
        description = desc_elem.text.strip() if desc_elem is not None and desc_elem.text else ""
        categories = [c.text.strip() for c in category_elems if c.text] if category_elems else []

        start_ts = _parse_timestamp(start_str)
        stop_ts = _parse_timestamp(stop_str)

        if start_ts > 0 and stop_ts > start_ts:
            programs.append({
                "id": f"xmltv_{channel_xml}_{start_ts}",
                "channel_id": channel_xml,
                "channel_name": "",
                "title": title or "Ismeretlen",
                "start": start_str,
                "end": stop_str,
                "start_timestamp": start_ts,
                "stop_timestamp": stop_ts,
                "description": description,
                "category": ", ".join(categories) if categories else "",
                "xml_channel": channel_xml,
            })

    return programs


def _parse_timestamp(ts_str: str) -> int:
    """Parse XMLTV timestamp (e.g. 20250728120000 +0200) to Unix epoch."""
    if not ts_str:
        return 0
    ts_str = ts_str.strip()
    # Handles "20250728120000 +0200"
    try:
        dt = datetime.strptime(ts_str[:14], "%Y%m%d%H%M%S")
        if len(ts_str) > 15 and ts_str[15] in ("+", "-"):
            offset_str = ts_str[15:].strip()
            sign = 1 if offset_str[0] == "+" else -1
            h = int(offset_str[1:3])
            m = int(offset_str[3:5]) if len(offset_str) >= 5 else 0
            offset = sign * (h * 3600 + m * 60)
            dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp()) - offset
        return int(dt.replace(tzinfo=timezone.utc).timestamp())
    except (ValueError, IndexError):
        return 0


async def import_programs(
    channel_stream_id: int,
    channel_name: str,
    programs: list[dict],
    xml_channel: str = "",
) -> int:
    """Insert or skip (by unique id) programs for a channel. Returns count inserted."""
    if not programs:
        return 0

    async with async_session_factory() as sess:
        inserted = 0
        for p in programs:
            # id MUST include stream_id: az azonos xmltv-csatorna különböző
            # minőség-variánsai (FHD/HD/SD, eltérő stream_id) így külön sort kapnak.
            prog_id = f"xmltv_{channel_stream_id}_{xml_channel}_{p.get('start_timestamp', 0)}"
            stmt = pg_insert(EpgProgramModel).values(
                id=prog_id,
                channel_id=str(channel_stream_id),
                channel_name=channel_name,
                title=p.get("title", ""),
                start=p.get("start", ""),
                end=p.get("end", ""),
                description=p.get("description", ""),
                start_timestamp=p.get("start_timestamp", 0),
                stop_timestamp=p.get("stop_timestamp", 0),
                category=p.get("category", ""),
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ).on_conflict_do_nothing(index_elements=["id"])
            result = await sess.execute(stmt)
            if result.rowcount and result.rowcount > 0:
                inserted += 1
        await sess.commit()
    return inserted

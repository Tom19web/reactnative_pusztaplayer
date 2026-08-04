"""
Direct Hungarian EPG import using manual channel mapping.
No AI, no fuzzy matching — uses a hand-curated mapping file.

Usage:
  1. Generate mapping:  docker compose exec fastapi python /app/scripts/grab_hu_port.py
  2. Fill xtream_sid:   edit /tmp/epg_hu_port_mapping.json (or use admin panel)
  3. Import:            docker compose exec fastapi python /app/scripts/import_epg_hu_direct.py
"""
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.core.epg_importer import import_programs, parse_xmltv

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("import_epg_hu_direct")

MAPPING_FILE = "/tmp/epg_hu_port_mapping.json"
XML_FILE = "/tmp/epg_hu_port.xml"


async def main():
    logger.info("=== HU EPG Direct Import ===")
    start = time.time()

    if not os.path.exists(XML_FILE):
        logger.error("  XML file not found: %s. Run grab_hu_port.py first.", XML_FILE)
        return

    if not os.path.exists(MAPPING_FILE):
        logger.error("  Mapping file not found: %s.", MAPPING_FILE)
        return

    with open(MAPPING_FILE, encoding="utf-8") as f:
        mapping = json.load(f)

    with open(XML_FILE, encoding="utf-8") as f:
        xml_text = f.read()

    programmes = parse_xmltv(xml_text)
    logger.info("  XML: %d programmes", len(programmes))

    # Build lookup: xml_channel → [programmes]
    prog_by_channel: dict[str, list[dict]] = {}
    for p in programmes:
        ch = p.get("xml_channel", "")
        if ch not in prog_by_channel:
            prog_by_channel[ch] = []
        prog_by_channel[ch].append(p)

    total = 0
    for entry in mapping:
        sid = entry.get("xtream_sid")
        if not sid:
            continue
        sid = int(sid)
        xmltv_id = entry.get("xmltv_id", "")
        ch_name = entry.get("name", "")

        progs = prog_by_channel.get(xmltv_id, [])
        if progs:
            inserted = await import_programs(sid, ch_name, progs, xmltv_id)
            total += inserted
            if inserted:
                logger.info("  [%d] %s → %s: %d programmes", sid, ch_name, xmltv_id, inserted)
        else:
            logger.debug("  [%d] %s → %s: 0 programmes", sid, ch_name, xmltv_id)

    elapsed = time.time() - start
    logger.info("  total imported: %d programmes in %.1fs", total, elapsed)

    # Mark mapping as last imported
    mapping_meta = {
        "last_import": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "programmes_imported": total,
        "channels_mapped": sum(1 for e in mapping if e.get("xtream_sid")),
        "channels_total": len(mapping),
    }
    with open("/tmp/epg_hu_port_import_meta.json", "w") as f:
        json.dump(mapping_meta, f)


if __name__ == "__main__":
    asyncio.run(main())

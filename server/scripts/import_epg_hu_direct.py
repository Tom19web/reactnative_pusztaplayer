"""
Direct Hungarian EPG import — port.hu, with AUTOMATIC channel matching.

Folyamat:
  1. grab_hu_port.py           → /tmp/epg_hu_port.xml + /tmp/epg_hu_port_mapping.json
  2. import_epg_hu_direct.py   → auto-match port.hu csatornák → Xtream stream-ek, import

Match-elés prioritási sorrendje:
  1. Kézi xtream_sid (a mapping fájlból, ha az admin panelen ki lett töltve)
  2. Pontos normalizált név egyezés (port.hu név == Xtream tiszta név)
  3. Fuzzy match_best (bigram overlap, threshold 0.6)
  4. AI fallback (ai_match_channels — DeepSeek, ha van kulcs)

Használat:
  docker compose exec fastapi python /app/scripts/import_epg_hu_direct.py
  docker compose exec fastapi python /app/scripts/import_epg_hu_direct.py --dry-run
  docker compose exec fastapi python /app/scripts/import_epg_hu_direct.py --threshold 0.5
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.channel_matcher import normalize, match_best
from app.core.channel_merger import clean_channel_title, base_title
from app.core.constants import MATCH_THRESHOLD
from app.core.epg_importer import import_programs, parse_xmltv
from app.core.xtream_client import fetch_live_streams
from app.services.session_bridge import get_xtream_credentials

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("import_epg_hu_direct")

MAPPING_FILE = "/tmp/epg_hu_port_mapping.json"
XML_FILE = "/tmp/epg_hu_port.xml"


def clean_xtream_name(name: str) -> str:
    """Xtream név tisztítása: országkód + minőség suffix eltávolítása."""
    return base_title(clean_channel_title(name)).strip() or name.strip()


async def main(args: argparse.Namespace) -> None:
    logger.info("=== HU EPG Direct Import (auto-match) ===")
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

    # port.hu xml_channel → [programmes]
    prog_by_channel: dict[str, list[dict]] = {}
    for p in programmes:
        ch = p.get("xml_channel", "") or p.get("channel_id", "")
        if ch:
            prog_by_channel.setdefault(ch, []).append(p)

    # ── Xtream credential + live streams ─────────────────
    username, password = await get_xtream_credentials()
    if not username:
        logger.error("  Nincs Xtream credential — se aktív session, se ADMIN_USER/PASS a .env-ben.")
        return

    streams, _cat_by_id = await fetch_live_streams(username, password)
    logger.info("  Xtream live csatornák: %d", len(streams))

    # cleaned Xtream név → [stream_id-k]
    xtream_by_name: dict[str, list[int]] = {}
    xtream_cleaned_names: list[str] = []
    for s in streams:
        sid = s.get("stream_id")
        raw = str(s.get("name", "")).strip()
        if not sid or not raw:
            continue
        cleaned = clean_xtream_name(raw)
        if not cleaned:
            continue
        xtream_by_name.setdefault(cleaned, []).append(int(sid))
        xtream_cleaned_names.append(cleaned)

    # normalizált index a gyors pontos egyezéshez
    norm_index: dict[str, str] = {}
    for cname in xtream_cleaned_names:
        n = normalize(cname)
        if n and n not in norm_index:
            norm_index[n] = cname

    logger.info("  Xtream egyedi tiszta nevek: %d", len(xtream_by_name))

    # ── Match + import ──────────────────────────────────
    total = 0
    matched_count = 0
    manual_count = 0
    unmatched: list[str] = []

    for entry in mapping:
        xmltv_id = entry.get("xmltv_id", "")
        name = str(entry.get("name", "")).strip()
        manual_sid = entry.get("xtream_sid")

        progs = prog_by_channel.get(xmltv_id, [])
        if not progs:
            continue

        stream_id: int | None = None
        match_source = ""

        # 1. Kézi override
        if manual_sid:
            stream_id = int(manual_sid)
            match_source = "manual"
            manual_count += 1
        else:
            # 2. Pontos normalizált név egyezés
            n_name = normalize(name)
            if n_name and n_name in norm_index:
                stream_id = xtream_by_name[norm_index[n_name]][0]
                match_source = "exact"
            # 3. Fuzzy match
            else:
                m = match_best(xtream_cleaned_names, name, threshold=args.threshold)
                if m:
                    stream_id = xtream_by_name[m[0]][0]
                    match_source = "fuzzy"

        if stream_id is None:
            unmatched.append(name)
            continue

        if args.dry_run:
            matched_count += 1
            logger.info("  [DRY] %s → sid %d (%s)", name, stream_id, match_source)
            continue

        inserted = await import_programs(stream_id, name, progs, xmltv_id)
        total += inserted
        matched_count += 1
        logger.info("  [%d] %s → sid %d (%s): %d programmes",
                    stream_id, name, stream_id, match_source, inserted)

    # 4. AI fallback a maradékra
    if unmatched and not args.dry_run:
        from import_common import ai_match_channels
        ai_matches = await ai_match_channels(unmatched, xtream_cleaned_names)
        ai_matched_names: set[str] = set()
        for port_name, xtream_name in ai_matches.items():
            if port_name not in unmatched:
                continue
            sids = xtream_by_name.get(xtream_name, [])
            if not sids:
                continue
            entry = next((e for e in mapping if e.get("name") == port_name), None)
            if not entry:
                continue
            xmltv_id = entry.get("xmltv_id", "")
            progs = prog_by_channel.get(xmltv_id, [])
            if not progs:
                continue
            stream_id = sids[0]
            inserted = await import_programs(stream_id, port_name, progs, xmltv_id)
            total += inserted
            matched_count += 1
            ai_matched_names.add(port_name)
            logger.info("  [AI] %s → %s (sid %d): %d programmes",
                        port_name, xtream_name, stream_id, inserted)
        unmatched = [n for n in unmatched if n not in ai_matched_names]

    elapsed = time.time() - start
    logger.info("  matched: %d (%d kézi), imported: %d programmes in %.1fs",
                matched_count, manual_count, total, elapsed)
    if unmatched:
        logger.warning("  Nem talált (%d): %s", len(unmatched), "; ".join(unmatched[:40]))

    # Meta írása
    if not args.dry_run:
        mapping_meta = {
            "last_import": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "programmes_imported": total,
            "channels_matched": matched_count,
            "channels_manual": manual_count,
            "channels_unmatched": len(unmatched),
            "channels_total": len(mapping),
        }
        with open("/tmp/epg_hu_port_import_meta.json", "w", encoding="utf-8") as f:
            json.dump(mapping_meta, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="HU EPG direct import (auto-match).")
    parser.add_argument("--dry-run", action="store_true", help="Csak a match-elést írja ki, nem importál.")
    parser.add_argument("--threshold", type=float, default=MATCH_THRESHOLD,
                        help=f"Fuzzy match küszöb (default: {MATCH_THRESHOLD}).")
    asyncio.run(main(parser.parse_args()))

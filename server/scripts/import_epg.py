"""
PusztaPlayer EPG Program Import Script
Cron: 24 óránként.
Strategy:
  1. Redis session scan → dedup creds.
  2. Per country category → fetch streams with no epg_channel_id.
  3. Skip channels imported within last 24h (Redis TTL epg:imported:{id}).
  4. Download guide XML from open-epg.com + free-epg.de.
  5. Match channels (match_best → AI fallback) → parse_xmltv → import_programs.
  6. Mark channels as imported (Redis SETEX 86400).

Usage:
  docker compose exec fastapi python /app/scripts/import_epg.py
"""
import asyncio
import logging
import time

import httpx
import redis.asyncio as aioredis

from app.redis import get_redis
from import_common import (
    logger, clean_stream_name, match_best,
    extract_xmltv_channels, build_epg_index,
    _fetch_categories, _fetch_streams_by_category, build_targets,
    scan_redis_sessions, fetch_text, ai_match_channels,
    settings, parse_xmltv, import_programs, ai_parse_channel_map,
    _HARD_MATCHES,
)

EPG_IMPORT_TTL = 86400  # 24 hours


async def _mark_imported(channel_id: int):
    try:
        redis = await get_redis()
        await redis.setex(f"epg:imported:{channel_id}", EPG_IMPORT_TTL, "1")
    except Exception:
        pass


async def _is_already_imported(channel_ids: list[int]) -> set[int]:
    try:
        redis = await get_redis()
        keys = [f"epg:imported:{cid}" for cid in channel_ids]
        pipe = redis.pipeline()
        for k in keys:
            pipe.exists(k)
        results = await pipe.execute()
        return {cid for cid, exists in zip(channel_ids, results) if exists}
    except Exception:
        return set()


async def process_user_epg(client: httpx.AsyncClient,
                            epg_index: dict[str, list[str]],
                            username: str, password: str,
                            categories: list[dict]) -> dict:
    result = {"imported": 0}

    targets = build_targets(categories)
    if not targets:
        logger.info("No country-mapped categories found.")
        return result

    logger.info("Found %d target categories.", len(targets))

    # Fetch streams for all targets first
    all_missing: dict[int, list[tuple[str, int]]] = {}
    all_sids: list[int] = []
    for cat_id, cat_name, country in targets:
        try:
            streams = await _fetch_streams_by_category(client, username, password, cat_id)
        except Exception:
            continue
        if not isinstance(streams, list):
            continue
        missing = [(s.get("name", ""), s.get("stream_id", 0)) for s in streams
                   if s.get("stream_id") and not s.get("epg_channel_id") and s.get("name")]
        if missing:
            all_missing[cat_id] = missing
            all_sids.extend(sid for _, sid in missing)

    # Check which channels already imported within 24h
    already_imported = await _is_already_imported(all_sids)
    if already_imported:
        logger.info("%d channels already imported within 24h, skipping.", len(already_imported))

    for cat_id, cat_name, country in targets:
        if cat_id not in all_missing:
            continue
        missing_epg = all_missing[cat_id]

        # Skip already-imported channels
        epg_needed = [(n, sid) for n, sid in missing_epg if sid not in already_imported]

        logger.info("  Category '%s' (%s): %d total, %d need EPG.",
                     cat_name, country, len(missing_epg), len(epg_needed))
        if not epg_needed:
            continue

        if country not in epg_index:
            continue

        guide_urls = epg_index[country]
        logger.info("    EPG sources for '%s': %d", country, len(guide_urls))
        epg_missing = list(epg_needed)

        for guide_url in guide_urls:
            if not epg_missing:
                break
            xml_text = await fetch_text(client, guide_url)
            if not xml_text:
                continue
            xmltv_channels, _ = extract_xmltv_channels(xml_text)
            if not xmltv_channels:
                logger.info("    %s: no channels found", guide_url)
                continue
            logger.info("    %s: %d chars, %d channels", guide_url.split("/")[-1], len(xml_text), len(xmltv_channels))
            display_names = [c["name"] for c in xmltv_channels]
            programs = parse_xmltv(xml_text)
            logger.info("      %d programmes", len(programs))

            # AI channel mapping (cached, primary)
            xtream_names = [n for n, _ in epg_missing]
            channel_map = await ai_parse_channel_map(country, xtream_names, display_names)

            still_needs = []
            for name, stream_id in epg_missing:
                matched_name = channel_map.get(name)
                if not matched_name:
                    clean = clean_stream_name(name)
                    # Hard-coded overrides first
                    hard_key = clean.lower()
                    hard_match = _HARD_MATCHES.get(hard_key)
                    if hard_match and hard_match in display_names:
                        matched_name = hard_match
                    else:
                        match = match_best(display_names, clean)
                        if match and match[1] >= 0.25:
                            matched_name = match[0]
                if matched_name:
                    ch_id = ""
                    for ch in xmltv_channels:
                        if ch["name"] == matched_name:
                            ch_id = ch["id"]
                            break
                    if ch_id and programs:
                        channel_programs = [p for p in programs if p.get("xml_channel") == ch_id]
                        if channel_programs:
                            inserted = await import_programs(stream_id, name, channel_programs, ch_id)
                            result["imported"] += inserted
                            logger.info("      %s → %s [%s]: %d programmes", name, matched_name, ch_id, inserted)
                            await _mark_imported(stream_id)
                else:
                    still_needs.append((name, stream_id))

            # AI fallback for remaining unmatched
            if still_needs:
                ai_matches = await ai_match_channels(
                    [clean_stream_name(n) for n, _ in still_needs],
                    display_names,
                )
                if ai_matches:
                    ai_done = []
                    for name, stream_id in still_needs:
                        clean = clean_stream_name(name)
                        ai_name = ai_matches.get(name) or ai_matches.get(clean)
                        if ai_name:
                            ch_id = ""
                            for ch in xmltv_channels:
                                if ch["name"] == ai_name:
                                    ch_id = ch["id"]
                                    break
                            if ch_id and programs:
                                channel_programs = [p for p in programs if p.get("xml_channel") == ch_id]
                                if channel_programs:
                                    inserted = await import_programs(stream_id, name, channel_programs, ch_id)
                                    result["imported"] += inserted
                                    logger.info("      [AI] %s → %s [%s]: %d programmes", name, ai_name, ch_id, inserted)
                                    await _mark_imported(stream_id)
                                    continue
                        ai_done.append((name, stream_id))
                    still_needs = ai_done

            epg_missing = still_needs
            del xml_text
            del programs

    return result


async def main():
    logger.info("=== EPG Import ===")
    start_time = time.time()

    cred_list = await scan_redis_sessions()
    if not cred_list:
        return

    async with httpx.AsyncClient(verify=False) as client:
        epg_index = build_epg_index()

        total = {"imported": 0}

        for i, (username, password) in enumerate(cred_list):
            logger.info("--- Account %d/%d ---", i + 1, len(cred_list))
            try:
                categories = await _fetch_categories(client, username, password)
                res = await process_user_epg(client, epg_index, username, password, categories)
                total["imported"] += res["imported"]
            except Exception as e:
                logger.error("Account %d failed: %s", i + 1, e)
            if i < len(cred_list) - 1:
                await asyncio.sleep(1)

    elapsed = time.time() - start_time
    logger.info("=== EPG Import Complete ===")
    logger.info("Accounts processed:       %d", len(cred_list))
    logger.info("Programmes imported:       %d", total["imported"])
    logger.info("Elapsed: %.1f seconds", elapsed)


if __name__ == "__main__":
    asyncio.run(main())

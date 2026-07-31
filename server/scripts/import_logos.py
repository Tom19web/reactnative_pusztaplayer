"""
PusztaPlayer Logo Import Script
Cron: 12 óránként (új csatornák logója).
Strategy:
  1. Redis session scan → dedup creds.
  2. Per country category → fetch streams with no epg_channel_id.
  3. Skip channels that already have working logos (not raw.githubusercontent).
  4. Match channels against open-epg + free-epg XML → icon URL.
  5. Batch insert + download + local cache.

Usage:
  docker compose exec fastapi python /app/scripts/import_logos.py
"""
import asyncio
import logging
import time
from datetime import datetime

import httpx
from sqlalchemy import select

from import_common import (
    logger, clean_stream_name, match_best,
    extract_channel_map_from_xml, extract_xmltv_channels,
    build_site_index, _filter_sites_by_country, build_epg_index,
    _fetch_categories, _fetch_streams_by_category, build_targets,
    scan_redis_sessions, import_logos_batch, download_and_cache_logos,
    fetch_text, async_session_factory, ChannelLogoModel, ai_parse_channel_map,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


async def fetch_streams_for_all_targets(
    client: httpx.AsyncClient,
    targets: list[tuple[int, str, str]],
) -> dict[int, list[tuple[str, int]]]:
    """Fetch streams for all target categories. Returns {cat_id: [(name, stream_id)]}."""
    all_missing: dict[int, list[tuple[str, int]]] = {}
    for cat_id, cat_name, country in targets:
        try:
            streams = await _fetch_streams_by_category(client, "", "", cat_id)
            # We can't use _fetch_streams_by_category without username/password here
            # This is called from process_user which already has credentials
        except Exception:
            pass
    return all_missing


async def process_user_logos(client: httpx.AsyncClient, site_map: dict[str, str],
                              epg_index: dict[str, list[str]],
                              username: str, password: str,
                              categories: list[dict]) -> dict:
    result = {"logos": 0}

    targets = build_targets(categories)
    if not targets:
        logger.info("No non-Hungarian, country-mapped categories found.")
        return result

    logger.info("Found %d target categories.", len(targets))

    # Fetch streams for all targets first
    all_missing: dict[int, list[tuple[str, int]]] = {}
    all_logo_ids: list[int] = []
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
            all_logo_ids.extend(sid for _, sid in missing)

    # Check which channels already have GOOD logos (not raw.githubusercontent)
    existing_logos: set[int] = set()
    if all_logo_ids:
        async with async_session_factory() as sess:
            logo_db_result = await sess.execute(
                select(ChannelLogoModel.stream_id)
                .where(ChannelLogoModel.stream_id.in_(list(set(all_logo_ids))))
                .where(ChannelLogoModel.logo_url.not_like('%raw.githubusercontent%'))
            )
            existing_logos = set(logo_db_result.scalars().all())
        if existing_logos:
            logger.info("%d channels already have working logos, skipping.", len(existing_logos))

    new_logo_ids: set[int] = set()
    logo_batch: list[dict] = []

    for cat_id, cat_name, country in targets:
        if cat_id not in all_missing:
            continue
        missing_epg = all_missing[cat_id]

        # Skip channels with existing working logos
        logo_needed = [(n, sid) for n, sid in missing_epg
                       if sid not in existing_logos and sid not in new_logo_ids]

        logger.info("  Category '%s' (%s): %d channels, %d need logos.",
                     cat_name, country, len(missing_epg), len(logo_needed))
        if not logo_needed:
            continue

        # Phase 1: iptv-org logo DISABLED (raw.githubusercontent URLs are broken)
        # country_sites = _filter_sites_by_country(site_map, country)
        # ...iptv-org phase skipped...

        # Phase 2: open-epg + free-epg icons
        if country in epg_index and logo_needed:
            guide_urls = epg_index[country]
            remaining = list(logo_needed)
            for guide_url in guide_urls:
                if not remaining:
                    break
                xml_text = await fetch_text(client, guide_url)
                if not xml_text:
                    continue
                xmltv_channels, xmltv_icons = extract_xmltv_channels(xml_text)
                if not xmltv_channels:
                    continue
                display_names = [c["name"] for c in xmltv_channels]

                # AI channel mapping (cached)
                xtream_names = [n for n, _ in remaining]
                channel_map = await ai_parse_channel_map(country, xtream_names, display_names)

                still_remaining = []
                for name, stream_id in remaining:
                    matched_name = channel_map.get(name)
                    if not matched_name:
                        clean = clean_stream_name(name)
                        match = match_best(display_names, clean)
                        if match and match[1] > 0.5:
                            matched_name = match[0]
                    if matched_name:
                        icon_url = xmltv_icons.get(matched_name, "")
                        if icon_url and "nologo" not in icon_url.lower():
                            if stream_id not in new_logo_ids:
                                new_logo_ids.add(stream_id)
                                result["logos"] += 1
                            logo_batch.append({
                                "stream_id": stream_id,
                                "logo_url": icon_url,
                                "source": f"epg:{guide_url.split('/')[-1].split('.')[0]}",
                                "channel_name": name,
                                "matched_name": matched_name,
                                "created_at": datetime.utcnow().replace(tzinfo=None),
                            })
                    else:
                        still_remaining.append((name, stream_id))
                remaining = still_remaining
                del xml_text

    if logo_batch:
        await import_logos_batch(logo_batch)
        await download_and_cache_logos(logo_batch)

    return result


async def main():
    logger.info("=== Logo Import ===")
    start_time = time.time()

    cred_list = await scan_redis_sessions()
    if not cred_list:
        return

    async with httpx.AsyncClient(verify=False) as client:
        site_map = await build_site_index(client)
        epg_index = build_epg_index()

        total = {"logos": 0}

        for i, (username, password) in enumerate(cred_list):
            logger.info("--- Account %d/%d ---", i + 1, len(cred_list))
            try:
                categories = await _fetch_categories(client, username, password)
                res = await process_user_logos(client, site_map, epg_index, username, password, categories)
                total["logos"] += res["logos"]
            except Exception as e:
                logger.error("Account %d failed: %s", i + 1, e)
            if i < len(cred_list) - 1:
                await asyncio.sleep(1)

    elapsed = time.time() - start_time
    logger.info("=== Logo Import Complete ===")
    logger.info("Accounts processed:       %d", len(cred_list))
    logger.info("New logos imported:       %d", total["logos"])
    logger.info("Elapsed: %.1f seconds", elapsed)


if __name__ == "__main__":
    asyncio.run(main())

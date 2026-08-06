"""
PusztaPlayer Csatorna Címkéző
AI-alapú tag és nyelv detekció a live csatornákhoz.
"""
import asyncio
import json
import logging
import os
import sys

import httpx
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.database import async_session_factory
from app.redis import get_redis
from app.models.models import ChannelTagModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] 🏷 %(message)s")
logger = logging.getLogger("tag_channels")

VALID_TAGS = [
    "sport",
    "film_sorozat",
    "zene",
    "hir",
    "dokumentum",
    "szorakozas",
    "eletmod",
    "gyerek",
    "felnott",
    "vallasi",
    "helyi",
]
VALID_LANGS = ["hu", "en", "de", "ro", "sk", "sr", "multi"]

BATCH_SIZE = 15
XTREAM_TIMEOUT = 20.0


from app.services.session_bridge import get_xtream_credentials


async def call_deepseek_tag(channels: list[dict]) -> dict[int, dict]:
    """Batch call to DeepSeek to classify channels. Returns {stream_id: {tags, language, confidence}}."""
    if not settings.DEEPSEEK_API_KEY:
        logger.warning("No DEEPSEEK_API_KEY — skipping AI tagging")
        return {}

    channel_lines = "\n".join(
        f"  {c['stream_id']}: \"{c['name']}\" (group: {c['group']})"
        for c in channels
    )

    system = (
        f"You are a TV channel classifier. Return ONLY valid JSON.\n"
        f"Available tags: {', '.join(VALID_TAGS)}\n"
        f"Available languages: {', '.join(VALID_LANGS)}\n"
        f"For each channel, output: stream_id, tags (array), language (string), confidence (float 0-1).\n"
        f"If unsure, use confidence < 0.5."
    )
    user = (
        f"Classify these channels:\n{channel_lines}\n\n"
        f"Return JSON: {{\"channels\": [{{\"stream_id\": 123, \"tags\": [\"sport\"], \"language\": \"hu\", \"confidence\": 0.95}}, ...]}}"
    )

    try:
        async with httpx.AsyncClient(verify=True, timeout=60.0) as c:
            resp = await c.post(
                getattr(settings, "DEEPSEEK_BASE_URL", "https://api.deepseek.com") + "/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat"),
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 4096,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            result: dict[int, dict] = {}
            for ch in parsed.get("channels", []):
                sid = ch.get("stream_id")
                if sid is not None:
                    result[int(sid)] = {
                        "tags": [t for t in ch.get("tags", []) if t in VALID_TAGS],
                        "language": ch.get("language", "") if ch.get("language", "") in VALID_LANGS else "",
                        "confidence": float(ch.get("confidence", 0)),
                    }
            return result
    except Exception as e:
        logger.warning("DeepSeek batch failed: %s — trying single calls", e)
        return await _fallback_single_calls(channels)


async def _fallback_single_calls(channels: list[dict]) -> dict[int, dict]:
    """One-by-one fallback if batch fails."""
    result: dict[int, dict] = {}
    for ch in channels:
        try:
            single = await call_deepseek_tag([ch])
            result.update(single)
        except Exception:
            pass
    return result


async def main():
    logger.info("Fetching Xtream credentials...")
    username, password = await get_xtream_credentials()
    if not username:
        logger.error("No Xtream credentials — no session and no admin creds in .env.")
        return

    logger.info("Fetching live streams from Xtream API...")
    all_channels: list[dict] = []
    try:
        async with httpx.AsyncClient(verify=False, timeout=XTREAM_TIMEOUT) as client:
            resp = await client.get(
                f"{settings.XTREAM_API_BASE}/player_api.php"
                f"?username={username}&password={password}&action=get_live_streams"
            )
            resp.raise_for_status()
            streams = resp.json()
            if not isinstance(streams, list):
                logger.error("Unexpected Xtream response format")
                return

            cat_resp = await client.get(
                f"{settings.XTREAM_API_BASE}/player_api.php"
                f"?username={username}&password={password}&action=get_live_categories"
            )
            cats = cat_resp.json() if cat_resp.status_code == 200 else []
            cat_by_id = {
                int(c.get("category_id", 0)): c.get("category_name", "")
                for c in (cats if isinstance(cats, list) else [])
            }

            for s in streams:
                sid = s.get("stream_id")
                if not sid:
                    continue
                cat_id = int(s.get("category_id", 0))
                all_channels.append({
                    "stream_id": int(sid),
                    "name": str(s.get("name", "")),
                    "group": cat_by_id.get(cat_id, s.get("category_name", "Egyéb")),
                })
    except Exception as e:
        logger.error("Failed to fetch streams: %s", e)
        return

    logger.info("Found %d streams", len(all_channels))

    # Filter out already tagged channels
    async with async_session_factory() as sess:
        result = await sess.execute(
            text("SELECT stream_id FROM channel_tags WHERE auto_tagged = true AND confidence >= 0.7")
        )
        tagged_ids = {r[0] for r in result.fetchall()}

    untagged = [c for c in all_channels if c["stream_id"] not in tagged_ids]
    logger.info("Already tagged: %d, needing tags: %d", len(tagged_ids), len(untagged))

    if not untagged:
        logger.info("All channels already tagged!")
        return

    # Process in batches
    total_tagged = 0
    for i in range(0, len(untagged), BATCH_SIZE):
        batch = untagged[i : i + BATCH_SIZE]
        logger.info("Tagging batch %d-%d (%d channels)...", i + 1, min(i + BATCH_SIZE, len(untagged)), len(batch))

        ai_result = await call_deepseek_tag(batch)

        # Save to DB
        async with async_session_factory() as sess:
            for ch in batch:
                sid = ch["stream_id"]
                ai = ai_result.get(sid, {})
                stmt = pg_insert(ChannelTagModel).values(
                    stream_id=sid,
                    name=ch["name"],
                    tags=ai.get("tags", []),
                    language=ai.get("language", ""),
                    confidence=ai.get("confidence", 0),
                    auto_tagged=True,
                ).on_conflict_do_update(
                    constraint="channel_tags_stream_id_key",
                    set_=dict(
                        name=ch["name"],
                        tags=ai.get("tags", []),
                        language=ai.get("language", ""),
                        confidence=ai.get("confidence", 0),
                        auto_tagged=True,
                    ),
                )
                await sess.execute(stmt)
            await sess.commit()

        total_tagged += len(batch)
        logger.info("Saved %d/%d channels", total_tagged, len(untagged))

    # Summary
    async with async_session_factory() as sess:
        result = await sess.execute(text("SELECT COUNT(*) FROM channel_tags WHERE confidence >= 0.7"))
        logger.info("  high confidence: %d", result.scalar())

        result = await sess.execute(text("SELECT COUNT(*) FROM channel_tags WHERE confidence >= 0.5 AND confidence < 0.7"))
        logger.info("  medium confidence: %d", result.scalar())

        result = await sess.execute(text("SELECT COUNT(*) FROM channel_tags WHERE confidence < 0.5"))
        logger.info("  low confidence: %d", result.scalar())

    logger.info("Done! %d total tagged.", total_tagged)


if __name__ == "__main__":
    asyncio.run(main())

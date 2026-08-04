import json
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.models import EpgProgramModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["enrich"])

BATCH_SIZE = 20


class EnrichRequest(BaseModel):
    program_ids: list[str] = []


class EnrichedProgram(BaseModel):
    program_id: str
    clean_title: str
    pow_synopsis: str = ""
    genres: list[str] = []
    cast: list[str] = []
    tropes: list[str] = []


@router.post("/enrich", response_model=list[EnrichedProgram])
async def enrich_epg(
    request: EnrichRequest,
    db: AsyncSession = Depends(get_db),
):
    if not request.program_ids:
        return []

    if not settings.DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail="DEEPSEEK_API_KEY not configured")

    stmt = select(EpgProgramModel).where(EpgProgramModel.id.in_(request.program_ids))
    result = await db.execute(stmt)
    programs = result.scalars().all()

    if not programs:
        return []

    enriched_results: list[EnrichedProgram] = []

    for i in range(0, len(programs), BATCH_SIZE):
        batch = programs[i : i + BATCH_SIZE]
        batch_dicts = [
            {
                "program_id": p.id,
                "title": p.title or "",
                "description": p.description or "",
            }
            for p in batch
        ]
        try:
            batch_result = await _call_deepseek(batch_dicts)
        except Exception as e:
            logger.error("DeepSeek batch enrich failed: %s", e)
            continue

        for enriched_data in batch_result:
            prog_id = enriched_data.get("program_id", "")
            prog = next((p for p in batch if p.id == prog_id), None)
            if prog is None:
                continue

            prog.clean_title = enriched_data.get("clean_title", "")
            prog.ai_enriched = {
                "genres": enriched_data.get("genres", []),
                "cast": enriched_data.get("cast", []),
                "tropes": enriched_data.get("tropes", []),
                "pow_synopsis": enriched_data.get("pow_synopsis", ""),
            }
            enriched_results.append(
                EnrichedProgram(
                    program_id=prog.id,
                    clean_title=prog.clean_title or "",
                    pow_synopsis=enriched_data.get("pow_synopsis", ""),
                    genres=enriched_data.get("genres", []),
                    cast=enriched_data.get("cast", []),
                    tropes=enriched_data.get("tropes", []),
                )
            )

    await db.flush()
    await db.commit()  # explicit commit — paranoia against rollback edge cases
    return enriched_results


async def _call_deepseek(batch_dicts: list[dict]) -> list[dict]:
    titles_block = "\n".join(
        f"ID:{d['program_id']} | TITLE: {d.get('title', '').strip()}"
        for d in batch_dicts
    )
    prompt = f"""A kovetkezo TV musorokhoz generalj MAGYAR NYELVEN az alabbi mezoket.
Minden musorhoz egy JSON objektumot adj vissza, a "program_id" mezovel azonositva.

Kotelezo mezok minden programnal:
- program_id: az ID a cim elott
- clean_title: a musor tisztitott cime
- pow_synopsis: "POW! ..." kezdetu, szorakoztato, maximum 20 szavas leiras MAGYARUL
- genres: mufajok tombje (1-3 elem)
- cast: foszereplok tombje (1-5 elem), ha ismert
- tropes: tortenetmeselesi panelek MAGYARUL (1-3 elem, pl. "egyedulallo apa", "feszekelhagyas", "krimi nyomozas")

Programs:
{titles_block}

Respond with ONLY a JSON array of objects. Example:
[{{"program_id": "epg_123", "clean_title": "Apatigris", "pow_synopsis": "POW! Peter megprobalja tulelni a lanyai kirepuleset es az ujrakezdest!", "genres": ["Vigjatek", "Magyar"], "cast": ["Scherer Peter", "Rujder Vivien"], "tropes": ["egyedulallo apa", "feszekelhagyas", "ujrakezdes 50 felett"]}}]"""

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "You are an EPG metadata enrichment assistant. Respond only in JSON."},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
            },
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "[]")

        try:
            parsed = json.loads(content)
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict):
                vals = list(parsed.values())
                return vals if vals and isinstance(vals[0], dict) else []
        except json.JSONDecodeError:
            logger.warning("DeepSeek returned non-JSON: %s", content[:200])
    return []

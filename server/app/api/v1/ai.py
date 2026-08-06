"""
PusztaPlayer Unified AI & DeepSeek Router
Aszinkron AI Proxy: hangulatok, keresés, intelligens ajánlások egy helyen.
"""

import logging
import hashlib
import json
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field
import httpx

from app.config import settings
from app.redis import cache_get, cache_set
from app.core.constants import CACHE_TTL_AI

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI Unified Proxy"])

# Globális, optimalizált HTTP kliens (nincs TCP port-mészárlás!)
_http_client: httpx.AsyncClient | None = None

def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client

# --- DTOs (Request / Response Sémák) ---

class MoodItem(BaseModel):
    key: str
    title: str
    genre: str = ""
    plot: str | None = None

class MoodsRequest(BaseModel):
    items: list[MoodItem] = Field(..., max_length=50)

class SearchItem(BaseModel):
    key: str
    title: str
    type: str
    genre: str = ""

class AISearchRequest(BaseModel):
    query: str
    items: list[SearchItem] = Field(..., max_length=200)

class HistoryItem(BaseModel):
    title: str
    type: str
    genre: str | None = None

class ContentItem(BaseModel):
    key: str
    title: str
    type: str
    genre: str = ""
    plot: str | None = None

class AIRecommendRequest(BaseModel):
    history: list[HistoryItem] = []
    items: list[ContentItem] = Field(..., max_length=300)
    contentId: str | None = None
    username: str | None = None
    profileName: str | None = None


# --- Segédfüggvények ---

def _hash_items(items: list) -> str:
    serialized = json.dumps([item.model_dump() if hasattr(item, "model_dump") else item for item in items], sort_keys=True)
    return hashlib.md5(serialized.encode("utf-8")).hexdigest()

def _verify_api_key(x_api_key: str | None = Header(default=None)):
    if not settings.PROXY_AUTH_KEY:
        return  # Proxy auth not configured — allow all
    if x_api_key != settings.PROXY_AUTH_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


async def _call_deepseek_json(system_prompt: str, user_prompt: str) -> dict | list:
    if not settings.DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY not configured")

    client = get_http_client()
    try:
        response = await client.post(
            f"{settings.DEEPSEEK_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": getattr(settings, 'DEEPSEEK_MODEL', 'deepseek-chat'),
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 2000,
                "response_format": {"type": "json_object"},
            },
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        logger.error("DeepSeek API call failed: %s", e)
        raise HTTPException(status_code=502, detail="AI service error")


# --- Végpontok ---

@router.post("/moods")
async def classify_moods(req: MoodsRequest, x_api_key: str | None = Header(default=None)):
    _verify_api_key(x_api_key)

    itemList = [{"key": i.key, "title": i.title, "genre": i.genre, "plot": (i.plot or "")[:200]} for i in req.items]
    cache_key = f"ai:moods:{_hash_items(itemList)}"
    
    cached = await cache_get(cache_key)
    if cached:
        return {"moods": json.loads(cached), "cached": True}

    system_prompt = (
        "You are a content mood classifier for an IPTV app. "
        "Assign 1-3 Hungarian-language moods to each item from this list ONLY: "
        "Akciódús, Adrenalinos, Kalandvágyó, Vidám, Elgondolkodtató, Szívszorító, Félelmetes, "
        "Hátborzongató, Lebilincselő, Nyomasztó, Szerelmes, Bájos, Fantasztikus, Baljós, Mesebeli, "
        "Kíváncsivá tesz, Intenzív, Tanulságos, Inspiráló, Játékos, Megható, Otthonos, Megrázó, "
        "Időutazós, Lendületes, Győzedelmes, Kietlen, Közvetlen, Felszabadult, Versenyszellemű, "
        "Áhítatos, Harapható, Nosztalgikus, Provokatív, Hullámzó, Lazító. "
        "Return ONLY a JSON object with a key 'results' containing an array: "
        '[{"key": "...", "moods": ["Mood1", "Mood2"]}]'
    )
    
    parsed = await _call_deepseek_json(system_prompt, json.dumps(itemList))
    moods_result = parsed if isinstance(parsed, list) else (parsed.get("results") or parsed.get("moods") or [])

    await cache_set(cache_key, json.dumps(moods_result), ttl_seconds=CACHE_TTL_AI)  # 24h TTL Redisben
    return {"moods": moods_result, "cached": False}


@router.post("/search")
async def ai_search(req: AISearchRequest, x_api_key: str | None = Header(default=None)):
    _verify_api_key(x_api_key)

    itemList = "\n".join([f"{i.key}: {i.title} ({i.type}, {i.genre})" for i in req.items[:200]])
    cache_key = f"ai:search:{req.query}:{_hash_items(req.items)}"

    cached = await cache_get(cache_key)
    if cached:
        return {"keys": json.loads(cached), "cached": True}

    system_prompt = (
        "You are a content search engine for an IPTV app. The user types a query in Hungarian. "
        "Find the most relevant items from the list below. Return ONLY a JSON object with a key 'keys' "
        'containing an array of matching item keys: ["key1", "key2"].'
    )
    user_prompt = f"Available items:\n{itemList}\n\nUser query: {req.query}"

    parsed = await _call_deepseek_json(system_prompt, user_prompt)
    keys_result = parsed if isinstance(parsed, list) else (parsed.get("keys") or parsed.get("results") or [])

    await cache_set(cache_key, json.dumps(keys_result), ttl_seconds=CACHE_TTL_AI)
    return {"keys": keys_result, "cached": False}


@router.post("/ai/recommend")
async def ai_recommend(req: AIRecommendRequest, x_api_key: str | None = Header(default=None)):
    _verify_api_key(x_api_key)

    historyStr = "; ".join([f"{h.title} ({h.type}, {h.genre or ''})" for h in req.history[:20]])
    contentStr = "\n".join([f"{c.key}: {c.title} ({c.type}, {c.genre})" for c in req.items[:300]])
    
    # JAVÍTVA: A cache kulcs most már tartalmazza az elérhető tartalmak hash-ét is, így nem ad elavult ajánlást!
    cache_key = f"ai:rec:{req.username or 'anon'}:{req.profileName or 'default'}:{_hash_items(req.history)}:{_hash_items(req.items)}"

    cached = await cache_get(cache_key)
    if cached:
        return {"recommendations": json.loads(cached), "cached": True}

    system_prompt = (
        "You are a movie recommendation engine for a Hungarian IPTV app. Based on the user's viewing history, "
        "recommend 5 items from the available content. Return ONLY a JSON object with a key 'recommendations' "
        'containing an array: [{"key": "...", "reason": "1 mondat magyarul miért ajánlod"}].'
    )
    user_prompt = f"Watched: {historyStr or '(nincs előzmény)'}\n\nAvailable:\n{contentStr}\n\nRecommend 5 items."

    parsed = await _call_deepseek_json(system_prompt, user_prompt)
    recs_result = parsed if isinstance(parsed, list) else (parsed.get("recommendations") or parsed.get("results") or [])

    await cache_set(cache_key, json.dumps(recs_result), ttl_seconds=CACHE_TTL_AI)
    return {"recommendations": recs_result, "cached": False}
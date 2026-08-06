"""Shared DeepSeek API client."""
import json, logging, re
import httpx
from app.config import settings

logger = logging.getLogger(__name__)
_JSON_REPAIR_RE = re.compile(r'```json\s*|\s*```')


async def call_deepseek(system_prompt: str, user_prompt: str, timeout: float = 60.0) -> dict:
    """Unified DeepSeek API call with JSON repair. Returns parsed JSON dict."""
    if not settings.DEEPSEEK_API_KEY:
        logger.warning("DEEPSEEK_API_KEY not set — skipping DeepSeek call")
        return {}
    url = f"{settings.DEEPSEEK_BASE_URL}/chat/completions"
    try:
        async with httpx.AsyncClient(verify=True, timeout=timeout) as c:
            resp = await c.post(url,
                headers={"Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": getattr(settings, 'DEEPSEEK_MODEL', 'deepseek-chat'),
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 4096,
                },
            )
            resp.raise_for_status()
            raw = resp.text.strip()
            raw = _JSON_REPAIR_RE.sub('', raw).strip()
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                if not raw.endswith(('}', ']')):
                    raw += '}]' if raw.startswith('[') else '}'
                return json.loads(raw)
    except Exception as e:
        logger.error("DeepSeek call failed: %s", e)
        return {}

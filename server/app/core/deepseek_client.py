import httpx
from app.config import settings


class DeepSeekClient:
    """DeepSeek API client for batch AI enrichment."""

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.batch_size = 20

    async def enrich_batch(self, programs: list[dict]) -> list[dict]:
        prompt = self._build_prompt(programs)
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "You are an EPG metadata enrichment assistant."},
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.3,
                },
            )
            response.raise_for_status()
            return response.json().get("choices", [{}])[0].get("message", {}).get("content", "[]")

    def _build_prompt(self, programs: list[dict]) -> str:
        titles = "\n".join([p.get("title", "") for p in programs])
        return f"""Enrich the following TV programs. For each, provide:
- clean_title: cleaned title
- pow_synopsis: "POW! ..." entertaining description in Hungarian
- genres: list of genres
- cast: main actors
- tropes: storytelling tropes

Programs:
{titles}

Respond with a JSON array."""

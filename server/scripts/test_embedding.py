"""Teszt: OpenAI embedding vegpont validalasa 1536 dimenziora.
Futtatas a szerveren:
  docker compose exec fastapi python /app/scripts/test_embedding.py
"""

import os
import asyncio
import httpx

API_KEY = os.getenv("OPENAI_API_KEY", "")
BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")

async def main():
    print(f"  Base URL: {BASE_URL}")
    print(f"  API Key:  {API_KEY[:20]}...")
    print()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BASE_URL}/v1/embeddings",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "text-embedding-3-small",
                "input": "katona levagott labbal rakasz",
            },
        )
        print(f"  HTTP Status: {resp.status_code}")

        if resp.status_code != 200:
            print(f"  HIBA: {resp.text[:300]}")
            return

        data = resp.json()
        emb = data["data"][0]["embedding"]
        dim = len(emb)
        print(f"  Dimenzió:    {dim}")
        print(f"  Tipus:       {type(emb[0]).__name__}")
        print(f"  Elso 5:      {emb[:5]}")
        print()

        if dim == 1536:
            print("  VALID: 1536 dimenzio, float tipus")
        else:
            print(f"  HIBA: {dim} != 1536 (vart: 1536)")

asyncio.run(main())

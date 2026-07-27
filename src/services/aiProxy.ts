let Config: any = {};
try { Config = require('react-native-config'); if (Config.default) Config = Config.default; if (Config.Config) Config = Config.Config; } catch {}

const AI_PROXY_URL = (Config && Config.AI_PROXY_URL) || 'https://live.pusztaplay.eu/ai';
const AI_PROXY_KEY = (Config && Config.AI_PROXY_KEY) || '';

export async function aiSearchQuery(
  query: string,
  items: Array<{ key: string; title: string; type: string; genre: string }>,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!AI_PROXY_KEY || !query.trim()) return [];
  try {
    const res = await fetch(`${AI_PROXY_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_PROXY_KEY },
      body: JSON.stringify({ query, items }),
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.keys || [];
  } catch {
    return [];
  }
}

export async function aiRecommendQuery(
  history: Array<{ title: string; type: string; genre?: string }>,
  items: Array<{ key: string; title: string; type: string; genre: string; plot?: string }>,
): Promise<Array<{ key: string; reason: string }>> {
  if (!AI_PROXY_KEY) return [];
  try {
    const res = await fetch(`${AI_PROXY_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_PROXY_KEY },
      body: JSON.stringify({ history, items }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.recommendations || [];
  } catch {
    return [];
  }
}

const SEMANTIC_API = 'https://live.pusztaplay.eu';

export interface SemanticResult {
  title: string;
  year: string;
  similarity: number;
  description: string;
  poster_url?: string;
  id?: string;
  type?: string;
}

export async function semanticSearch(query: string, limit = 5): Promise<SemanticResult[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(`${SEMANTIC_API}/api/v1/search/semantic?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: { 'User-Agent': 'PusztaPlayer v1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

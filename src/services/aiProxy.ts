import { fetchWithTimeout } from './fetchWithTimeout';

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
    const res = await fetchWithTimeout(`${AI_PROXY_URL}/search`, {
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
    const res = await fetchWithTimeout(`${AI_PROXY_URL}/recommend`, {
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
    const res = await fetchWithTimeout(`${SEMANTIC_API}/api/v1/search/semantic?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: { 'User-Agent': 'PusztaPlayer v1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export interface EmbeddingRecommendation {
  key: string;
  title: string;
  type: string;
  similarity: number;
  description: string;
  reason: string;
  poster_url?: string;
}

export async function recommendByEmbedding(
  historyItems: Array<{ key: string; title: string; type: string }>,
  limit = 10,
): Promise<EmbeddingRecommendation[]> {
  try {
    const res = await fetchWithTimeout(`${SEMANTIC_API}/api/v1/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'PusztaPlayer v1.0' },
      body: JSON.stringify({ history_items: historyItems, limit }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.recommendations || [];
  } catch {
    return [];
  }
}

export interface EpisodePlot {
  title: string;
  plot: string;
  air_date: string;
}

export async function fetchEpisodePlot(
  seriesId: number,
  season: number,
  episode: number,
): Promise<EpisodePlot | null> {
  try {
    const res = await fetchWithTimeout(
      `${SEMANTIC_API}/api/v1/episodes/plot?series_id=${seriesId}&season=${season}&episode=${episode}`,
      { headers: { 'User-Agent': 'PusztaPlayer v1.0' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || data.plot ? data : null;
  } catch {
    return null;
  }
}

export async function fetchSimilar(
  seedId: number,
  seedType: 'movie' | 'series',
  limit = 5,
): Promise<EmbeddingRecommendation[]> {
  try {
    const res = await fetchWithTimeout(
      `${SEMANTIC_API}/api/v1/recommend/similar?seed_id=${seedId}&seed_type=${seedType}&limit=${limit}`,
      { headers: { 'User-Agent': 'PusztaPlayer v1.0' } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.recommendations || [];
  } catch {
    return [];
  }
}

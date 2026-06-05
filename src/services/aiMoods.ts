let Config: any = {};
try { Config = require('react-native-config'); if (Config.default) Config = Config.default; if (Config.Config) Config = Config.Config; } catch {}

const AI_PROXY_URL = (Config && Config.AI_PROXY_URL) || 'https://live.pusztaplay.eu/ai';
const AI_PROXY_KEY = (Config && Config.AI_PROXY_KEY) || '';
const BATCH_SIZE = 50;

interface AICacheEntry {
  moods: Record<string, string[]>;
  ts: number;
}

const AI_MOODS_CACHE_KEY = 'pusztaplay_ai_moods';
let AsyncStorage: any;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default || require('@react-native-async-storage/async-storage'); } catch { AsyncStorage = null; }

export async function loadAIMoodCache(): Promise<Record<string, string[]> | null> {
  try {
    if (!AsyncStorage) return null;
    const raw = await AsyncStorage.getItem(AI_MOODS_CACHE_KEY);
    if (!raw) return null;
    const entry: AICacheEntry = JSON.parse(raw);
    // 24h TTL
    if (Date.now() - entry.ts > 24 * 60 * 60 * 1000) return null;
    return entry.moods;
  } catch { return null; }
}

export async function saveAIMoodCache(moods: Record<string, string[]>): Promise<void> {
  try {
    if (!AsyncStorage) return;
    await AsyncStorage.setItem(AI_MOODS_CACHE_KEY, JSON.stringify({ moods, ts: Date.now() }));
  } catch {}
}

export async function fetchAIMoods(
  items: Array<{ key: string; title: string; genre: string; plot?: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string[]>> {
  if (!AI_PROXY_KEY) return {};

  const moodMap: Record<string, string[]> = {};
  const total = Math.ceil(items.length / BATCH_SIZE);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${AI_PROXY_URL}/moods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': AI_PROXY_KEY,
        },
        body: JSON.stringify({ items: batch }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const list = data.moods || [];
      for (const item of list) {
        if (item.key && Array.isArray(item.moods)) {
          moodMap[item.key] = item.moods;
        }
      }
    } catch {}
    if (onProgress) onProgress(i + batch.length, items.length);
  }

  return moodMap;
}

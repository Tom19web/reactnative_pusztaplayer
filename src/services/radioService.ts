import { RadioStation } from '../constants/radioStations';
import { fetchWithTimeout } from './fetchWithTimeout';

let AsyncStorage: any;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default || require('@react-native-async-storage/async-storage'); } catch { AsyncStorage = null; }

const CACHE_KEY = 'pusztaplay_radio_api_cache_v2';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h
const API_URL = 'https://live.pusztaplay.eu/api/v1/radio';

interface RawStation {
  id: number;
  name: string;
  stream_url: string;
  favicon: string;
  tags: string;
  bitrate: number;
  codec: string;
  votes: number;
}

interface CacheEntry {
  timestamp: number;
  stations: RadioStation[];
}

function transform(raw: RawStation[]): RadioStation[] {
  return raw
    .filter(s => s && s.stream_url && s.name)
    .map(s => ({
      key: `radio_${s.id}`,
      name: s.name,
      streamUrl: s.stream_url,
      logo: s.favicon || '',
      tags: s.tags ? s.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      country: '',
      language: '',
      votes: s.votes || 0,
    }));
}

export async function fetchRadioStations(): Promise<RadioStation[]> {
  // Try cache first
  try {
    if (AsyncStorage) {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const entry: CacheEntry = JSON.parse(cached);
        if (Date.now() - entry.timestamp < CACHE_DURATION && entry.stations.length > 0) {
          return entry.stations;
        }
      }
    }
  } catch {}

  // Fetch from backend
  try {
    const res = await fetchWithTimeout(API_URL, { headers: { 'User-Agent': 'PusztaPlayer/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: RawStation[] = await res.json();
    const stations = transform(Array.isArray(raw) ? raw : []);
    if (stations.length === 0) throw new Error('Empty result');

    // Cache
    try {
      if (AsyncStorage) {
        const entry: CacheEntry = { timestamp: Date.now(), stations };
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
      }
    } catch {}

    return stations;
  } catch {
    // Return cached even if expired as fallback
    try {
      if (AsyncStorage) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const entry: CacheEntry = JSON.parse(cached);
          if (entry.stations.length > 0) return entry.stations;
        }
      }
    } catch {}
    throw new Error('No stations available');
  }
}

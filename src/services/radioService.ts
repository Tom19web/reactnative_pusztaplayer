import { RadioStation } from '../constants/radioStations';
import { fetchWithTimeout } from './fetchWithTimeout';

let AsyncStorage: any;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default || require('@react-native-async-storage/async-storage'); } catch { AsyncStorage = null; }

const CACHE_KEY = 'pusztaplay_radio_api_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h
const API_URL = 'https://de1.api.radio-browser.info/json/stations/bycountry/hungary?limit=500&order=votes&hidebroken=true';

interface RawStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  favicon: string;
  votes: number;
  codec: string;
  bitrate: number;
  tags?: string;
  country?: string;
  language?: string;
}

interface CacheEntry {
  timestamp: number;
  stations: RadioStation[];
}

function guessMetadataUrl(streamUrl: string, raw: RawStation): string | undefined {
  try {
    const u = new URL(streamUrl);
    return `${u.protocol}//${u.host}/status-json.xsl`;
  } catch {
    return undefined;
  }
}

function transform(raw: RawStation[]): RadioStation[] {
  return raw
    .filter(s => s.url || s.url_resolved)
    .map(s => ({
      key: s.stationuuid,
      name: s.name,
      streamUrl: s.url_resolved || s.url,
      logo: s.favicon || '',
      metadataUrl: guessMetadataUrl(s.url_resolved || s.url, s),
      tags: s.tags ? s.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      country: s.country || '',
      language: s.language || '',
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

  // Fetch from API
  try {
    const res = await fetchWithTimeout(API_URL, { headers: { 'User-Agent': 'PusztaPlayer/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: RawStation[] = await res.json();
    const stations = transform(raw);
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

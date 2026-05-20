// Windows: @react-native-async-storage may not have native module
let AsyncStorage: any;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default
    || require('@react-native-async-storage/async-storage');
} catch {
  const store: Record<string, string> = {};
  AsyncStorage = {
    getItem: (k: string) => Promise.resolve(store[k] ?? null),
    setItem: (k: string, v: string) => { store[k] = v; return Promise.resolve(); },
    removeItem: (k: string) => { delete store[k]; return Promise.resolve(); },
  };
}
import { getImportedPlaylist } from './playlistService';
import { PlayerSession } from '../types';

const EP_URLS_KEY = 'pusztaplay_episode_urls';
const EP_URLS_MAX = 200;

/** Epizód URL-ek mentése külön AsyncStorage-ba (fallback-hez) */
export async function saveEpisodeUrl(key: string, url: string, title: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(EP_URLS_KEY);
    const map: Record<string, { url: string; title: string }> = raw ? JSON.parse(raw) : {};
    map[key] = { url, title };
    // Evict oldest if over max
    const keys = Object.keys(map);
    if (keys.length > EP_URLS_MAX) {
      delete map[keys[0]];
    }
    await AsyncStorage.setItem(EP_URLS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[playbackSession] saveEpisodeUrl failed:', e);
  }
}

export async function createPlaybackSession(
  contentId: string,
): Promise<PlayerSession> {
  const imported = getImportedPlaylist();

  if (!imported) {
    throw new Error('Nincs bejelentkezve. Jelentkezz be az Xtream szerverbe.');
  }

  // Live csatorna keresés
  const allChannels = imported.liveChannels || imported.channels || [];
  const live = allChannels.find(ch => ch.key === contentId);
  if (live) {
    return {
      contentId, title: live.title, streamType: 'hls', token: 'xtream-live',
      streamUrl: live.streamUrl, isLive: true,
    };
  }

  // VOD keresés
  const vod = (imported.movies || []).find(m => m.key === contentId);
  if (vod) {
    return {
      contentId, title: vod.title, streamType: 'mp4', token: 'xtream-vod',
      streamUrl: vod.streamUrl, isLive: false,
    };
  }

  // Sorozat / epizód keresés
  const ser = (imported.series || []).find(s => s.key === contentId);
  if (ser) {
    return {
      contentId, title: ser.title,
      streamType: ser.streamUrl ? 'mp4' : 'hls', token: 'xtream-series',
      streamUrl: ser.streamUrl || '', isLive: false,
    };
  }

  // Fallback: epizód URL-ek külön tárolóból
  try {
    const raw = await AsyncStorage.getItem(EP_URLS_KEY);
    if (raw) {
      const map: Record<string, { url: string; title: string }> = JSON.parse(raw);
      const cached = map[contentId];
      if (cached?.url) {
        return {
          contentId, title: cached.title || contentId,
          streamType: 'hls', token: 'xtream-series',
          streamUrl: cached.url, isLive: false,
        };
      }
    }
  } catch (e) {
    console.warn('[playbackSession] fallback lookup failed:', e);
  }

  throw new Error(`A tartalom nem található: ${contentId}`);
}

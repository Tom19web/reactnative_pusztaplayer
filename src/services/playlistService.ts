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
import { STORAGE_KEYS, CACHE_LIVE, CACHE_VOD } from '../constants';
import { xtreamFullLogin } from './xtreamApi';
import {
  loadXtreamCredentials,
  saveXtreamCredentials,
  clearXtreamCredentials,
} from './storage';
import { fetchLiveStreams } from './liveProxy';
import { saveEpisodeUrl } from './playbackSession';
import { PlaylistData, LoginResult } from '../types';

export {
  loadXtreamCredentials,
  saveXtreamCredentials,
  clearXtreamCredentials,
};

/** @deprecated Module-level singleton. TODO: v0.9 — move into AppContext state. Causes stale state on hot reload, prevents tree-shaking, makes unit testing fragile. */
let currentPlaylist: PlaylistData | null = null;

// ─── Cache mentés AsyncStorage-ba ──────────────────

export async function savePlaylistToCache(playlist: PlaylistData): Promise<void> {
  try {
    const toCache = {
      groups: playlist.groups,
      movieGroups: playlist.movieGroups,
      seriesGroups: playlist.seriesGroups,
      liveChannels: playlist.liveChannels.slice(0, CACHE_LIVE),
      movies: playlist.movies.slice(0, CACHE_VOD),
      series: playlist.series.slice(0, CACHE_VOD),
      tags: playlist.tags,
      languages: playlist.languages,
      userInfo: playlist.userInfo,
      xtreamUser: playlist.xtreamUser,
    };
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLIST, JSON.stringify(toCache));
  } catch (e) {
    if (__DEV__) console.warn('AsyncStorage mentés sikertelen:', e);
  }
}

// ─── Cache betöltés AsyncStorage-ból ────────────────

async function loadPlaylistFromCache(): Promise<PlaylistData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PLAYLIST);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.liveChannels && !p?.channels) return null;
    if (!p.liveChannels) {
      p.liveChannels = p.channels || [];
    }
    if (!p.movieGroups) p.movieGroups = ['Összes film'];
    if (!p.seriesGroups) p.seriesGroups = ['Összes sorozat'];
    if (!p.tags) p.tags = [];
    if (!p.languages) p.languages = [];
    return p;
  } catch {
    return null;
  }
}

// ─── Cache törlés ──────────────────────────────────

export async function clearPlaylistCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.PLAYLIST);
  } catch {}
}

// ─── Xtream login + cache ──────────────────────────

function loginResultToPlaylistData(result: LoginResult): PlaylistData {
  const playlist: PlaylistData = {
    userInfo: result.userInfo,
    liveChannels: result.liveChannels,
    channels: result.channels,
    movies: result.movies,
    series: result.series,
    groups: result.groups,
    movieGroups: result.movieGroups,
    seriesGroups: result.seriesGroups,
    tags: [],
    languages: [],
    xtreamUser: result.xtreamUser,
  };
  return playlist;
}

export async function xtreamLogin(
  username: string,
  password: string,
): Promise<PlaylistData> {
  const result = await xtreamFullLogin(username, password);
  const playlist = loginResultToPlaylistData(result);

  // Try backend for merged/deduped live channels (tags, logos, qualityVariants)
  try {
    const backendLive = await fetchLiveStreams(username, password);
    if (backendLive.fromBackend && backendLive.channels.length > 0) {
      playlist.liveChannels = backendLive.channels;
      playlist.channels = backendLive.channels;
    }
  } catch {}

  playlist.tags = playlist.tags || [...new Set(playlist.liveChannels.flatMap(c => c.tags || [c.group]))];
  playlist.languages = playlist.languages || [...new Set(playlist.liveChannels.map(c => c.language).filter(Boolean))];

  currentPlaylist = playlist;
  await savePlaylistToCache(playlist);
  await saveXtreamCredentials(username, password);
  return playlist;
}

// ─── Cache inicializálás induláskor ────────────────

export async function initPlaylistFromCache(): Promise<PlaylistData | null> {
  const cached = await loadPlaylistFromCache();
  if (cached) {
    currentPlaylist = cached;
  }
  return cached;
}

// ─── Getter ─────────────────────────────────────────

export function getImportedPlaylist(): PlaylistData | null {
  return currentPlaylist;
}

/**
 * Sorozat epizód hozzáadása a playlist-hez.
 * Frissíti a currentPlaylist-et ÉS az AsyncStorage cache-t,
 * hogy a playbackSession meg tudja találni.
 */
export async function addSeriesEpisode(episode: {
  key: string;
  title: string;
  streamUrl: string;
  seriesId: number;
  group: string;
  logo?: string;
}): Promise<void> {
  if (!currentPlaylist) return;
  const exists = (currentPlaylist.series || []).find(s => s.key === episode.key);
  if (exists) return;
  currentPlaylist.series = [
    ...(currentPlaylist.series || []),
    {
      key: episode.key,
      title: episode.title,
      streamUrl: episode.streamUrl,
      type: 'series' as const,
      seriesId: episode.seriesId,
      group: episode.group,
      logo: episode.logo || '',
      status: '',
      genre: '',
      year: '',
    },
  ];
  await saveEpisodeUrl(episode.key, episode.streamUrl, episode.title);
}

// ─── Törlés ────────────────────────────────────────

export async function clearImportedPlaylist(): Promise<void> {
  currentPlaylist = null;
  await clearPlaylistCache();
  await clearXtreamCredentials();
}

/** Újratölti a teljes playlist-et a szerverről a meglévő credential-ökkel. */
export async function refreshPlaylist(): Promise<PlaylistData | null> {
  try {
    const creds = await loadXtreamCredentials();
    if (!creds) return null;
    return await xtreamLogin(creds.username, creds.password);
  } catch (e) {
    if (__DEV__) console.warn('[refreshPlaylist] failed:', e);
    return null;
  }
}

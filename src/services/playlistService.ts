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
import { saveEpisodeUrl } from './playbackSession';
import { PlaylistData, LoginResult } from '../types';

export {
  loadXtreamCredentials,
  saveXtreamCredentials,
  clearXtreamCredentials,
};

/** @deprecated Module-level singleton. TODO: v0.8 — move into AppContext state. */
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
      userInfo: playlist.userInfo,
      xtreamUser: playlist.xtreamUser,
    };
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLIST, JSON.stringify(toCache));
  } catch (e) {
    console.warn('AsyncStorage mentés sikertelen:', e);
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
      p.movies = [];
      p.series = [];
      p.movieGroups = ['Összes film'];
      p.seriesGroups = ['Összes sorozat'];
    }
    if (!p.movieGroups) p.movieGroups = ['Összes film'];
    if (!p.seriesGroups) p.seriesGroups = ['Összes sorozat'];
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
  return {
    userInfo: result.userInfo,
    liveChannels: result.liveChannels,
    channels: result.channels,
    movies: result.movies,
    series: result.series,
    groups: result.groups,
    movieGroups: result.movieGroups,
    seriesGroups: result.seriesGroups,
    xtreamUser: result.xtreamUser,
  };
}

export async function xtreamLogin(
  username: string,
  password: string,
): Promise<PlaylistData> {
  const result = await xtreamFullLogin(username, password);
  const playlist = loginResultToPlaylistData(result);
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
  const parentLogo = episode.logo || currentPlaylist.series?.find(s => s.seriesId === episode.seriesId)?.logo || '';
  currentPlaylist.series = [
    ...(currentPlaylist.series || []),
    {
      key: episode.key,
      title: episode.title,
      streamUrl: episode.streamUrl,
      type: 'series' as const,
      seriesId: episode.seriesId,
      group: episode.group,
      logo: parentLogo,
      status: '',
      genre: '',
      year: '',
    },
  ];
  await savePlaylistToCache(currentPlaylist);
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
    const result = await xtreamFullLogin(creds.username, creds.password);
    const playlist = loginResultToPlaylistData(result);
    currentPlaylist = playlist;
    await savePlaylistToCache(playlist);
    return playlist;
  } catch (e) {
    console.warn('[refreshPlaylist] failed:', e);
    return null;
  }
}

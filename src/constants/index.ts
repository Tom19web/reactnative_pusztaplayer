import { Dimensions } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { HomeIcon, LiveIcon, MoviesIcon, SeriesIcon, FavIcon, WatchLaterIcon, EpgIcon } from '../components/icons/NavIcons';

// ─── Képernyő méret detektálás ──────────────────────
let SCREEN_WIDTH = 1920;
try { SCREEN_WIDTH = Dimensions.get('window').width; } catch {}
const REFERENCE_WIDTH = 1920;
const SCALE = Math.max(0.45, Math.min(SCREEN_WIDTH / REFERENCE_WIDTH, 1));

function s(value: number): number {
  return Math.round(value * SCALE);
}

// ─── Környezeti változók (.env fájlból) ─────────────
// A react-native-config natív oldalról tölti be; ha nincs .env fájl,
// a hardcoded alapértékek használódnak.
// Windows: react-native-config nem elérhető → üres objektum fallback
let Config: any = {};
try {
  Config = require('react-native-config');
  if (Config.default) Config = Config.default;
  if (Config.Config) Config = Config.Config;
} catch {};

// ─── Xtream szerver ──────────────────────────────────
export const XTREAM_SERVER = (Config && Config.XTREAM_SERVER) || 'https://live.pusztaplay.eu';
export const USER_AGENT = (Config && Config.USER_AGENT) || 'PusztaPlayer v1.0';

// ─── Hibanaplózás (Sentry) ──────────────────────────
// Állítsd be a saát DSN-ed itt: https://sentry.io/settings/projects/
export const SENTRY_DSN = (Config && Config.SENTRY_DSN) || '';
export const USER_STATUS_LOGGED_IN = 'Xtream bejelentkezve';
export const DEFAULT_PROFILE_NAME = 'Profil';
export const DEFAULT_PLAYER_CONTENT_ID = '';

// ─── AsyncStorage kulcsok ────────────────────────────
export const STORAGE_KEYS = {
  XTREAM_CREDS: 'pusztaplay_xtream_user',
  PLAYLIST: 'pusztaplay_m3u_channels',
} as const;

// ─── QR auth ─────────────────────────────────────────
export const QR_API_BASE = 'https://pusztaplay.eu/wp-json/pusztaplay/v1';
export const QR_POLL_INTERVAL = 3000;
export const QR_POLL_TIMEOUT = 300000;

// ─── Cache ───────────────────────────────────────────
export const CACHE_TTL_EPG = 30 * 60 * 1000;
export const CACHE_LIVE = 5000;
export const CACHE_VOD = 10000;

// ─── Élő stream formátum (TS / HLS) ──────────────
const LIVE_FORMAT_KEY = 'pusztaplay_live_format';
let _liveFormat: 'ts' | 'm3u8' = 'ts';
export function getLiveFormat(): 'ts' | 'm3u8' { return _liveFormat; }
export async function initLiveFormat(): Promise<void> {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const val = await AsyncStorage.getItem(LIVE_FORMAT_KEY);
    if (val === 'ts' || val === 'm3u8') _liveFormat = val;
  } catch {}
}
export async function setLiveFormat(fmt: 'ts' | 'm3u8'): Promise<void> {
  _liveFormat = fmt;
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(LIVE_FORMAT_KEY, fmt);
  } catch {}
}

export function useLiveFormat(): ['ts' | 'm3u8', (fmt: 'ts' | 'm3u8') => Promise<void>] {
  const [fmt, setFmt] = useState<'ts' | 'm3u8'>(_liveFormat);
  useEffect(() => { initLiveFormat().then(() => setFmt(_liveFormat)); }, []);
  const toggle = useCallback(async (f: 'ts' | 'm3u8') => { await setLiveFormat(f); setFmt(f); }, []);
  return [fmt, toggle];
}

// ─── Minőség érzékelés ───────────────────────────────
export function qualityLabel(title: string): string {
  const upper = title.toUpperCase();
  if (/\b(FHD|4K|UHD|2160P)\b/.test(upper)) return 'FHD';
  if (/\b(HD|1080P|720P)\b/.test(upper)) return 'HD';
  if (/\bSD\b/.test(upper)) return 'SD';
  return '';
}

// ─── Színek (eredeti CSS-ből) ───────────────────────
const RED = '#ff4d57' as const;
const PINK = '#ff5b63' as const;
const CREAM = '#f4f0e7' as const;

export const COLORS = {
  bg: '#0a0a0a',
  bg2: '#080808',
  panel: '#202020',
  panel2: '#1a1a1a',
  paper: CREAM,
  text: '#f8f4ec',
  muted: '#888888',
  yellow: '#ffcc00',
  cyan: '#00FFFF',
  red: RED,
  pink: PINK,
  border: '#0c0c0c',
  shadow: '#000000',
  success: '#4caf50',
  error: RED,
  white: '#ffffff',
  black: '#000000',
  cream: CREAM,
  darkText: '#1a1a1a',
  brandPink: PINK,
} as const;

// ─── Betűméretek (skálázva) ─────────────────────────
export const FONT = {
  xs: s(20),
  sm: s(24),
  md: s(28),
  lg: s(34),
  xl: s(42),
  xxl: s(56),
};

// ─── Térköz (skálázva) ───────────────────────────────
export const SPACING = {
  xs: s(6),
  sm: s(10),
  md: s(16),
  lg: s(24),
  xl: s(36),
  xxl: s(48),
};

// ─── Méretek (skálázva) ──────────────────────────────
export const SIZES = {
  sidebarWidth: 240,
  cardWidth: s(260),
  cardHeight: s(180),
  posterWidth: s(220),
  posterHeight: s(330),
  radius: s(16),
  radiusSm: s(10),
  radiusLg: s(22),
  borderRadius: s(14),
  liveCardWidth: s(240),
  historyCardWidth: s(200),
  detailPanelWidth: s(320),
  episodePanelWidth: s(400),
  loginCardWidth: s(500),
  logoSize: s(104),
};

// ─── Navigációs itemek ──────────────────────────────
export const NAV_ITEMS = [
  { key: 'Home', label: 'Kezdőlap', Icon: HomeIcon },
  { key: 'Live', label: 'Live TV', Icon: LiveIcon },
  { key: 'Movies', label: 'Filmek', Icon: MoviesIcon },
  { key: 'Series', label: 'Sorozatok', Icon: SeriesIcon },
  { key: 'EPG', label: 'TV Újság', Icon: EpgIcon },
  { key: 'Favorites', label: 'Kedvencek', Icon: FavIcon },
  { key: 'WatchLater', label: 'Megnézendő', Icon: WatchLaterIcon },
] as const;

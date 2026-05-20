import { QR_API_BASE } from '../constants';
import { Favorite, HistoryItem, WatchLaterItem } from '../types';
import { fetchWithTimeout } from './fetchWithTimeout';

export interface WpProfile {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  preferences?: { live: string[]; movies: string[]; series: string[] };
  favorites: Favorite[];
  watch_later: WatchLaterItem[];
  watch_progress: HistoryItem[];
  deleted?: boolean;
  deletedAt?: number;
}

/** @deprecated Module-level singleton. TODO: v0.8 — move into AppContext state. */
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
/** @deprecated Module-level singleton. */
let _pendingApiKey: string | null = null;
/** @deprecated Module-level singleton. */
let _pendingData: { profiles?: WpProfile[]; watch_progress?: HistoryItem[]; version?: number } | null = null;
let _profilesVersion = 1;

export function getProfilesVersion(): number { return _profilesVersion; }
export function setProfilesVersion(v: number) { _profilesVersion = v; }

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

function apiUrl(path: string, apiKey: string): string {
  return `${QR_API_BASE}${path}?api_key=${encodeURIComponent(apiKey)}`;
}

/**
 * Fetch all profiles + watch progress from WordPress
 */
export async function fetchProfiles(apiKey: string): Promise<{ profiles: WpProfile[]; watch_progress: HistoryItem[]; version: number }> {
  const res = await fetchWithTimeout(apiUrl('/profiles', apiKey), { headers: authHeaders(apiKey) }, 10000);
  if (!res.ok) return { profiles: [], watch_progress: [], version: 1 };
  const data: { profiles?: WpProfile[]; watch_progress?: HistoryItem[]; version?: number } = await res.json();
  _profilesVersion = data.version ?? 1;
  return { profiles: data.profiles || [], watch_progress: data.watch_progress || [], version: _profilesVersion };
}

/**
 * Save profiles + watch progress to WordPress (debounced)
 */
export function saveProfiles(apiKey: string, profiles: WpProfile[], watchProgress?: HistoryItem[]) {
  _pendingApiKey = apiKey;
  _pendingData = { profiles, watch_progress: watchProgress || [], version: _profilesVersion };
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => flush(), 5000);
}

/**
 * Flush pending changes immediately (call on exit)
 */
export async function flush() {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  if (!_pendingApiKey || !_pendingData) return;
  const apiKey = _pendingApiKey;
  const data = _pendingData;
  _pendingApiKey = null;
  _pendingData = null;
  // Read-before-write: ne írjuk felül a szerveren lévő több profilt kevesebbel
  try {
    const serverState = await fetchProfiles(apiKey);
    if (serverState.profiles.length >= 2 && (data.profiles?.length ?? 0) <= 1) {
      console.warn('[wordpressSync] read-before-write véd: szerveren több profil van, mint a kliensen — skip');
      return;
    }
  } catch {
    // Ha a szerver nem elérhető, próbáljuk feltölteni
  }
  try {
    const body = { ...data, version: _profilesVersion };
    const res = await fetchWithTimeout(apiUrl('/profiles', apiKey), {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    }, 10000);
    if (res.ok) {
      const result = await res.json();
      if (result.version) _profilesVersion = result.version;
    } else if (res.status === 409) {
      // Verzió konfliktus — fetch fresh profiles
      console.warn('[wordpressSync] version conflict, fetching fresh profiles');
      const fresh = await fetchProfiles(apiKey);
      _profilesVersion = fresh.version;
    }
  } catch { /* silent */ }
}

// Explicit, immediate save — no debounce, no _pendingData dependency
export async function saveProfilesNow(apiKey: string, profiles: WpProfile[]) {
  try {
    await fetchWithTimeout(apiUrl('/profiles', apiKey), {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({ profiles }),
    }, 10000);
  } catch { /* silent */ }
}

/**
 * Create a new profile (max 3)
 */
export async function createProfile(apiKey: string, name: string, color: string): Promise<WpProfile | null> {
  try {
    const res = await fetchWithTimeout(apiUrl('/profile', apiKey), {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({ action: 'create', name, color }),
    }, 10000);
    if (!res.ok) return null;
    const data: { profiles?: WpProfile[]; profile_id?: string; success?: boolean; error?: string } = await res.json();
    if (data && data.profiles) {
      const p = data.profiles.find(p => p.id === data.profile_id);
      return p || null;
    }
  } catch { /* silent */ }
  return null;
}

/**
 * Soft-delete a profile (sets deleted flag, not permanent)
 */
export async function deleteProfile(apiKey: string, profileId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(apiUrl('/profile', apiKey), {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({ action: 'delete', profile_id: profileId }),
    }, 10000);
    if (res.ok) {
      const data = await res.json();
      if (data.version) _profilesVersion = data.version;
    }
    return res.ok;
  } catch { return false; }
}

/**
 * Restore a soft-deleted profile
 */
export async function restoreProfile(apiKey: string, profileId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(apiUrl('/profile', apiKey), {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({ action: 'restore', profile_id: profileId }),
    }, 10000);
    if (res.ok) {
      const data = await res.json();
      if (data.version) _profilesVersion = data.version;
    }
    return res.ok;
  } catch { return false; }
}

/**
 * Save a single profile (favorites, watch_later, watch_progress)
 */
export async function saveSingleProfile(apiKey: string, profile: WpProfile): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(apiUrl('/profile', apiKey), {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({ action: 'save', ...profile }),
    }, 10000);
    return res.ok;
  } catch { return false; }
}

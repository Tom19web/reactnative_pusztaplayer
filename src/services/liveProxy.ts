import { Channel } from '../types';
import { xtreamGetLive } from './xtreamApi';

let AsyncStorage: any;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default || require('@react-native-async-storage/async-storage'); } catch { AsyncStorage = null; }

const SEMANTIC_API = 'https://live.pusztaplay.eu';
const SESSION_TOKEN_KEY = 'pusztaplay_session_token';

let _sessionToken: string | null = null;

async function loadStoredToken(): Promise<string | null> {
  try {
    if (AsyncStorage) {
      const stored = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
      if (stored) { _sessionToken = stored; return stored; }
    }
  } catch {}
  return null;
}

loadStoredToken();

export async function registerSession(
  xtreamUser: string,
  xtreamPass: string,
  _apiKey: string = '',
): Promise<string | null> {
  try {
    const res = await fetch(`${SEMANTIC_API}/api/v1/session/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xtream_user: xtreamUser, xtream_pass: xtreamPass }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    _sessionToken = data.session_token;
    try {
      if (AsyncStorage) await AsyncStorage.setItem(SESSION_TOKEN_KEY, _sessionToken);
    } catch {}
    return _sessionToken;
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null) {
  _sessionToken = token;
}

export function getSessionToken(): string | null {
  return _sessionToken;
}

export interface LiveProxyResult {
  channels: Channel[];
  groups: string[];
  fromBackend: boolean;
}

export async function fetchLiveStreams(
  username: string,
  password: string,
): Promise<LiveProxyResult> {
  if (_sessionToken) {
    try {
      const res = await fetch(`${SEMANTIC_API}/api/v1/live/streams`, {
        headers: {
          Authorization: `Bearer ${_sessionToken}`,
          'User-Agent': 'PusztaPlayer v1.0',
        },
      });
      if (res.status === 401) {
        _sessionToken = null;
        try { if (AsyncStorage) await AsyncStorage.removeItem(SESSION_TOKEN_KEY); } catch {}
      }
      if (res.ok) {
        const data = await res.json();
        const channels: Channel[] = (data.channels || []).map((c: any) => ({
          key: c.key,
          streamId: c.stream_id,
          title: c.title,
          group: c.group,
          logo: c.logo,
          status: `Élő · ${c.group}`,
          epg: [],
          type: 'live' as const,
          streamUrl: c.stream_url,
          qualityVariants: c.quality_variants?.map((v: any) => ({
            label: v.label,
            streamId: v.stream_id,
            streamUrl: v.stream_url,
            key: v.key,
          })),
        }));
        return {
          channels,
          groups: data.groups || [],
          fromBackend: true,
        };
      }
    } catch {}
  }

  // Fallback to direct Xtream API
  const result = await xtreamGetLive(username, password);
  return { ...result, fromBackend: false };
}

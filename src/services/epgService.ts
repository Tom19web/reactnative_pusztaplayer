import { XTREAM_SERVER, CACHE_TTL_EPG } from '../constants';
import { EpgEntry } from '../types';
import { fetchWithTimeout } from './fetchWithTimeout';

// ─── In-memory cache ───────────────────────────────
const EPG_CACHE_MAX = 50;
const _cache = new Map<string, { ts: number; rows: EpgEntry[] }>();

/**
 * Base64 → UTF-8 szöveg dekódolás.
 * Az Xtream API MINDIG Base64-ben adja a title és description mezőket.
 */
function safeDecodeBase64(str: string): string {
  if (!str || typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) return str;
  if (trimmed.length < 4) return str;
  // Ha nem base64 alakú (van benne space, stb.), hagyd ki
  if (trimmed.includes(' ') || trimmed.includes('\t')) return str;
  try {
    const decoded = decodeURIComponent(
      atob(trimmed)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    // Ha a dekódolt string base64-re kódolva visszaadja az eredetit, akkor sikerült
    const reEncoded = btoa(unescape(encodeURIComponent(decoded)));
    if (reEncoded === trimmed) return decoded;
    // Ellenkező esetben már dekódolt string volt → add vissza az eredetit
    return str;
  } catch {
    return str;
  }
}

/**
 * EPG időbélyeg formázás magyar HH:MM alakra.
 * Kezeli: Unix timestamp (mp) és Xtream formátum (YYYYMMDDHHMMSS ±ZZZZ)
 * Algoritmus: local time + offset → UTC timestamp → Date → toLocaleTimeString.
 * Ez NEM dupla timezone — az első lépés UTC-re normalizál,
 * a toLocaleTimeString pedig a készülék időzónájában jelenít meg.
 */
function formatEpgTime(raw: string | number): string {
  if (!raw) return '';
  let d: Date;
  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
    const n = Number(raw);
    d = new Date(n < 1e10 ? n * 1000 : n);
  } else {
    const m = String(raw).match(
      /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})/,
    );
    if (m) {
      const [, yr, mo, day, hr, mn, sc, tz] = m;
      const sign = tz[0] === '+' ? 1 : -1;
      const tzH = parseInt(tz.slice(1, 3), 10);
      const tzM = parseInt(tz.slice(3), 10);
      const utc =
        Date.UTC(+yr, +mo - 1, +day, +hr, +mn, +sc) -
        sign * (tzH * 60 + tzM) * 60000;
      d = new Date(utc);
    } else {
      d = new Date(raw);
    }
  }
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('hu-HU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Rövid EPG lekérdezése egy csatornához.
 */
export async function fetchShortEpg(
  creds: { username: string; password: string; server?: string },
  streamId: number | string,
  limit = 5,
): Promise<EpgEntry[]> {
  if (!creds?.username || !creds?.password || !streamId) return [];
  const cacheKey = String(streamId);
  const now = Date.now();
  const cached = _cache.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL_EPG) return cached.rows;

  const server = creds.server || XTREAM_SERVER;
  const url =
    `${server}/player_api.php` +
    `?username=${encodeURIComponent(creds.username)}` +
    `&password=${encodeURIComponent(creds.password)}` +
    `&action=get_short_epg` +
    `&stream_id=${encodeURIComponent(streamId)}` +
    `&limit=${limit}`;

  try {
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return [];
    const data = await res.json();
    const listings = data?.epg_listings || data?.EPG_Listings || [];
    const rows: EpgEntry[] = listings.slice(0, limit).map((item: any) => ({
      time: formatEpgTime(item.start || item.start_timestamp),
      endTime: formatEpgTime(item.stop || item.end_timestamp),
      title: safeDecodeBase64(item.title) || 'Ismeretlen műsor',
      description: safeDecodeBase64(item.description) || '',
    }));
    _cache.set(cacheKey, { ts: now, rows });
    // Evict oldest entries if over max
    if (_cache.size > EPG_CACHE_MAX) {
      const firstKey = _cache.keys().next().value;
      if (firstKey !== undefined) _cache.delete(firstKey);
    }
    return rows;
  } catch {
    return [];
  }
}

export function invalidateEpgCache(streamId: string | number): void {
  _cache.delete(String(streamId));
}

export function clearEpgCache(): void {
  _cache.clear();
}

import { XTREAM_SERVER, USER_AGENT, getLiveFormat } from '../constants';
import { dedupKey } from '../utils/dedupKey';
import {
  Channel, Movie, Series, UserInfo, LoginResult,
  XtreamLiveStream, XtreamVodStream, XtreamSeriesItem, XtreamCategory,
  XtreamVodInfo, XtreamSeriesInfo,
} from '../types';

// ─── API hívás ──────────────────────────────────────
// Note: credentials are sent as query params — Xtream Codes protocol requires this.
// The XTREAM_SERVER constant enforces HTTPS to protect credentials in transit.
// Stream URLs (buildLiveUrl, etc.) embed credentials in the path segment —
// this is inherent to the Xtream Codes protocol and cannot be avoided.

async function apiGet<T = any>(
  username: string,
  password: string,
  action = '',
  extra = '',
): Promise<T> {
  const url = `${XTREAM_SERVER}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${action ? `&action=${action}` : ''}${extra}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch (e: unknown) {
    throw new Error('A szerver nem elérhető. Ellenőrizd az internetkapcsolatot.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('Hibás felhasználónév vagy jelszó.');
  }
  if (!res.ok) {
    throw new Error(`Szerver hiba: ${res.status}`);
  }
  return res.json();
}

// ─── Stream URL építők ──────────────────────────────
// Credentials embedded in URL path — this is the Xtream Codes protocol.
// Over HTTPS the path segment is encrypted in transit.

export function buildLiveUrl(u: string, p: string, id: number): string {
  return `${XTREAM_SERVER}/live/${u}/${p}/${id}.${getLiveFormat()}`;
}

export function buildVodUrl(u: string, p: string, id: number, ext = 'm3u8'): string {
  return `${XTREAM_SERVER}/movie/${u}/${p}/${id}.${ext}`;
}

export function buildEpisodeUrl(u: string, p: string, id: number, ext = 'm3u8'): string {
  return `${XTREAM_SERVER}/series/${u}/${p}/${id}.${ext}`;
}

// ─── Kategória helper ───────────────────────────────

async function fetchCategories(
  username: string,
  password: string,
  action: string,
): Promise<{ catOrder: string[]; catById: Record<string, string> }> {
  try {
    const cats: XtreamCategory[] = await apiGet(username, password, action);
    if (!Array.isArray(cats)) return { catOrder: [], catById: {} };
    const catOrder = cats.map(c => c.category_name).filter(Boolean);
    const catById = Object.fromEntries(
      cats.map(c => [String(c.category_id), c.category_name]),
    );
    return { catOrder, catById };
  } catch {
    return { catOrder: [], catById: {} };
  }
}

// ─── Bejelentkezés ellenőrzés ───────────────────────

export async function xtreamCheckLogin(
  username: string,
  password: string,
): Promise<UserInfo> {
  const data = await apiGet(username, password);
  if (!data?.user_info) throw new Error('Hibás szerver válasz.');
  if (data.user_info.auth === 0) throw new Error('Hibás felhasználónév vagy jelszó.');
  return { username, password, ...data.user_info };
}

// ─── Live csatornák ─────────────────────────────────

export async function xtreamGetLive(
  username: string,
  password: string,
): Promise<{ channels: Channel[]; groups: string[] }> {
  const [{ catOrder, catById }, streams] = await Promise.all([
    fetchCategories(username, password, 'get_live_categories'),
    apiGet(username, password, 'get_live_streams'),
  ]);
  if (!Array.isArray(streams)) throw new Error('Hibás live stream válasz.');
  const usedKeys = new Map<string, number>();
  const channels: Channel[] = streams.map((s: XtreamLiveStream, i: number) => {
    const group = catById[String(s.category_id)] || s.category_name || 'Egyéb';
    const key = dedupKey(usedKeys, 'live', s.stream_id, i);
    return {
      key,
      streamId: s.stream_id,
      title: s.name || 'Ismeretlen csatorna',
      group,
      logo: s.stream_icon || '',
      status: `Élő · ${group}`,
      epg: [],
      type: 'live' as const,
      streamUrl: buildLiveUrl(username, password, s.stream_id),
    };
  });
  const extraGroups = [...new Set(channels.map(c => c.group))].filter(
    g => !catOrder.includes(g),
  );
  return { channels, groups: ['Összes csatorna', ...catOrder, ...extraGroups] };
}

// ─── Filmek (VOD) ───────────────────────────────────

export async function xtreamGetMovies(
  username: string,
  password: string,
): Promise<{ movies: Movie[]; movieGroups: string[] }> {
  const [{ catOrder, catById }, streams] = await Promise.all([
    fetchCategories(username, password, 'get_vod_categories'),
    apiGet(username, password, 'get_vod_streams'),
  ]);
  if (!Array.isArray(streams)) throw new Error('Hibás VOD válasz.');
  const usedKeys = new Map<string, number>();
  const movies: Movie[] = streams.map((s: XtreamVodStream, i: number) => {
    const group = catById[String(s.category_id)] || s.category_name || 'Egyéb';
    const ext = s.container_extension || 'm3u8';
    const key = dedupKey(usedKeys, 'vod', s.stream_id, i);
    return {
      key,
      streamId: s.stream_id,
      title: s.name || 'Ismeretlen film',
      group,
      logo: s.stream_icon || '',
      status: group,
      type: 'movie' as const,
      streamUrl: buildVodUrl(username, password, s.stream_id, ext),
      genre: s.genre || '',
      year: s.year || (s.releasedate || '').slice(0, 4) || '',
    };
  });
  const extraGroups = [...new Set(movies.map(m => m.group))].filter(
    g => !catOrder.includes(g),
  );
  return { movies, movieGroups: ['Összes film', ...catOrder, ...extraGroups] };
}

// ─── Sorozatok ──────────────────────────────────────

export async function xtreamGetSeries(
  username: string,
  password: string,
): Promise<{ series: Series[]; seriesGroups: string[] }> {
  const [{ catOrder, catById }, list] = await Promise.all([
    fetchCategories(username, password, 'get_series_categories'),
    apiGet(username, password, 'get_series'),
  ]);
  if (!Array.isArray(list)) throw new Error('Hibás series válasz.');
  const usedKeys = new Map<string, number>();
  const series: Series[] = list.map((s: XtreamSeriesItem, i: number) => {
    const group = catById[String(s.category_id)] || s.category_name || 'Egyéb';
    const key = dedupKey(usedKeys, 'series', s.series_id, i);
    return {
      key,
      seriesId: s.series_id,
      title: s.name || 'Ismeretlen sorozat',
      group,
      logo: s.cover || s.stream_icon || '',
      status: group,
      type: 'series' as const,
      streamUrl: null,
      genre: s.genre || '',
      year: s.year || s.releaseDate || '',
    };
  });
  const extraGroups = [...new Set(series.map(s => s.group))].filter(
    g => !catOrder.includes(g),
  );
  return { series, seriesGroups: ['Összes sorozat', ...catOrder, ...extraGroups] };
}

// ─── Teljes login (minden adat egyben) ─────────────

export async function xtreamFullLogin(
  username: string,
  password: string,
): Promise<LoginResult> {
  const userInfo = await xtreamCheckLogin(username, password);
  const [liveResult, vodResult, seriesResult] = await Promise.allSettled([
    xtreamGetLive(username, password),
    xtreamGetMovies(username, password),
    xtreamGetSeries(username, password),
  ]);
  const liveData = liveResult.status === 'fulfilled' ? liveResult.value : { channels: [], groups: [] };
  const vodData = vodResult.status === 'fulfilled' ? vodResult.value : { movies: [], movieGroups: [] };
  const seriesData = seriesResult.status === 'fulfilled' ? seriesResult.value : { series: [], seriesGroups: [] };
  return {
    userInfo,
    liveChannels: liveData.channels,
    channels: liveData.channels,
    movies: vodData.movies,
    series: seriesData.series,
    groups: liveData.groups,
    movieGroups: vodData.movieGroups,
    seriesGroups: seriesData.seriesGroups,
    xtreamUser: username,
  };
}

// ─── VOD részletes info ─────────────────────────────

export async function xtreamGetVodInfo(
  username: string,
  password: string,
  vodId: number,
): Promise<XtreamVodInfo> {
  const data = await apiGet(username, password, 'get_vod_info', `&vod_id=${vodId}`);
  if (!data?.info) throw new Error('Nincs film info.');
  return data;
}

// ─── Sorozat részletes info ─────────────────────────

export async function xtreamGetSeriesInfo(
  username: string,
  password: string,
  seriesId: number,
): Promise<XtreamSeriesInfo> {
  const data = await apiGet(username, password, 'get_series_info', `&series_id=${seriesId}`);
  if (!data?.episodes) throw new Error('Nincs epizódadat a sorozathoz.');
  return data;
}

// ─── Felhasználói fiók info ────────────────────────

export interface XtreamUserFullInfo {
  username: string;
  password: string;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export async function xtreamGetUserInfo(
  username: string,
  password: string,
): Promise<XtreamUserFullInfo> {
  const data = await apiGet(username, password);
  const info = data?.user_info || {};
  return {
    username: info.username || username,
    password,
    status: info.status || 'Active',
    exp_date: info.exp_date || '',
    is_trial: info.is_trial || '0',
    active_cons: info.active_cons || '0',
    created_at: info.created_at || '',
    max_connections: info.max_connections || '1',
    allowed_output_formats: info.allowed_output_formats || [],
  };
}

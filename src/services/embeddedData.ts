/**
 * Embedded Xtream data loader.
 * Loads data that was fetched at build time by scripts/fetch-xtream-data.js.
 */

import type { LoginResult, PlaylistData } from '../types';
import { xtreamLogin } from './playlistService';

interface XtreamDataFile {
  _fetchedAt: string;
  userInfo: any;
  liveCategories: any[];
  vodCategories: any[];
  seriesCategories: any[];
  liveStreams: any[];
  vodStreams: any[];
  seriesList: any[];
}

let cachedData: XtreamDataFile | null = null;

function loadData(): XtreamDataFile | null {
  if (cachedData) return cachedData;
  try {
    // Try loading from bundled data file (created by fetch-xtream-data.js)
    cachedData = require('../data/xtream-data.json');
    return cachedData;
  } catch {
    return null;
  }
}

/**
 * Try to login using embedded data (no HTTP required).
 * Returns the same format as xtreamLogin() from playlistService.
 */
export async function loginWithEmbeddedData(
  username: string,
  password: string,
): Promise<PlaylistData> {
  // First try real HTTP
  try {
    const playlist = await xtreamLogin(username, password);
    return playlist;
  } catch {
    // HTTP failed, try embedded data
  }

  // Fall back to embedded
  const data = loadData();
  if (!data) {
    throw new Error(
      'Nincs hĂˇlĂłzati kapcsolat Ă©s nincs mentett adat sem.n' +
      'Futtasd: node scripts/fetch-xtream-data.js',
    );
  }

  return convertToPlaylist(data, username, password);
}

function convertToPlaylist(data: XtreamDataFile, username: string, password: string): PlaylistData {
  const categories: Record<string, string> = {};
  const catById = (cats: any[]) => {
    const result: Record<string, string> = {};
    cats.forEach((c: any) => { result[String(c.category_id)] = c.category_name; });
    return result;
  };

  const liveCatById = catById(data.liveCategories);
  const vodCatById = catById(data.vodCategories);
  const seriesCatById = catById(data.seriesCategories);

  const usedKeys = new Map<string, number>();
  const dedupKey = (prefix: string, id: number, fallback: number) => {
    const key = `${prefix}-${id}`;
    const count = usedKeys.get(key) || 0;
    usedKeys.set(key, count + 1);
    return count > 0 ? `${key}-${count}` : key;
  };

  // Use XTREAM_SERVER from constants for stream URL construction
  const { XTREAM_SERVER } = require('../constants');
  const LIVE_FORMAT = 'ts';

  const liveChannels = (data.liveStreams || []).map((s: any, i: number) => ({
    key: dedupKey('live', s.stream_id, i),
    streamId: s.stream_id,
    title: s.name || 'Ismeretlen',
    group: liveCatById[String(s.category_id)] || s.category_name || 'EgyĂ©b',
    logo: s.stream_icon || '',
    status: 'Ă‰lĹ‘',
    epg: [] as any[],
    epgId: 0,
    type: 'live' as const,
    streamUrl: `${XTREAM_SERVER}/live/${username}/${password}/${s.stream_id}.${LIVE_FORMAT}`,
  }));

  const groups = ['Ă–sszes csatorna', ...new Set(liveChannels.map(c => c.group))];

  return {
    xtreamUser: username,
    liveChannels,
    movies: [],
    series: [],
    groups,
    movieGroups: ['Ă–sszes film'],
    seriesGroups: ['Ă–sszes sorozat'],
    liveEpg: {},
    liveCategories: data.liveCategories,
    movieCategories: data.vodCategories,
    seriesCategories: data.seriesCategories,
  };
}

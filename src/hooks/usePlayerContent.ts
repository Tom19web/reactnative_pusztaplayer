import { useState, useEffect, useRef } from 'react';
import { PlayerSession, PlayerMeta, EpgEntry } from '../types';
import { loadXtreamCredentials } from '../services/storage';
import { fetchShortEpg } from '../services/epgService';
import { xtreamGetSeriesInfo, xtreamGetVodInfo, buildEpisodeUrl } from '../services/xtreamApi';
import { saveEpisodeUrl } from '../services/playbackSession';

interface EP {
  key: string; title: string; episodeNum: number; id: number; ext: string;
}

interface VodInfo {
  plot: string; cast: string; genre: string; rating: string; director: string;
}

export function usePlayerContent(
  session: PlayerSession | null,
  meta: PlayerMeta | null,
  contentId: string,
) {
  const [vodInfo, setVodInfo] = useState<VodInfo | null>(null);
  const [epgEntries, setEpgEntries] = useState<EpgEntry[]>([]);
  const [seriesEps, setSeriesEps] = useState<EP[]>([]);
  const [currentEpIdx, setCurrentEpIdx] = useState(-1);
  const [seasonNum, setSeasonNum] = useState('');
  const [allSeasonsFlat, setAllSeasonsFlat] = useState<EP[]>([]);

  // EPG for live TV
  useEffect(() => {
    if (!session?.isLive || !meta?.streamId) return;
    let c = false;
    (async () => {
      const creds = await loadXtreamCredentials();
      if (!creds) return;
      const rows = await fetchShortEpg(creds, meta.streamId!, 2);
      if (!c) setEpgEntries(rows);
    })();
    return () => { c = true; };
  }, [session?.isLive, meta?.streamId]);

  // VOD info for movies
  useEffect(() => {
    if (!session || session.isLive || meta?.type !== 'movie' || !meta?.streamId) return;
    let c = false;
    (async () => {
      const creds = await loadXtreamCredentials();
      if (!creds) return;
      try {
        const data = await xtreamGetVodInfo(creds.username, creds.password, meta.streamId!);
        if (c) return;
        setVodInfo({
          plot: data.info?.plot || '', cast: data.info?.cast || '',
          genre: data.info?.genre || '', rating: data.info?.rating || '',
          director: data.info?.director || '',
        });
      } catch { if (__DEV__) console.warn('[usePlayerContent] VOD info failed'); }
    })();
    return () => { c = true; };
  }, [session?.isLive, meta?.type, meta?.streamId]);

  // Series episodes
  useEffect(() => {
    if (!session || session.isLive || meta?.seriesId == null || meta.seriesId <= 0) return;
    let c = false;
    (async () => {
      const creds = await loadXtreamCredentials();
      if (!creds) return;
      try {
        const data = await xtreamGetSeriesInfo(creds.username, creds.password, meta.seriesId!);
        if (c) return;
        const eps = data?.episodes || {};
        const sKeys = Object.keys(eps).sort((a, b) => Number(a) - Number(b));
        const allEps: EP[] = [];
        let foundIdx = -1;
        let foundSeason = '';
        for (const sn of sKeys) {
          for (const ep of (eps[sn] || [])) {
            const ek = `ep_${ep.id}`;
            if (ek === contentId) { foundIdx = allEps.length; foundSeason = sn; }
            allEps.push({ key: ek, title: ep.title || `E${ep.episode_num}`, episodeNum: ep.episode_num || 0, id: ep.id, ext: ep.container_extension || 'm3u8' });
          }
        }
        if (foundSeason) {
          setSeasonNum(foundSeason);
          setSeriesEps((eps[foundSeason] || []).map(ep => ({
            key: `ep_${ep.id}`, title: ep.title || `E${ep.episode_num}`,
            episodeNum: ep.episode_num || 0, id: ep.id, ext: ep.container_extension || 'm3u8',
          })));
          setCurrentEpIdx(allEps.findIndex(e => e.key === contentId));
          setAllSeasonsFlat(allEps);

          // Mass-cache all episode URLs so they survive cold starts
          allEps.forEach(ep => {
            saveEpisodeUrl(ep.key, buildEpisodeUrl(creds.username, creds.password, ep.id, ep.ext), ep.title);
          });
        }
      } catch { if (__DEV__) console.warn('[usePlayerContent] series info failed'); }
    })();
    return () => { c = true; };
  }, [contentId, session?.isLive, meta?.seriesId]);

  return {
    vodInfo, epgEntries, seriesEps, allSeasonsFlat, currentEpIdx, seasonNum,
    setSeriesEps, setCurrentEpIdx,
  };
}

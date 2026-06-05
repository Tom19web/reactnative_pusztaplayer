import { useState, useEffect, useMemo, useRef } from 'react';
import { Channel, EpgProgram } from '../types';
import { fetchShortEpg } from '../services/epgService';
import { loadXtreamCredentials } from '../services/storage';

export interface EpgRow {
  channel: Channel;
  programs: EpgProgram[];
}

const PROG_LIMIT = 3;
const BATCH_SIZE = 6;
const PREFETCH_PAGES = 2;

export function useEpg(searchTerm: string, channels: Channel[], page: number, pageSize: number) {
  const [epgByChannel, setEpgByChannel] = useState<Map<number, EpgProgram[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadedUpTo, setLoadedUpTo] = useState(0);
  const cancelledRef = useRef(false);

  const endIdx = Math.min(channels.length, (page + PREFETCH_PAGES + 1) * pageSize);

  useEffect(() => {
    cancelledRef.current = false;
    const needLoad = channels.slice(loadedUpTo, endIdx);
    if (needLoad.length === 0) return;

    (async () => {
      setLoading(true);
      try {
        const creds = await loadXtreamCredentials();
        if (!creds) { setLoading(false); return; }

        const result = new Map(epgByChannel);

        for (let i = 0; i < needLoad.length; i += BATCH_SIZE) {
          if (cancelledRef.current) break;
          const batch = needLoad.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (ch) => {
            if (cancelledRef.current) return;
            try {
              const rows = await fetchShortEpg(creds, ch.streamId, PROG_LIMIT);
              if (rows.length === 0) return;
              const programs: EpgProgram[] = rows.map((r, idx) => ({
                id: String(idx),
                channelId: ch.streamId,
                title: r.title,
                description: r.description,
                startTime: r.time,
                endTime: r.endTime,
                startTimestamp: r.startTimestamp,
                endTimestamp: r.endTimestamp,
              }));
              result.set(ch.streamId, programs);
            } catch {}
          }));
          if (!cancelledRef.current) {
            setEpgByChannel(new Map(result));
          }
        }

        if (!cancelledRef.current) setLoadedUpTo(endIdx);
      } catch (e) {
        if (__DEV__) console.warn('[useEpg] failed:', e);
      }
      if (!cancelledRef.current) setLoading(false);
    })();

    return () => { cancelledRef.current = true; };
  }, [channels, page, pageSize]);

  const rows = useMemo<EpgRow[]>(() => {
    const now = Date.now();
    const result: EpgRow[] = [];
    const pageChannels = channels.slice(page * pageSize, (page + 1) * pageSize);

    for (const ch of pageChannels) {
      const progs = epgByChannel.get(ch.streamId);
      if (!progs || progs.length === 0) continue;

      let foundNow = false;
      const visible: EpgProgram[] = [];
      for (const p of progs) {
        if (!foundNow && p.startTimestamp <= now && p.endTimestamp > now) {
          foundNow = true;
          visible.push(p);
        } else if (foundNow && visible.length < PROG_LIMIT) {
          visible.push(p);
        }
      }
      if (!foundNow) {
        const upcoming = progs.filter(p => p.startTimestamp > now).slice(0, PROG_LIMIT);
        if (upcoming.length > 0) {
          result.push({ channel: ch, programs: upcoming });
          continue;
        }
        continue;
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!visible.some(p => p.title.toLowerCase().includes(term))) continue;
      }

      result.push({ channel: ch, programs: visible });
    }

    // Pad to pageSize for consistent layout
    while (result.length < pageSize && result.length > 0) {
      result.push({ channel: { key: `_pad_${result.length}`, streamId: -1, title: '—', group: '', logo: '', status: '', epg: [], type: 'live', streamUrl: '' }, programs: [] });
    }

    return result;
  }, [channels, epgByChannel, searchTerm, page, pageSize]);

  return { rows, loading, loadedCount: epgByChannel.size };
}

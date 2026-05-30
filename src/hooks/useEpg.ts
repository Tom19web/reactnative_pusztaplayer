import { useState, useEffect, useMemo, useCallback } from 'react';
import { Channel, EpgProgram } from '../types';
import { fetchFullEpg } from '../services/epgService';
import { loadXtreamCredentials } from '../services/storage';
import { getImportedPlaylist } from '../services/playlistService';

export interface EpgRow {
  channel: Channel;
  programs: EpgProgram[];
}

export function useEpg(searchTerm: string) {
  const [epgByChannel, setEpgByChannel] = useState<Map<number, EpgProgram[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollToChannel, setScrollToChannel] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const creds = await loadXtreamCredentials();
        if (!creds) return;
        const data = await fetchFullEpg(creds);
        if (!cancelled) {
          setEpgByChannel(data);
          const playlist = getImportedPlaylist();
          if (playlist?.liveChannels?.length) {
            // Find current time slot for initial position
            const now = Date.now();
            for (let i = 0; i < playlist.liveChannels.length; i++) {
              const ch = playlist.liveChannels[i];
              const progs = data.get(ch.streamId);
              if (progs) {
                for (const p of progs) {
                  if (p.startTimestamp <= now && p.endTimestamp > now) {
                    setScrollToChannel(i);
                    break;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError('Nem sikerült betölteni a TV műsort');
        if (__DEV__) console.warn('[useEpg] fetchFullEpg failed:', e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const playlist = getImportedPlaylist();
  const channels = playlist?.liveChannels || [];

  const rows = useMemo<EpgRow[]>(() => {
    const now = Date.now();
    const result: EpgRow[] = [];

    for (const ch of channels) {
      const progs = epgByChannel.get(ch.streamId);
      if (!progs) continue;

      // Filter: "now" + next 3 programs
      let foundNow = false;
      const visible: EpgProgram[] = [];
      for (const p of progs) {
        if (!foundNow && p.startTimestamp <= now && p.endTimestamp > now) {
          foundNow = true;
          visible.push(p);
        } else if (foundNow && visible.length <= 3) {
          visible.push(p);
        }
      }
      // If no "now" program found, take first 4 that start after now
      if (!foundNow) {
        const upcoming = progs.filter(p => p.startTimestamp > now).slice(0, 4);
        if (upcoming.length > 0) {
          // Prepend a placeholder "now" entry
          result.push({ channel: ch, programs: upcoming });
          continue;
        }
        continue;
      }

      // Apply search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const match = visible.some(p => p.title.toLowerCase().includes(term));
        if (!match) continue;
      }

      result.push({ channel: ch, programs: visible });
    }

    return result;
  }, [channels, epgByChannel, searchTerm]);

  const timelineRange = useMemo(() => {
    let minTs = Date.now();
    let maxTs = minTs + 3600000; // fallback 1h
    for (const row of rows) {
      for (const p of row.programs) {
        if (p.startTimestamp < minTs) minTs = p.startTimestamp;
        if (p.endTimestamp > maxTs) maxTs = p.endTimestamp;
      }
    }
    return { start: minTs, end: maxTs };
  }, [rows]);

  return { rows, loading, error, timelineRange, scrollToChannel };
}

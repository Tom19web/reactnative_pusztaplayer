import { useCallback, useRef, useEffect } from 'react';
import { PlayerSession, PlayerMeta } from '../types';
import { useCore, useAddHistory, useHistory } from '../store/AppContext';

export function usePlayerHistory(
  contentId: string,
  session: PlayerSession | null,
  meta: PlayerMeta | null,
) {
  const watchHistory = useHistory();
  const addHistory = useAddHistory();
  const lastSavedRef = useRef(0);
  const liveSavedRef = useRef(false);
  const { state: { playlist } } = useCore();

  // Reset live save flag when contentId changes (new channel)
  useEffect(() => { liveSavedRef.current = false; }, [contentId]);

  const isSeriesEp = meta?.type === 'series' && contentId.startsWith('ep_');
  const parentSeries = isSeriesEp && playlist?.series
    ? playlist.series.find(s => s.seriesId === meta?.seriesId)
    : null;
  const effectiveKey = parentSeries?.key || contentId;

  const savedItem = watchHistory.find(h => h.key === effectiveKey);
  const resumePosition = (savedItem && savedItem.type !== 'live' && savedItem.position > 5
    && savedItem.duration > 0 && savedItem.position < savedItem.duration - 5)
    ? savedItem.position : 0;
  const resumeEpisodeKey = (isSeriesEp && savedItem?.episodeKey) ? savedItem.episodeKey : null;

  const trackProgress = useCallback((data: { currentTime: number; duration: number }) => {
    if (!session) return;
    if (session.isLive) {
      // Live: 1 db history entry elég, ha legalább 3 mp-ig nézi
      if (!liveSavedRef.current && data.currentTime >= 3) {
        liveSavedRef.current = true;
        addHistory({
          key: effectiveKey,
          title: meta?.title || session.title || contentId,
          type: 'live',
          group: meta?.group || '',
          logo: meta?.logo || '',
          streamUrl: session.streamUrl || '',
          position: 0, duration: 0,
        });
      }
    } else {
      // VOD/Series: delta alapú mentés a pontos pozícióhoz
      const delta = Math.abs(data.currentTime - lastSavedRef.current);
      if (data.currentTime >= 5 && delta >= 15) {
        lastSavedRef.current = data.currentTime;
        addHistory({
          key: effectiveKey,
          title: parentSeries?.title || meta?.title || session.title || contentId,
          type: meta?.type || 'movie',
          group: parentSeries?.group || meta?.group || '',
          logo: parentSeries?.logo || meta?.logo || '',
          streamUrl: session.streamUrl || '',
          position: data.currentTime, duration: data.duration || 0,
          episodeKey: isSeriesEp ? contentId : undefined,
        });
      }
    }
  }, [effectiveKey, contentId, meta, session, addHistory, isSeriesEp, parentSeries]);

  return { trackProgress, resumePosition, resumeEpisodeKey, watchHistory };
}

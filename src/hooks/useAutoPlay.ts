import { useState, useCallback, useRef, useEffect } from 'react';
import type { PlayerMeta } from '../types';

export function useAutoPlay(
  contentId: string,
  meta: PlayerMeta | null,
  session: { isLive: boolean } | null,
  allSeasonsFlat: { key: string }[],
  navigateToEp: (ep: { key: string }) => void,
) {
  const [countdown, setCountdown] = useState(0);
  const countdownActiveRef = useRef(false);

  // Refs for stable closure values
  const contentIdRef = useRef(contentId);
  const metaRef = useRef(meta);
  const sessionRef = useRef(session);
  const allSeasonsFlatRef = useRef(allSeasonsFlat);
  const navigateToEpRef = useRef(navigateToEp);

  contentIdRef.current = contentId;
  metaRef.current = meta;
  sessionRef.current = session;
  allSeasonsFlatRef.current = allSeasonsFlat;
  navigateToEpRef.current = navigateToEp;

  const handleProgress = useCallback((data: { currentTime: number; duration: number }) => {
    const m = metaRef.current;
    const s = sessionRef.current;
    const flat = allSeasonsFlatRef.current;
    if (!s?.isLive && m?.type === 'series' && data.duration > 0 && data.currentTime >= data.duration - 2 && flat.length > 0) {
      const idx = flat.findIndex(e => e.key === contentIdRef.current);
      if (idx >= 0 && idx < flat.length - 1) {
        setCountdown(5);
      }
    }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    countdownActiveRef.current = true;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Navigate when countdown expires
  useEffect(() => {
    if (countdown !== 0 || !countdownActiveRef.current) return;
    countdownActiveRef.current = false;
    const flat = allSeasonsFlatRef.current;
    const idx = flat.findIndex(e => e.key === contentIdRef.current);
    if (idx >= 0 && idx < flat.length - 1) {
      navigateToEpRef.current(flat[idx + 1]);
    }
  }, [countdown]);

  const cancelCountdown = useCallback(() => setCountdown(0), []);

  return { countdown, handleProgress, cancelCountdown };
}

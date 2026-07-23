import { useState, useEffect, useRef } from 'react';
import { Movie, Series, PlaylistData } from '../types';
import { fetchAIMoods, loadAIMoodCache, saveAIMoodCache } from '../services/aiMoods';

interface UseAIMoodsResult {
  aiMoods: Record<string, string[]>;
  loading: boolean;
  progress: number; // 0-1
}

export function useAIMoods(playlist: PlaylistData | null): UseAIMoodsResult {
  const [aiMoods, setAiMoods] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);
  const prevRef = useRef(playlist);

  useEffect(() => {
    if (!playlist || playlist === prevRef.current) return;
    prevRef.current = playlist;
    doneRef.current = false;
    setAiMoods({});
    setProgress(0);
  }, [playlist]);

  useEffect(() => {
    if (!playlist || doneRef.current) return;

    const movies = playlist.movies || [];
    if (movies.length === 0) return;

    (async () => {
      // Try cache first
      const cached = await loadAIMoodCache();
      if (cached && Object.keys(cached).length > 0) {
        setAiMoods(cached);
        doneRef.current = true;
        return;
      }

      // Fetch from AI proxy
      setLoading(true);
      const items = movies.slice(0, 500).map(m => ({
        key: m.key,
        title: m.title,
        genre: m.genre || '',
        plot: (m as any).plot || m.year || '',
      }));

      try {
        const moods = await fetchAIMoods(items, (done, total) => {
          setProgress(done / total);
        });
        if (Object.keys(moods).length > 0) {
          setAiMoods(moods);
          await saveAIMoodCache(moods);
        }
      } catch {}
      setLoading(false);
      doneRef.current = true;
    })();
  }, [playlist]);

  return { aiMoods, loading, progress };
}

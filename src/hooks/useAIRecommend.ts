import { useState, useEffect, useRef } from 'react';
import { HistoryItem, PlaylistData } from '../types';
import { aiRecommendQuery } from '../services/aiProxy';

interface AIRecItem {
  key: string;
  reason: string;
}

export function useAIRecommend(
  history: HistoryItem[],
  playlist: PlaylistData | null,
): { items: AIRecItem[]; loading: boolean } {
  const [items, setItems] = useState<AIRecItem[]>([]);
  const [loading, setLoading] = useState(false);
  const doneRef = useRef(false);
  const prevRef = useRef(playlist);

  useEffect(() => {
    if (!playlist || playlist === prevRef.current) return;
    prevRef.current = playlist;
    doneRef.current = false;
    setItems([]);
  }, [playlist]);

  useEffect(() => {
    if (!playlist || doneRef.current) return;

    const allMedia = [...(playlist.movies || []), ...(playlist.series || [])];
    if (allMedia.length === 0 || history.length === 0) return;

    (async () => {
      setLoading(true);
      const historyItems = history.filter(h => h.type !== 'live').slice(0, 10).map(h => ({
        title: h.title,
        type: h.type,
        genre: (h as any).genre,
      }));
      const contentItems = allMedia.slice(0, 300).map(m => ({
        key: m.key,
        title: m.title,
        type: m.type || 'movie',
        genre: m.genre || '',
        plot: (m as any).plot,
      }));

      try {
        const recs = await aiRecommendQuery(historyItems, contentItems);
        if (recs.length > 0) setItems(recs);
      } catch {}
      setLoading(false);
      doneRef.current = true;
    })();
  }, [playlist, history]);

  return { items, loading };
}

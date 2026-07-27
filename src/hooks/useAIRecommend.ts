import { useState, useEffect, useRef } from 'react';
import { HistoryItem, PlaylistData } from '../types';
import { recommendByEmbedding } from '../services/aiProxy';

interface AIRecItem {
  key: string;
  reason: string;
  similarity?: number;
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
      const historyItems = history
        .filter(h => h.type !== 'live')
        .slice(0, 10)
        .map(h => ({ key: h.key, title: h.title, type: h.type }));

      try {
        const recs = await recommendByEmbedding(historyItems, 10);
        if (recs.length > 0) {
          const seen = new Set<string>();
          const mapped = recs
            .map(r => {
              const id = parseInt(r.key, 10);
              const isEp = r.type === 'episode';
              const match =
                playlist.movies?.find(m => m.streamId === id) ||
                playlist.series?.find(s => s.seriesId === id);
              if (!match || seen.has(match.key)) return null;
              seen.add(match.key);
              const epPrefix = isEp ? r.title : '';
              return {
                key: match.key,
                reason: epPrefix || r.reason || r.description?.slice(0, 30) || 'AI',
                similarity: Math.round(r.similarity * 100),
              };
            })
            .filter(Boolean) as AIRecItem[];
          if (mapped.length > 0) setItems(mapped);
        }
      } catch {}
      setLoading(false);
      doneRef.current = true;
    })();
  }, [playlist, history]);

  return { items, loading };
}

import { useCallback, useMemo } from 'react';
import type { Channel } from '../types';

interface NavItem {
  key: string | null;
  name?: string;
}

export function useChannelNavigation(
  channels: Channel[],
  currentContentId: string,
  playContent: (key: string) => void,
) {
  const idx = useMemo(() => {
    const direct = channels.findIndex(c => c.key === currentContentId);
    if (direct >= 0) return direct;
    for (let i = 0; i < channels.length; i++) {
      if (channels[i].qualityVariants?.some(v => v.key === currentContentId)) return i;
    }
    return -1;
  }, [channels, currentContentId]);
  const inList = idx >= 0;

  const prev: NavItem = inList && idx > 0
    ? { key: channels[idx - 1].key, name: channels[idx - 1].title }
    : { key: null };

  const next: NavItem = inList && idx < channels.length - 1
    ? { key: channels[idx + 1].key, name: channels[idx + 1].title }
    : { key: null };

  const handlePrev = useCallback(() => { if (prev.key) playContent(prev.key); }, [prev.key, playContent]);
  const handleNext = useCallback(() => { if (next.key) playContent(next.key); }, [next.key, playContent]);

  return { prev, next, handlePrev, handleNext, inList };
}

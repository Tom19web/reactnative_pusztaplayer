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
  const idx = useMemo(() => channels.findIndex(c => c.key === currentContentId), [channels, currentContentId]);
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

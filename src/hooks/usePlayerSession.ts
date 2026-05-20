import { useState, useEffect, useRef } from 'react';
import { PlayerSession, PlayerMeta } from '../types';
import { createPlaybackSession } from '../services/playbackSession';
import { getImportedPlaylist } from '../services/playlistService';

export function usePlayerSession(contentId: string) {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [meta, setMeta] = useState<PlayerMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoKey, setVideoKey] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sess = await createPlaybackSession(contentId);
        if (cancelledRef.current) return;
        setSession(sess);
        setVideoUrl(sess.streamUrl);
        setVideoTitle(sess.title || contentId);

        const playlist = getImportedPlaylist();
        let metaItem: PlayerMeta | null = null;
        if (playlist) {
          metaItem = [...(playlist.liveChannels || []), ...(playlist.movies || []), ...(playlist.series || [])]
            .find((c: any) => c.key === contentId) as PlayerMeta || null;
        }
        if (!metaItem && contentId.startsWith('ep_')) {
          metaItem = { type: 'series', title: sess.title, group: '', logo: '', seriesId: -1 };
        }
        if (!cancelledRef.current) setMeta(metaItem);
      } catch (err: unknown) {
        if (!cancelledRef.current) setError(err instanceof Error ? err.message : 'Hiba a stream bet\u00F6lt\u00E9sekor');
      }
      if (!cancelledRef.current) setLoading(false);
    })();
    return () => { cancelledRef.current = true; };
  }, [contentId]);

  return {
    session, meta, loading, error,
    videoUrl, videoTitle, videoKey,
    setVideoUrl, setVideoTitle, setVideoKey,
    setMeta, setLoading, setError, setSession,
  };
}

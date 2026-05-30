import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, Image, StyleSheet, BackHandler } from 'react-native';
import VideoPlayer from '../components/VideoPlayer';
import { SelectedTrackType } from 'react-native-video';
import TFPressable from '../components/TFPressable';
import { buildEpisodeUrl } from '../services/xtreamApi';
import { addSeriesEpisode, loadXtreamCredentials } from '../services/playlistService';
import { useFavorites, useAppDispatch, useHistory } from '../store/AppContext';
import { COLORS, FONT, SPACING, SIZES } from '../constants';
import { useAutoPlay } from '../hooks/useAutoPlay';
import { usePlayerSession } from '../hooks/usePlayerSession';
import { usePlayerContent } from '../hooks/usePlayerContent';
import { usePlayerHistory } from '../hooks/usePlayerHistory';

interface EP {
  key: string; title: string; episodeNum: number; id: number; ext: string;
}

interface PlayerScreenProps {
  contentId: string;
  onBack: () => void;
  onPrevChannel?: () => void;
  onNextChannel?: () => void;
  onPlayContent?: (key: string) => void;
  prevChanName?: string;
  nextChanName?: string;
}

export default function PlayerScreen({ contentId, onBack, onPrevChannel, onNextChannel, onPlayContent, prevChanName, nextChanName }: PlayerScreenProps) {
  const favorites = useFavorites();
  const dispatch = useAppDispatch();
  const [showLogo, setShowLogo] = useState(false);
  const [videoResolution, setVideoResolution] = useState('');

  const watchHistory = useHistory();
  const seriesEpisodeKey = watchHistory.find(h => h.key === contentId)?.episodeKey;
  const actualContentId = seriesEpisodeKey || contentId;

  const {
    session, meta, loading, error, setError, setSession,
    videoUrl, videoTitle, videoKey,
    setVideoUrl, setVideoTitle, setVideoKey, setMeta,
  } = usePlayerSession(actualContentId);

  const { vodInfo, epgEntries, seriesEps, allSeasonsFlat, currentEpIdx, seasonNum, setCurrentEpIdx } =
    usePlayerContent(session, meta, actualContentId);

  const { trackProgress, resumePosition, resumeEpisodeKey } = usePlayerHistory(actualContentId, session, meta);

  const isFav = favorites.some(f => f.key === contentId);
  const [audioTracks, setAudioTracks] = useState<{ index: number; title: string; language?: string }[]>([]);
  const [textTracks, setTextTracks] = useState<{ index: number; title: string; language?: string }[]>([]);
  const [selectedTextTrackIdx, setSelectedTextTrackIdx] = useState(-1);
  const [selectedAudioTrackIdx, setSelectedAudioTrackIdx] = useState(0);
  const [downmixToStereo, setDownmixToStereo] = useState(false);

  // Ref-based navigateToEp to avoid circular TDZ (navigateToEp â†’ useAutoPlay â†’ switchToEpisode â†’ navigateToEp)
  const switchToEpRef = useRef<(ep: EP) => Promise<void>>(async () => {});
  const navigateToEp = useCallback(async (ep: EP) => switchToEpRef.current(ep), []);

  // Auto-play
  const { countdown, handleProgress, cancelCountdown } = useAutoPlay(actualContentId, meta, session, allSeasonsFlat, navigateToEp);

  // Ref-based cancel to avoid TDZ (switchToEpisode uses cancelCountdown before declaration)
  const cancelRef = useRef(cancelCountdown);
  cancelRef.current = cancelCountdown;

  // In-place episode switch
  const switchToEpisode = useCallback(async (ep: EP) => {
    const inSeason = seriesEps.some(e => e.key === ep.key);
    if (!inSeason && onPlayContent) {
      onPlayContent(ep.key);
      return;
    }
    const creds = await loadXtreamCredentials();
    if (!creds) return;
    const url = buildEpisodeUrl(creds.username, creds.password, ep.id, ep.ext);
    if (meta?.seriesId != null && meta.seriesId > 0) {
      await addSeriesEpisode({ key: ep.key, title: ep.title, streamUrl: url, seriesId: meta.seriesId, group: meta?.group || '', logo: meta?.logo });
    }
    setVideoUrl(url);
    setVideoTitle(ep.title);
    setVideoKey(prev => prev + 1);
    cancelRef.current();
    const idx = seriesEps.findIndex(e => e.key === ep.key);
    if (idx !== -1) setCurrentEpIdx(idx);
  }, [meta, seriesEps, onPlayContent]);

  // Sync the ref with the actual switchToEpisode function
  switchToEpRef.current = switchToEpisode;

  const handlePrev = useCallback(async () => {
    if (allSeasonsFlat.length > 0) {
      const idx = allSeasonsFlat.findIndex(e => e.key === actualContentId);
      if (idx > 0) await switchToEpisode(allSeasonsFlat[idx - 1]);
    } else { onPrevChannel?.(); }
  }, [allSeasonsFlat, actualContentId, onPrevChannel, switchToEpisode]);

  const handleNext = useCallback(async () => {
    if (allSeasonsFlat.length > 0) {
      const idx = allSeasonsFlat.findIndex(e => e.key === actualContentId);
      if (idx >= 0 && idx < allSeasonsFlat.length - 1) await switchToEpisode(allSeasonsFlat[idx + 1]);
    } else { onNextChannel?.(); }
  }, [allSeasonsFlat, actualContentId, onNextChannel, switchToEpisode]);

  const handleToggleFav = useCallback(() => {
    dispatch({ type: 'TOGGLE_FAVORITE', payload: {
      key: contentId, title: meta?.title || '',
      type: (meta?.type as 'live' | 'movie' | 'series') || 'movie',
      group: meta?.group || '', logo: meta?.logo || '',
      streamUrl: session?.streamUrl || '', seriesId: String(meta?.seriesId ?? ''),
      streamId: meta?.streamId != null ? String(meta.streamId) : undefined,
    }});
  }, [contentId, meta, session, dispatch]);

  // Back button
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => h.remove();
  }, [onBack]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>⏳ Stream betöltése...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>{'\u26A0'}</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={(state: any) => [styles.backBtn, state.focused && styles.backBtnFocused]}
          onPress={onBack}
        >
          <Text style={styles.backBtnText}>â† Vissza</Text>
        </Pressable>
      </View>
    );
  }

  if (!session?.streamUrl) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Nincs stream URL ehhez a tartalomhoz.</Text>
        <Pressable
          style={(state: any) => [styles.backBtn, state.focused && styles.backBtnFocused]}
          onPress={onBack}
        >
          <Text style={styles.backBtnText}>â† Vissza</Text>
        </Pressable>
      </View>
    );
  }

  const typeLabel = session.isLive ? '\uD83D\uDD34 LIVE'
    : meta?.type === 'movie' ? '\uD83C\uDFAC Film'
    : meta?.type === 'series' ? '\uD83D\uDCFA Sorozat'
    : 'VOD';

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        <VideoPlayer
          key={videoKey}
          url={videoUrl}
          title={videoTitle || meta?.title || session.title || contentId}
          isLive={session.isLive}
          resumePosition={resumePosition}
          onError={setError}
          onProgress={(data) => { trackProgress(data); handleProgress(data); }}
          onDimensions={(w, h) => { setShowLogo(w === 0 && h === 0); if (w > 0) setVideoResolution(`${w}×${h}`); }}
          isFav={isFav}
          onToggleFav={handleToggleFav}
          onPrevChannel={meta?.type === 'movie' || meta?.type === 'series' ? undefined : handlePrev}
          onNextChannel={meta?.type === 'movie' || meta?.type === 'series' ? undefined : handleNext}
          seriesEps={seriesEps}
          currentEpIdx={currentEpIdx}
          seasonNum={seasonNum}
          onPlayEpisode={(key: string) => {
            const ep = seriesEps.find(e => e.key === key);
            if (ep) navigateToEp(ep);
          }}
          logoUrl={meta?.logo}
          prevChanName={prevChanName}
          nextChanName={nextChanName}
          resolution={videoResolution}
          vodPlot={vodInfo?.plot}
          vodCast={vodInfo?.cast}
          vodGenre={vodInfo?.genre}
          vodRating={vodInfo?.rating}
          vodDirector={vodInfo?.director}
          noVideo={showLogo}
          onBack={onBack}
          selectedTextTrack={(() => {
            if (selectedTextTrackIdx < 0) return undefined;
            const t = textTracks[selectedTextTrackIdx];
            if (t?.language) return { type: SelectedTrackType.LANGUAGE, value: t.language };
            return { type: SelectedTrackType.INDEX, value: selectedTextTrackIdx };
          })()}
          selectedAudioTrack={(() => {
            if (selectedAudioTrackIdx <= 0) return undefined;
            const t = audioTracks[selectedAudioTrackIdx];
            if (t?.language) return { type: SelectedTrackType.LANGUAGE, value: t.language };
            return { type: SelectedTrackType.INDEX, value: selectedAudioTrackIdx };
          })()}
          downmixToStereo={downmixToStereo}
          onTrackInfo={(tracks) => { setAudioTracks(tracks.audio); setTextTracks(tracks.text); }}
          audioTracks={audioTracks}
          textTracks={textTracks}
          selectedTextTrackIdx={selectedTextTrackIdx}
          selectedAudioTrackIdx={selectedAudioTrackIdx}
          onSelectTextTrack={setSelectedTextTrackIdx}
          onSelectAudioTrack={setSelectedAudioTrackIdx}
          onToggleDownmix={() => setDownmixToStereo(d => !d)}
          nowTitle={epgEntries?.[0]?.title}
          nowTime={epgEntries?.[0]?.time}
          nowEndTime={epgEntries?.[0]?.endTime}
          nowDesc={epgEntries?.[0]?.description}
          nextTitle={epgEntries?.[1]?.title}
          nextTime={epgEntries?.[1]?.time}
          nextEndTime={epgEntries?.[1]?.endTime}
          nextDesc={epgEntries?.[1]?.description}
        />
        {meta?.logo && showLogo ? (
          <View style={styles.videoBgLogoWrap} pointerEvents="none">
            <Image source={{ uri: meta.logo }} style={styles.videoBgLogo} resizeMode="contain" />
          </View>
        ) : null}
      </View>
      {/* Auto-play countdown */}
      {countdown > 0 && (
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownText}>KĂ¶vetkezĹ‘ epizĂłd indĂ­tĂˇsa </Text>
          <Text style={styles.countdownNum}>{countdown} </Text>
          <Text style={styles.countdownHint}>OK gombbal megszakĂ­thatod</Text>
          <TFPressable style={styles.countdownCancelBtn} focusedStyle={styles.countdownCancelFocus} onPress={cancelCountdown}>
            <Text style={styles.countdownCancelText}>MĂ©gsem</Text>
          </TFPressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.black,
  },
  videoContainer: {
    flex: 1,
  },
  channelBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
  },
  channelBtnFocus: { backgroundColor: COLORS.cyan },
  channelBtnText: { color: COLORS.white, fontSize: 24 },
  videoBgLogo: {
    width: 480,
    aspectRatio: 16 / 9,
  },
  videoBgLogoWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 60,
    zIndex: 10,
    elevation: 10,
  },
  countdownOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
    gap: SPACING.md,
    zIndex: 100,
  },
  countdownText: { color: COLORS.white, fontSize: FONT.lg, fontFamily: 'Bangers-Regular' },
  countdownNum: { color: COLORS.yellow, fontSize: 80, fontFamily: 'Bangers-Regular' },
  countdownHint: { color: COLORS.muted, fontSize: FONT.sm },
  countdownCancelBtn: { backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl },
  countdownCancelFocus: { backgroundColor: COLORS.cyan, transform: [{ scale: 0.95 }] },
  countdownCancelText: { color: COLORS.white, fontSize: FONT.md, fontWeight: '700' },
  centerContainer: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  loadingText: { color: COLORS.muted, fontSize: FONT.lg },
  errorIcon: { fontSize: 64, marginBottom: SPACING.md },
  errorText: { color: COLORS.text, fontSize: FONT.lg, textAlign: 'center', marginBottom: SPACING.md },
  errorSub: { color: COLORS.muted, fontSize: FONT.xs, textAlign: 'center', marginBottom: SPACING.md },
  backBtn: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.panel2, alignItems: 'center', marginTop: SPACING.sm },
  backBtnFocused: { backgroundColor: COLORS.yellow },
  backBtnText: { color: COLORS.text, fontSize: FONT.md, fontWeight: '600' },
});

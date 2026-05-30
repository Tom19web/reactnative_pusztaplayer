import { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, DeviceEventEmitter, Platform, Pressable } from 'react-native';
import Video, { VideoRef, OnProgressData, SelectedTrack } from 'react-native-video';
import PlayerControls from './PlayerControls';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

interface VideoPlayerProps {
  url: string;
  title: string;
  isLive: boolean;
  resumePosition?: number;
  onError?: (error: string) => void;
  onProgress?: (data: { currentTime: number; duration: number }) => void;
  onDimensions?: (width: number, height: number) => void;
  isFav?: boolean;
  onToggleFav?: () => void;
  nowTitle?: string;
  nowTime?: string;
  nowEndTime?: string;
  nowDesc?: string;
  nextTitle?: string;
  nextTime?: string;
  nextEndTime?: string;
  nextDesc?: string;
  onPrevChannel?: () => void;
  onNextChannel?: () => void;
  seriesEps?: { key: string; title: string; episodeNum: number }[];
  currentEpIdx?: number;
  seasonNum?: string;
  onPlayEpisode?: (key: string) => void;
  logoUrl?: string;
  prevChanName?: string;
  nextChanName?: string;
  resolution?: string;
  vodPlot?: string;
  vodCast?: string;
  vodGenre?: string;
  vodRating?: string;
  vodDirector?: string;
  noVideo?: boolean;
  onBack?: () => void;
  selectedTextTrack?: SelectedTrack;
  selectedAudioTrack?: SelectedTrack;
  onTrackInfo?: (tracks: { audio: { index: number; title: string; language?: string }[]; text: { index: number; title: string; language?: string }[] }) => void;
  audioTracks?: { index: number; title: string; language?: string }[];
  textTracks?: { index: number; title: string; language?: string }[];
  selectedTextTrackIdx?: number;
  selectedAudioTrackIdx?: number;
  onSelectTextTrack?: (idx: number) => void;
  onSelectAudioTrack?: (idx: number) => void;
  downmixToStereo?: boolean;
  onToggleDownmix?: () => void;
}

export default function VideoPlayer({
  url, title, isLive, resumePosition, onError, onProgress, onDimensions,
  isFav, onToggleFav,
  nowTitle, nowTime, nowEndTime, nowDesc, nextTitle, nextTime, nextEndTime, nextDesc,
  onPrevChannel, onNextChannel,
  seriesEps, currentEpIdx, seasonNum, onPlayEpisode,
  logoUrl, prevChanName, nextChanName, resolution,
  vodPlot, vodCast, vodGenre, vodRating, vodDirector,
  noVideo, onBack,
  selectedTextTrack, selectedAudioTrack, downmixToStereo, onTrackInfo,
  audioTracks, textTracks, selectedTextTrackIdx, selectedAudioTrackIdx,
  onSelectTextTrack, onSelectAudioTrack, onToggleDownmix,
}: VideoPlayerProps) {
  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [buffering, setBuffering] = useState(false);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });
  const progressRef = useRef({ currentTime: 0, duration: 0 });
  const [fadeControls, setFadeControls] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumedRef = useRef(false);

  // �攵 Reconnect �攵
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const [retryKey, setRetryKey] = useState(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const cancelReconnect = useCallback(() => {
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
  }, []);

  const scheduleReconnect = useCallback(() => {
    cancelReconnect();
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      if (retryCountRef.current >= 3) {
        onErrorRef.current?.('Nincs válasz a szervertől (3 próbálkozás után)');
        return;
      }
      retryCountRef.current++;
      setRetryKey(prev => prev + 1);
    }, 8000);
  }, [cancelReconnect]);

  useEffect(() => () => cancelReconnect(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset resume + retry when URL changes
  useEffect(() => {
    resumedRef.current = false;
    retryCountRef.current = 0;
    cancelReconnect();
  }, [url, cancelReconnect]);

  const resetTimer = useCallback(() => {
    setFadeControls(false);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (!noVideo) {
      controlsTimer.current = setTimeout(() => setFadeControls(true), 6000);
    }
  }, [noVideo]);

  useEffect(() => {
    resetTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, []);

  useEffect(() => {
    if (resumePosition && resumePosition > 5 && !resumedRef.current) {
      resumedRef.current = true;
      const t = setTimeout(() => videoRef.current?.seek(resumePosition), 500);
      return () => clearTimeout(t);
    }
  }, [resumePosition, url]);

  const handleProgress = useCallback((data: OnProgressData) => {
    const dur = data.seekableDuration || data.playableDuration || data.currentTime;
    const p = { currentTime: data.currentTime, duration: dur };
    progressRef.current = p;
    setProgress(p);
    if (data.currentTime > 0.5) {
      cancelReconnect();
      if (!progressRef.current.currentTime || progressRef.current.currentTime === data.currentTime) {
        // first movement � log once
      }
    }
    onProgress?.({ currentTime: data.currentTime, duration: dur });
  }, [onProgress, cancelReconnect]);

  const handlePlayPause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    resetTimer();
  }, [resetTimer]);
  const handleSeek = useCallback((time: number) => { videoRef.current?.seek(time); resetTimer(); }, [resetTimer]);
  const handleRew = useCallback(() => { const p = progressRef.current; videoRef.current?.seek(Math.max(0, p.currentTime - 10)); resetTimer(); }, [resetTimer]);
  const handleFwd = useCallback(() => { const p = progressRef.current; videoRef.current?.seek(Math.min(p.duration || 0, p.currentTime + 30)); resetTimer(); }, [resetTimer]);
  const handleRestart = useCallback(() => { videoRef.current?.seek(0); setProgress({ currentTime: 0, duration: progress.duration }); resetTimer(); }, [progress.duration, resetTimer]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onHWKeyEvent', (ev: any) => {
      if (ev && ev.eventKeyAction === 0) {
        const t = ev?.eventType;
        if (t === 'up' || t === 'down' || t === 'left' || t === 'right') {
          resetTimer();
        } else if (t === 'playPause') {
          handlePlayPause();
        } else if (t === 'play') {
          setPaused(false); pausedRef.current = false;
        } else if (t === 'pause') {
          setPaused(true); pausedRef.current = true;
        }
      }
    });
    return () => sub.remove();
  }, [resetTimer, handlePlayPause]);

  const isVod = !isLive;

  return (
    <View style={styles.container}>
      <Video
        key={`v-${url.split('').reduce((h,c)=>0|(h*31+c.charCodeAt(0)),7)}-${retryKey}`}
        ref={videoRef}
        source={{ uri: url, headers: { 'User-Agent': BROWSER_UA } }}
        style={styles.video}
        resizeMode="contain"
        focusable={false}
        controls={false}
        paused={paused}
        onProgress={handleProgress}
        progressUpdateInterval={1000}
        onError={(e: any) => {
          const err = e?.error || e || {};
          const msg = err.errorString || err.message || 'ismeretlen';
          cancelReconnect();
          onError?.(msg);
        }}
        onLoadStart={() => {}}
        onLoad={(data: any) => {
          setBuffering(false);
          cancelReconnect();
          onDimensions?.(data.naturalSize?.width || 0, data.naturalSize?.height || 0);
        }}
        onBuffer={(e: any) => {
          setBuffering(e.isBuffering);
          if (e.isBuffering) scheduleReconnect();
          else cancelReconnect();
        }}
        selectedTextTrack={selectedTextTrack}
        selectedAudioTrack={selectedAudioTrack}
      />
      {buffering && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <Text style={styles.bufferingText}>{'\u23F3'}</Text>
        </View>
      )}
      {!Platform.isTV && fadeControls && (
        <Pressable style={styles.touchCatcher} onPress={resetTimer} />
      )}
      <View style={[styles.controlsOverlay, { opacity: fadeControls ? 0 : 1 }]} pointerEvents={fadeControls ? 'none' : 'auto'}>
        <PlayerControls
          paused={paused}
          isLive={isLive}
          isVod={isVod}
          currentTime={progress.currentTime}
          duration={progress.duration}
          title={title}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onRew={handleRew}
          onFwd={handleFwd}
          onRestart={handleRestart}
          isFav={isFav}
          onToggleFav={onToggleFav}
          nowTitle={nowTitle}
          nowTime={nowTime}
          nowEndTime={nowEndTime}
          nowDesc={nowDesc}
          nextTitle={nextTitle}
          nextTime={nextTime}
          nextEndTime={nextEndTime}
          nextDesc={nextDesc}
          onPrevChannel={onPrevChannel}
          onNextChannel={onNextChannel}
          seriesEps={seriesEps}
          currentEpIdx={currentEpIdx}
          seasonNum={seasonNum}
          onPlayEpisode={onPlayEpisode}
          logoUrl={logoUrl}
          prevChanName={prevChanName}
          nextChanName={nextChanName}
          resolution={resolution}
          vodPlot={vodPlot}
          vodCast={vodCast}
          vodGenre={vodGenre}
          vodRating={vodRating}
          vodDirector={vodDirector}
          onBack={onBack}
          audioTracks={audioTracks}
          textTracks={textTracks}
          selectedTextTrackIdx={selectedTextTrackIdx}
          selectedAudioTrackIdx={selectedAudioTrackIdx}
          onSelectTextTrack={onSelectTextTrack}
          onSelectAudioTrack={onSelectAudioTrack}
          downmixToStereo={downmixToStereo}
          onToggleDownmix={onToggleDownmix}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bufferingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bufferingText: { fontSize: 40, opacity: 0.6 },
  touchCatcher: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: 'transparent' },
});

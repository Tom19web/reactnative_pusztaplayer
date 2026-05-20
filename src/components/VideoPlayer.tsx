import { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, DeviceEventEmitter, Platform, Pressable } from 'react-native';
import Video, { VideoRef, OnProgressData, OnLoadData, SelectedTrack } from 'react-native-video';
import PlayerControls from './PlayerControls';
import { USER_AGENT } from '../constants';

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

export default function VideoPlayer({ url, title, isLive, resumePosition, onError, onProgress, onDimensions, isFav, onToggleFav,   nowTitle, nowTime, nowEndTime, nowDesc, nextTitle, nextTime, nextEndTime, nextDesc, onPrevChannel, onNextChannel, seriesEps, currentEpIdx, seasonNum, onPlayEpisode, logoUrl, prevChanName, nextChanName, resolution, vodPlot, vodCast, vodGenre, vodRating, vodDirector, noVideo, onBack, selectedTextTrack, selectedAudioTrack, downmixToStereo, onTrackInfo, audioTracks, textTracks, selectedTextTrackIdx, selectedAudioTrackIdx, onSelectTextTrack, onSelectAudioTrack, onToggleDownmix }: VideoPlayerProps) {
  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [buffering, setBuffering] = useState(false);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });
  const progressRef = useRef({ currentTime: 0, duration: 0 });
  const [fadeControls, setFadeControls] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastKey, setLastKey] = useState('');
  const [dbgAction, setDbgAction] = useState('');
  const controlsKey = useRef(0);
  const fadeRef = useRef(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumedRef = useRef(false);
  const ffInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ffSpeedRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGoodPosition = useRef(0);
  const retryBackoff = [2000, 5000, 15000];

  const resetTimer = useCallback(() => {
    if (fadeRef.current) controlsKey.current += 1;
    fadeRef.current = false;
    setFadeControls(false);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (!noVideo) {
      controlsTimer.current = setTimeout(() => { fadeRef.current = true; setFadeControls(true); }, 6000);
    }
  }, [noVideo]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      if (ffInterval.current) clearInterval(ffInterval.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  // Re-evaluate auto-hide when noVideo changes (radio channels etc.)
  useEffect(() => {
    resetTimer();
  }, [noVideo, resetTimer]);

  // Reset resume flag and retry count only when URL changes (new content)
  useEffect(() => {
    resumedRef.current = false;
    setRetryCount(0);
  }, [url]);

  // Apply resume position on initial load
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
    if (data.currentTime > 0.5) lastGoodPosition.current = data.currentTime;
    onProgress?.({ currentTime: data.currentTime, duration: dur });
  }, [onProgress]);

  const handlePlayPause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    setDbgAction(next ? '|> pause' : '|> play');
    resetTimer();
  }, [resetTimer]);
  const handleSeek = useCallback((time: number) => { videoRef.current?.seek(time); resetTimer(); }, [resetTimer]);
  const handleRew = useCallback(() => { const p = progressRef.current; videoRef.current?.seek(Math.max(0, p.currentTime - 10)); resetTimer(); }, [resetTimer]);
  const handleFwd = useCallback(() => { const p = progressRef.current; videoRef.current?.seek(Math.min(p.duration || 0, p.currentTime + 30)); resetTimer(); }, [resetTimer]);
  const handleRestart = useCallback(() => { videoRef.current?.seek(0); setProgress({ currentTime: 0, duration: progress.duration }); resetTimer(); }, [progress.duration, resetTimer]);

  const startScrub = useCallback((dir: 1 | -1) => {
    if (ffInterval.current) return;
    ffSpeedRef.current = 0;
    const p = progressRef.current;
    const jump0 = 5;
    const t0 = dir > 0
      ? Math.min(p.duration || 0, p.currentTime + jump0)
      : Math.max(0, p.currentTime - jump0);
    videoRef.current?.seek(t0);
    progressRef.current = { ...p, currentTime: t0 };
    setProgress({ ...p, currentTime: t0 });
    resetTimer();
    ffInterval.current = setInterval(() => {
      const p = progressRef.current;
      ffSpeedRef.current += 0.8;
      const jump = Math.round(5 + ffSpeedRef.current * ffSpeedRef.current);
      const t = dir > 0
        ? Math.min(p.duration || 0, p.currentTime + jump)
        : Math.max(0, p.currentTime - jump);
      videoRef.current?.seek(t);
      progressRef.current = { ...p, currentTime: t };
      setProgress({ ...p, currentTime: t });
      resetTimer();
    }, 300);
  }, [resetTimer]);

  const stopFFRW = useCallback(() => {
    if (ffInterval.current) { clearInterval(ffInterval.current); ffInterval.current = null; }
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onHWKeyEvent', (ev: any) => {
      if (ev) {
        setLastKey(`key:${ev.eventType||'?'} act:${ev.eventKeyAction} type:${typeof ev.eventKeyAction}`);
      }
      if (ev && ev.eventType === 'rewind') {
        if (ev.eventKeyAction === 0) { setDbgAction('startRW'); startScrub(-1); }
        else { setDbgAction('stopRW'); stopFFRW(); }
      } else if (ev && ev.eventType === 'fastForward') {
        if (ev.eventKeyAction === 0) { setDbgAction('startFF'); startScrub(1); }
        else { setDbgAction('stopFF'); stopFFRW(); }
      } else if (ev && ev.eventKeyAction === 0) {
        const t = ev?.eventType;
        if (t === 'up' || t === 'down' || t === 'left' || t === 'right') {
          resetTimer(); setDbgAction('reset');
        } else if (t === 'playPause') {
          handlePlayPause(); setDbgAction('toggle');
        } else if (t === 'play') {
          setPaused(false); pausedRef.current = false; setDbgAction('play');
        } else if (t === 'pause') {
          setPaused(true); pausedRef.current = true; setDbgAction('pause');
        } else { setDbgAction('unk:' + (t || '?')); }
      } else { setDbgAction('skipped'); }
    });
    return () => sub.remove();
  }, [resetTimer, handlePlayPause, startScrub, stopFFRW]);

  const isVod = !isLive;

  return (
    <View style={styles.container}>
      <Video
        key={`v-${url.split('').reduce((h,c)=>0|(h*31+c.charCodeAt(0)),7)}-${retryCount}`}
        ref={videoRef}
        source={{ uri: url, headers: { 'User-Agent': USER_AGENT } }}
        style={styles.video}
        resizeMode="contain"
        paused={paused}
        onProgress={handleProgress}
        progressUpdateInterval={1000}
        onError={(e: any) => {
          if (retryCount < retryBackoff.length) {
            if (retryTimer.current) clearTimeout(retryTimer.current);
            const delay = retryBackoff[retryCount];
            retryTimer.current = setTimeout(() => {
              retryTimer.current = null;
              setRetryCount(prev => prev + 1);
              // Seek back to last known position after remount
              if (lastGoodPosition.current > 0) {
                setTimeout(() => videoRef.current?.seek(lastGoodPosition.current), 800);
              }
            }, delay);
          } else {
            onError?.(e?.error?.message || 'LejĂˇtszĂˇsi hiba');
          }
        }}
        onLoad={(data: any) => {
          onDimensions?.(data.naturalSize?.width || 0, data.naturalSize?.height || 0);
          // Extract audio and text track info
          if (onTrackInfo && data?.trackId) {
            try {
              const audioTracks = (data?.audioTracks || []).map((t: any, i: number) => ({ index: i, title: t?.title || `Sáv ${i + 1}`, language: t?.language }));
              const textTracks = (data?.textTracks || []).map((t: any, i: number) => ({ index: i, title: t?.title || t?.language || `Felirat ${i + 1}`, language: t?.language }));
              onTrackInfo({ audio: audioTracks, text: textTracks });
            } catch { /* silent */ }
          }
        }}
        onBuffer={(e: any) => setBuffering(e.isBuffering)}
        selectedTextTrack={selectedTextTrack}
        selectedAudioTrack={selectedAudioTrack}
      />
      {buffering && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <Text style={styles.bufferingText}>âŹł</Text>
        </View>
      )}
      {/* Touchscreen: invisible tap receiver to bring back hidden controls */}
      {!Platform.isTV && fadeControls && (
        <Pressable style={styles.touchCatcher} onPress={resetTimer} />
      )}
      <View key={`ctrls-${controlsKey.current}`} style={[styles.controlsOverlay, { opacity: fadeControls ? 0 : 1 }]} pointerEvents={fadeControls ? 'none' : 'auto'}>
        {__DEV__ && (
        <View style={styles.keyDebug}>
          <Text style={styles.keyDebugText}>{lastKey}</Text>
          <Text style={styles.keyDebugText}>{dbgAction}</Text>
        </View>
        )}
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
  keyDebug: { position: 'absolute', top: 40, left: 0, right: 0, alignItems: 'center' },
  keyDebugText: { color: 'lime', fontSize: 10, backgroundColor: 'rgba(0,0,0,0.7)', padding: 2 },
});

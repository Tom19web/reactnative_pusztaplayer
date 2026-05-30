import { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, DeviceEventEmitter, TurboModuleRegistry, NativeModules } from 'react-native';
import PlayerControls from './PlayerControls';
import { USER_AGENT } from '../constants';

// Get the native video player - try TurboModule first, fallback to NativeModules
let WindowsVideo: any = null;
try { WindowsVideo = TurboModuleRegistry.get('WindowsVideoPlayer'); } catch {}
if (!WindowsVideo) {
  try { WindowsVideo = (NativeModules as any).WindowsVideoPlayer; } catch {}
}

interface SelectedTrack {
  type: 'index' | 'language' | 'title';
  value: number | string;
}

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
  isFav, onToggleFav, nowTitle, nowTime, nowEndTime, nowDesc,
  nextTitle, nextTime, nextEndTime, nextDesc,
  onPrevChannel, onNextChannel, seriesEps, currentEpIdx, seasonNum, onPlayEpisode,
  logoUrl, prevChanName, nextChanName, resolution, vodPlot, vodCast, vodGenre,
  vodRating, vodDirector, noVideo, onBack,
  selectedTextTrack, selectedAudioTrack, downmixToStereo, onTrackInfo,
  audioTracks, textTracks, selectedTextTrackIdx, selectedAudioTrackIdx,
  onSelectTextTrack, onSelectAudioTrack, onToggleDownmix,
}: VideoPlayerProps) {
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [buffering, setBuffering] = useState(false);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });
  const progressRef = useRef({ currentTime: 0, duration: 0 });
  const [fadeControls, setFadeControls] = useState(false);
  const [lastKey, setLastKey] = useState('');
  const [dbgAction, setDbgAction] = useState('');
  const controlsKey = useRef(0);
  const fadeRef = useRef(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumedRef = useRef(false);
  const ffInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ffSpeedRef = useRef(0);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryBackoff = [2000, 5000, 15000];
  const videoContainerRef = useRef<View>(null);
  const startedRef = useRef(false);

  const resetTimer = useCallback(() => {
    if (fadeRef.current) controlsKey.current += 1;
    fadeRef.current = false;
    setFadeControls(false);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (!noVideo) {
      controlsTimer.current = setTimeout(() => { fadeRef.current = true; setFadeControls(true); }, 6000);
    }
  }, [noVideo]);

  // Start playback when URL changes
  useEffect(() => {
    if (!url || noVideo) return;
    if (!WindowsVideo) return;

    retryCount.current = 0;
    resumedRef.current = false;
    startedRef.current = false;

    try {
      WindowsVideo.play(url);
      startedRef.current = true;
    } catch (e) {
      if (__DEV__) console.warn('[VideoPlayer] play failed:', e);
    }

    return () => {
      try { WindowsVideo?.destroy(); } catch {}
    };
  }, [url, noVideo]);

  // Apply resume position
  useEffect(() => {
    if (resumePosition && resumePosition > 5 && !resumedRef.current) {
      resumedRef.current = true;
      const t = setTimeout(() => {
        try { WindowsVideo?.seek(resumePosition * 1000); } catch {}
      }, 800);
      return () => clearTimeout(t);
    }
  }, [resumePosition, url]);

  // Listen for native video events
  useEffect(() => {
    if (!WindowsVideo) return;

    const subs = [
      DeviceEventEmitter.addListener('onVideoLoad', (data: any) => {
        onDimensions?.(data?.width || 0, data?.height || 0);
        const dur = data?.duration || 0;
        progressRef.current = { currentTime: progressRef.current.currentTime, duration: dur };
        setProgress(prev => ({ ...prev, duration: dur }));
      }),
      DeviceEventEmitter.addListener('onVideoProgress', (data: any) => {
        const dur = data?.seekableDuration || progressRef.current.duration;
        const p = { currentTime: data?.currentTime || 0, duration: dur };
        progressRef.current = p;
        setProgress(p);
        onProgress?.({ currentTime: p.currentTime, duration: dur });
      }),
      DeviceEventEmitter.addListener('onVideoEnd', () => {
        pausedRef.current = true;
        setPaused(true);
      }),
      DeviceEventEmitter.addListener('onVideoError', (data: any) => {
        const r = retryCount.current;
        if (r < retryBackoff.length) {
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            retryCount.current = r + 1;
            try { WindowsVideo?.play(url); } catch {}
          }, retryBackoff[r]);
        } else {
          onError?.(data?.message || 'Lejátszási hiba');
        }
      }),
      DeviceEventEmitter.addListener('onVideoBuffer', (data: any) => {
        setBuffering(data?.isBuffer ?? false);
      }),
    ];

    return () => subs.forEach(s => s.remove());
  }, [url, onProgress, onError, onDimensions]);

  // Send layout to native for video window positioning
  const updateLayout = useCallback(() => {
    if (!videoContainerRef.current || !WindowsVideo) return;
    videoContainerRef.current.measureInWindow((x, y, w, h) => {
      try { WindowsVideo.setLayout(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); } catch {}
    });
  }, []);

  const handlePlayPause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    setDbgAction(next ? '|> pause' : '|> play');
    try {
      if (next) WindowsVideo?.pause();
      else {
        if (startedRef.current) WindowsVideo?.seek(progressRef.current.currentTime);
        else {
          WindowsVideo?.play(url);
          startedRef.current = true;
        }
      }
    } catch {}
    resetTimer();
  }, [resetTimer, url]);
  const handleSeek = useCallback((time: number) => {
    try { WindowsVideo?.seek(time * 1000); } catch {}
    resetTimer();
  }, [resetTimer]);
  const handleRew = useCallback(() => {
    const p = progressRef.current;
    const t = Math.max(0, p.currentTime - 10000);
    progressRef.current = { ...p, currentTime: t };
    setProgress({ ...p, currentTime: t });
    try { WindowsVideo?.seek(t); } catch {}
    resetTimer();
  }, [resetTimer]);
  const handleFwd = useCallback(() => {
    const p = progressRef.current;
    const t = Math.min(p.duration || 0, p.currentTime + 30000);
    progressRef.current = { ...p, currentTime: t };
    setProgress({ ...p, currentTime: t });
    try { WindowsVideo?.seek(t); } catch {}
    resetTimer();
  }, [resetTimer]);
  const handleRestart = useCallback(() => {
    try { WindowsVideo?.seek(0); } catch {}
    setProgress({ currentTime: 0, duration: progress.duration });
    resetTimer();
  }, [progress.duration, resetTimer]);

  const startScrub = useCallback((dir: 1 | -1) => {
    if (ffInterval.current) return;
    ffSpeedRef.current = 0;
    const p = progressRef.current;
    const t0 = dir > 0 ? Math.min(p.duration || 0, p.currentTime + 5000) : Math.max(0, p.currentTime - 5000);
    try { WindowsVideo?.seek(t0); } catch {}
    progressRef.current = { ...p, currentTime: t0 };
    setProgress({ ...p, currentTime: t0 });
    resetTimer();
    ffInterval.current = setInterval(() => {
      ffSpeedRef.current += 0.8;
      const jump = Math.round(5000 + ffSpeedRef.current * ffSpeedRef.current * 1000);
      const p = progressRef.current;
      const t = dir > 0 ? Math.min(p.duration || 0, p.currentTime + jump) : Math.max(0, p.currentTime - jump);
      try { WindowsVideo?.seek(t); } catch {}
      progressRef.current = { ...p, currentTime: t };
      setProgress({ ...p, currentTime: t });
      resetTimer();
    }, 300);
  }, [resetTimer]);

  const stopFFRW = useCallback(() => {
    if (ffInterval.current) { clearInterval(ffInterval.current); ffInterval.current = null; }
  }, []);

  // Keyboard events from WindowsKeyboardManager
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onHWKeyEvent', (ev: any) => {
      if (ev) setLastKey(`key:${ev.eventType || '?'} act:${ev.eventKeyAction}`);
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
  const showTouchCatcher = !Platform.isTV;

  return (
    <View style={styles.container}>
      {/* Native video renders to child HWND, positioned by setLayout */}
      <View ref={videoContainerRef} style={styles.video} onLayout={updateLayout} />

      {buffering && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <Text style={styles.bufferingText}>⏳</Text>
        </View>
      )}
      {showTouchCatcher && fadeControls && (
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
          currentTime={progress.currentTime / 1000}
          duration={progress.duration / 1000}
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
  video: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bufferingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bufferingText: { fontSize: 40, opacity: 0.6 },
  touchCatcher: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: 'transparent' },
  keyDebug: { position: 'absolute', top: 40, left: 0, right: 0, alignItems: 'center' },
  keyDebugText: { color: 'lime', fontSize: 10, backgroundColor: 'rgba(0,0,0,0.7)', padding: 2 },
});

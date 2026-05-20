import { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, TurboModuleRegistry, NativeModules, Pressable, DeviceEventEmitter } from 'react-native';
import PlayerControls from './PlayerControls';

let WindowsVideo: any = null;
try { WindowsVideo = TurboModuleRegistry.get('WindowsVideoPlayer'); } catch {}
if (!WindowsVideo) {
  try { WindowsVideo = (NativeModules as any).WindowsVideoPlayer; } catch {}
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
  nowTitle?: string; nowTime?: string; nowEndTime?: string; nowDesc?: string;
  nextTitle?: string; nextTime?: string; nextEndTime?: string; nextDesc?: string;
  onPrevChannel?: () => void;
  onNextChannel?: () => void;
  seriesEps?: { key: string; title: string; episodeNum: number }[];
  currentEpIdx?: number;
  seasonNum?: string;
  onPlayEpisode?: (key: string) => void;
  logoUrl?: string;
  prevChanName?: string; nextChanName?: string; resolution?: string;
  vodPlot?: string; vodCast?: string; vodGenre?: string; vodRating?: string; vodDirector?: string;
  noVideo?: boolean;
  onBack?: () => void;
  audioTracks?: { index: number; title: string; language?: string }[];
  textTracks?: { index: number; title: string; language?: string }[];
  selectedTextTrackIdx?: number; selectedAudioTrackIdx?: number;
  onSelectTextTrack?: (idx: number) => void;
  onSelectAudioTrack?: (idx: number) => void;
  downmixToStereo?: boolean;
  onToggleDownmix?: () => void;
}

export default function VideoPlayer({ url, title, isLive, resumePosition, onError, onProgress, onDimensions, isFav, onToggleFav, nowTitle, nowTime, nowEndTime, nowDesc, nextTitle, nextTime, nextEndTime, nextDesc, onPrevChannel, onNextChannel, seriesEps, currentEpIdx, seasonNum, onPlayEpisode, logoUrl, prevChanName, nextChanName, resolution, vodPlot, vodCast, vodGenre, vodRating, vodDirector, noVideo, onBack, audioTracks, textTracks, selectedTextTrackIdx, selectedAudioTrackIdx, onSelectTextTrack, onSelectAudioTrack, downmixToStereo, onToggleDownmix }: VideoPlayerProps) {
  const videoContainerRef = useRef<View>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });
  const progressRef = useRef({ currentTime: 0, duration: 0 });
  const [fadeControls, setFadeControls] = useState(false);
  const fadeRef = useRef(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ffInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ffSpeedRef = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [buffering, setBuffering] = useState(false);

  const resetTimer = useCallback(() => {
    if (fadeRef.current) { }
    fadeRef.current = false;
    setFadeControls(false);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (!noVideo) {
      controlsTimer.current = setTimeout(() => { fadeRef.current = true; setFadeControls(true); }, 6000);
    }
  }, [noVideo]);

  // Update layout for native video window
  const updateLayout = useCallback(() => {
    if (!videoContainerRef.current || !WindowsVideo) return;
    (videoContainerRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
      if (w > 0 && h > 0) {
        WindowsVideo.setLayout(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      }
    });
  }, []);

  // Play video when URL changes
  useEffect(() => {
    if (!url || !WindowsVideo) return;
    WindowsVideo.play(url);
    resetTimer();

    // Poll for progress since Fabric events may not work
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => {
      if (pausedRef.current) return;
      const p = progressRef.current;
      if (p.duration > 0) {
        const t = Math.min(p.duration, p.currentTime + 1);
        progressRef.current = { ...p, currentTime: t };
        setProgress({ ...p, currentTime: t });
        onProgress?.({ currentTime: t, duration: p.duration });
      }
    }, 1000);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [url]);

  // Listen for native video events
  useEffect(() => {
    const onLoad = DeviceEventEmitter.addListener('onVideoLoad', (data: any) => {
      if (data?.duration > 0) {
        progressRef.current = { ...progressRef.current, duration: data.duration };
        setProgress(p => ({ ...p, duration: data.duration }));
        onDimensions?.(data?.width || 0, data?.height || 0);
      }
    });
    const onEnd = DeviceEventEmitter.addListener('onVideoEnd', () => {
      setPaused(true);
      pausedRef.current = true;
    });
    const onError = DeviceEventEmitter.addListener('onVideoError', (data: any) => {
      onError?.(data?.error || 'Lejátszási hiba');
    });

    return () => {
      onLoad.remove();
      onEnd.remove();
      onError.remove();
    };
  }, [onError, onDimensions]);

  // Layout update on mount and resize
  useEffect(() => {
    updateLayout();
    const sub = require('react-native').Dimensions.addEventListener('change', updateLayout);
    return () => sub?.remove();
  }, []);
    const sub = require('react-native').Dimensions.addEventListener('change', updateLayout);
    return () => sub?.remove();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      if (ffInterval.current) clearInterval(ffInterval.current);
      if (WindowsVideo) {
        try { WindowsVideo.destroy(); } catch {}
      }
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (WindowsVideo) {
      if (next) WindowsVideo.pause();
      else WindowsVideo.play(url);
    }
    resetTimer();
  }, [resetTimer, url]);

  const handleSeek = useCallback((time: number) => {
    if (WindowsVideo) WindowsVideo.seek(Math.round(time * 1000));
    progressRef.current = { ...progressRef.current, currentTime: time };
    setProgress({ ...progressRef.current, currentTime: time });
    resetTimer();
  }, [resetTimer]);

  const handleRew = useCallback(() => {
    const p = progressRef.current;
    const t = Math.max(0, p.currentTime - 10);
    if (WindowsVideo) WindowsVideo.seek(Math.round(t * 1000));
    progressRef.current = { ...p, currentTime: t };
    setProgress({ ...p, currentTime: t });
    resetTimer();
  }, [resetTimer]);

  const handleFwd = useCallback(() => {
    const p = progressRef.current;
    const t = Math.min(p.duration || 0, p.currentTime + 30);
    if (WindowsVideo) WindowsVideo.seek(Math.round(t * 1000));
    progressRef.current = { ...p, currentTime: t };
    setProgress({ ...p, currentTime: t });
    resetTimer();
  }, [resetTimer]);

  const handleRestart = useCallback(() => {
    handleSeek(0);
  }, [handleSeek]);

  const startScrub = useCallback((dir: 1 | -1) => {
    if (ffInterval.current) return;
    ffSpeedRef.current = 0;
    const p = progressRef.current;
    const jump = 5;
    const t = dir > 0 ? Math.min(p.duration || 0, p.currentTime + jump) : Math.max(0, p.currentTime - jump);
    if (WindowsVideo) WindowsVideo.seek(Math.round(t * 1000));
    progressRef.current = { ...p, currentTime: t };
    setProgress({ ...p, currentTime: t });
    resetTimer();
    ffInterval.current = setInterval(() => {
      ffSpeedRef.current += 0.8;
      const j = Math.round(5 + ffSpeedRef.current * ffSpeedRef.current);
      const p2 = progressRef.current;
      const t2 = dir > 0 ? Math.min(p2.duration || 0, p2.currentTime + j) : Math.max(0, p2.currentTime - j);
      if (WindowsVideo) WindowsVideo.seek(Math.round(t2 * 1000));
      progressRef.current = { ...p2, currentTime: t2 };
      setProgress({ ...p2, currentTime: t2 });
      resetTimer();
    }, 300);
  }, [resetTimer]);

  const stopFFRW = useCallback(() => {
    if (ffInterval.current) { clearInterval(ffInterval.current); ffInterval.current = null; }
  }, []);

  const isVod = !isLive;

  return (
    <View style={styles.container}>
      <View ref={videoContainerRef} style={styles.video} />

      {!fadeControls && (
        <View style={styles.controlsOverlay} pointerEvents="auto">
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
      )}

      {/* Touch catcher to show controls on tap */}
      {fadeControls && (
        <Pressable style={styles.touchCatcher} onPress={resetTimer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  touchCatcher: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: 'transparent' },
});

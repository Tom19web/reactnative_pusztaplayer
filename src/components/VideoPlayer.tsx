import { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, Image, StyleSheet, DeviceEventEmitter, Platform, Pressable, Animated } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Video, { VideoRef, OnProgressData, OnLoadData, OnBufferData, OnVideoErrorData, SelectedTrack } from 'react-native-video';
import PlayerControls from './PlayerControls';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const TRANSITION_QUOTES = [
  'Ha a stream bufferel, az az univerzum azt üzeni: pihenj.',
  'Minden epizód egy új lehetőség. Kivéve az S01E01-et, azt már láttad.',
  'A sors útjai kifürkészhetetlenek. A provider URL-jei még inkább.',
  'Aki keres, az talál. Aki nem keres, az véletlenül is megtalálja a kedvenc csatornáját.',
  'A boldogság nem a célban van, hanem az útban. Főleg ha a buffering kör forog.',
  'Szeresd felebarátodat, mint önmagadat. De a jelszavát ne add meg senkinek.',
  'Az élet rövid. Ne pazarold rossz felbontású streamre.',
  'A valódi szabadság az, amikor minden csatorna betölt elsőre.',
  'Nem számít, hányszor esnek el az epizódok — számít, hogy hányszor indítod újra.',
  'A lélek ott van, ahol a kedvenc sorozatod következő évada vár.',
  'Minden disconnect egy üzenet az égből: frissítsd a tokent.',
  'A bátrak nem félnek a spoilerektől. Csak a watch history törléstől.',
  'Az igazi szerelem az, amikor valaki megosztja veled az Xtream kreditjeit.',
  'Aki egyszer látott 4K streamen focimeccset, az már nem tud visszamenni.',
  'A csend arany. De a Dolby Atmos platina.',
  'Ne ítélj meg senkit, amíg egy mérföldet nem sétáltál az ő EPG-jében.',
  'Minden véget ér. Kivéve a sorozatfinálét, amit véletlenül kihagytál.',
  'Az univerzum legjobb titka: a következő epizód mindig elérhető.',
  'A múltat elengedni nehéz. A watch historyt törölni még nehezebb.',
  'Ha az ajtó bezárul, egy ablak kinyílik. Ha az ablak is bezárul, marad a stream.',
  'A nagy utazások egyetlen csatornakereséssel kezdődnek.',
  'Nem az számít, hány csatornád van, hanem hogy melyiket nézed valóban.',
  'A félelem csak addig tart, amíg a loading spinner forog.',
  'Az igazi hős az, aki 3 óra után is keres egy működő sport linket.',
  'Minden emberi lélekben ott lapul egy következő epizód, amit megnézne.',
  'A sors nem véletlenszerű. Csak az M3U lista sorrendje az.',
  'Ha elveszíted a kapcsolatot, az élő közvetítés vár rád. Vissza nem.',
  'Az álmok nem halnak meg. Csak offline módba váltanak.',
  'Amikor minden csatorna feketén áll, a szív megmutatja, melyik a valódi kedvenc.',
  'A végső igazság: nem a felbontás teszi a filmet — de 480p-n nem nézünk semmit.',
];

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
  epPlot?: string;
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
  transitionTrigger?: number;
}

export default function VideoPlayer({
  url, title, isLive, resumePosition, onError, onProgress, onDimensions,
  isFav, onToggleFav,
  nowTitle, nowTime, nowEndTime, nowDesc, nextTitle, nextTime, nextEndTime, nextDesc,
  onPrevChannel, onNextChannel,
  seriesEps, currentEpIdx, seasonNum, onPlayEpisode,
  logoUrl, prevChanName, nextChanName, resolution,
  vodPlot, vodCast, vodGenre, vodRating, vodDirector, epPlot,
  noVideo, onBack,
  selectedTextTrack, selectedAudioTrack, downmixToStereo, onTrackInfo,
  audioTracks, textTracks, selectedTextTrackIdx, selectedAudioTrackIdx,
  onSelectTextTrack, onSelectAudioTrack, onToggleDownmix,
  transitionTrigger,
}: VideoPlayerProps) {
  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0 });
  const progressRef = useRef({ currentTime: 0, duration: 0 });
  const [fadeControls, setFadeControls] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumedRef = useRef(false);
  const ffInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ffSpeedRef = useRef(0);

  const stopFFRW = useCallback(() => {
    if (ffInterval.current) { clearInterval(ffInterval.current); ffInterval.current = null; }
  }, []);

  const resetTimer = useCallback(() => {
    setFadeControls(false);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (!noVideo) {
      controlsTimer.current = setTimeout(() => setFadeControls(true), 6000);
    }
  }, [noVideo]);

  const startScrub = useCallback((dir: 1 | -1) => {
    if (ffInterval.current) return;
    const p = progressRef.current;
    if (p.duration <= 0) return;
    ffSpeedRef.current = 0;
    const jump = 5;
    const t = dir > 0 ? Math.min(p.duration || 0, p.currentTime + jump) : Math.max(0, p.currentTime - jump);
    videoRef.current?.seek(t);
    progressRef.current = { ...p, currentTime: t };
    setProgress({ ...p, currentTime: t });
    resetTimer();
    ffInterval.current = setInterval(() => {
      ffSpeedRef.current += 0.8;
      const p = progressRef.current;
      const jump = Math.round(5 + ffSpeedRef.current * ffSpeedRef.current * 0.5);
      const t = dir > 0 ? Math.min(p.duration || 0, p.currentTime + jump) : Math.max(0, p.currentTime - jump);
      videoRef.current?.seek(t);
      progressRef.current = { ...p, currentTime: t };
      setProgress({ ...p, currentTime: t });
      resetTimer();
    }, 300);
  }, [resetTimer]);

  // �攵 Reconnect �攵
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const [retryKey, setRetryKey] = useState(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Transition animation
  const videoScale = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const [showLogoTransition, setShowLogoTransition] = useState(false);
  const [transitionQuote, setTransitionQuote] = useState('');
  const controlsSlideY = useRef(new Animated.Value(0)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const runTransition = useCallback(() => {
    // Phase 1: Exit (200ms)
    Animated.parallel([
      Animated.timing(videoScale, { toValue: 0.85, duration: 200, useNativeDriver: true }),
      Animated.timing(videoOpacity, { toValue: 0.15, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      if (!mountedRef.current) return;
      setTransitionQuote(TRANSITION_QUOTES[Math.floor(Math.random() * TRANSITION_QUOTES.length)]);
      setShowLogoTransition(true);
      logoScale.setValue(0.5);
      logoOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 6, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  }, [videoScale, videoOpacity, logoScale, logoOpacity]);

  const finishTransition = useCallback(() => {
    setShowLogoTransition(false);
    logoScale.setValue(0);
    logoOpacity.setValue(0);
    videoScale.setValue(0.9);
    videoOpacity.setValue(0);
    // Phase 3: Enter (300ms)
    Animated.parallel([
      Animated.spring(videoScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(videoOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [videoScale, videoOpacity, logoScale, logoOpacity]);

  useEffect(() => {
    if (transitionTrigger && transitionTrigger > 0) runTransition();
  }, [transitionTrigger, runTransition]);

  useEffect(() => {
    if (fadeControls) {
      Animated.parallel([
        Animated.timing(controlsSlideY, { toValue: 60, duration: 300, useNativeDriver: true }),
        Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(controlsSlideY, { toValue: 0, friction: 7, useNativeDriver: true }),
        Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [fadeControls, controlsSlideY, controlsOpacity]);

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

  useEffect(() => () => { cancelReconnect(); stopFFRW(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset resume + retry when URL changes
  useEffect(() => {
    resumedRef.current = false;
    retryCountRef.current = 0;
    cancelReconnect();
  }, [url, cancelReconnect]);

  useEffect(() => {
    resetTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [resetTimer]);

  useEffect(() => {
    if (resumePosition && resumePosition > 5 && !resumedRef.current) {
      resumedRef.current = true;
      const t = setTimeout(() => videoRef.current?.seek(resumePosition), 500);
      return () => clearTimeout(t);
    }
  }, [resumePosition, url]);

  const handleProgress = useCallback((data: OnProgressData) => {
    const dur = data.seekableDuration || data.playableDuration || data.currentTime;
    const p = { currentTime: data.currentTime, duration: dur > 0 ? dur : progressRef.current.duration };
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
  const handleRew = useCallback(() => { const p = progressRef.current; if (p.duration <= 0) return; videoRef.current?.seek(Math.max(0, p.currentTime - 10)); resetTimer(); }, [resetTimer]);
  const handleFwd = useCallback(() => { const p = progressRef.current; if (p.duration <= 0) return; videoRef.current?.seek(Math.min(p.duration || 0, p.currentTime + 30)); resetTimer(); }, [resetTimer]);
  const handleRestart = useCallback(() => {
    videoRef.current?.seek(0);
    const d = progressRef.current.duration;
    progressRef.current = { currentTime: 0, duration: d };
    setProgress({ currentTime: 0, duration: d });
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onHWKeyEvent', (ev: { keyCode: number; longPress: boolean }) => {
      if (ev.eventType === 'rewind') {
        if (ev.eventKeyAction === 0) startScrub(-1);
        else stopFFRW();
      } else if (ev.eventType === 'fastForward') {
        if (ev.eventKeyAction === 0) startScrub(1);
        else stopFFRW();
      } else if (ev && ev.eventKeyAction === 0) {
        const t = ev?.eventType;
        if (t === 'up' || t === 'down' || t === 'left' || t === 'right') {
          resetTimer();
        } else if (t === 'playPause') {
          handlePlayPause();
        } else if (t === 'play') {
          setPaused(false); pausedRef.current = false;
        } else if (t === 'pause') {
          setPaused(true); pausedRef.current = true;
        } else if (t === 'channelUp') {
          onNextChannel?.();
        } else if (t === 'channelDown') {
          onPrevChannel?.();
        }
      }
    });
    return () => sub.remove();
  }, [resetTimer, handlePlayPause, startScrub, stopFFRW, onPrevChannel, onNextChannel]);

  const isVod = !isLive;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.videoWrapper, { opacity: videoOpacity, transform: [{ scale: videoScale }] }]}>
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
        onError={(e: OnVideoErrorData) => {
          const err = e?.error || e || {};
          const msg = err.errorString || err.message || 'ismeretlen';
          cancelReconnect();
          onError?.(msg);
        }}
        onLoadStart={() => {}}
        onLoad={(data: OnLoadData) => {
          cancelReconnect();
          if (showLogoTransition) finishTransition();
          onDimensions?.(data.naturalSize?.width || 0, data.naturalSize?.height || 0);
        }}
        onBuffer={(e: OnBufferData) => {
          if (e.isBuffering) scheduleReconnect();
          else cancelReconnect();
        }}
        selectedTextTrack={selectedTextTrack}
        selectedAudioTrack={selectedAudioTrack}
      />
      {!Platform.isTV && fadeControls && (
        <Pressable style={styles.touchCatcher} onPress={resetTimer} />
      )}
      <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity, transform: [{ translateY: controlsSlideY }] }]} pointerEvents={fadeControls ? 'none' : 'auto'}>
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
          epPlot={epPlot}
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
      </Animated.View>
      {showLogoTransition && (
        <LinearGradient
          colors={['#1a1000', '#0a0a1a', '#001a1a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoTransition}
          pointerEvents="none"
        >
          <Animated.View style={[styles.logoTransitionInner, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
            <Image source={require('../../assets/pp-logo.png')} style={styles.logoTransitionImg} resizeMode="contain" />
            <Text style={styles.logoTransitionText}>{transitionQuote}</Text>
          </Animated.View>
        </LinearGradient>
      )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  videoWrapper: { flex: 1 },
  video: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  touchCatcher: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: 'transparent' },
  logoTransition: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  logoTransitionInner: { alignItems: 'center', gap: 16 },
  logoTransitionImg: { width: 100, height: 100, borderRadius: 20 },
  logoTransitionText: { color: '#ffcc00', fontSize: 13, fontFamily: 'Poppins-Regular', fontStyle: 'italic', textAlign: 'center', maxWidth: '70%', lineHeight: 18 },
});

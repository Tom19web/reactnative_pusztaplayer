import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing, BackHandler } from 'react-native';
import TFPressable from './TFPressable';
import { useBackgroundAudio } from '../store/AppContext';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';
import AudioVisualizer from './AudioVisualizer';
import { COLORS, FONT, SPACING } from '../constants';
import { RadioStation } from '../constants/radioStations';

interface Props {
  station: RadioStation;
  onBack: () => void;
  isFav?: boolean;
  onToggleFav?: () => void;
}

export default function RadioPlayer({ station, onBack, isFav, onToggleFav }: Props) {
  const { audio, isPlaying, start, stop } = useBackgroundAudio();
  const { active: vizActive, start: vizStart, stop: vizStop, animValues } = useAudioVisualizer();
  const [metadata, setMetadata] = useState('');
  const [streamError, setStreamError] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const metadataTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAac = station.streamUrl.toLowerCase().endsWith('.aac');
  const isThisStationPlaying = isPlaying && audio?.streamUrl === station.streamUrl;

  const handleToggle = useCallback(() => {
    if (isThisStationPlaying) {
      stop();
      vizStop();
    } else {
      setStreamError(false);
      start({
        stationName: station.name,
        stationLogo: station.logo,
        streamUrl: station.streamUrl,
        streamType: isAac ? 'aac' : '',
      });
      vizStart();
    }
  }, [isThisStationPlaying, stop, vizStop, start, vizStart, station, isAac]);

  // Stream error detection
  useEffect(() => {
    if (!isPlaying || !audio || audio.streamUrl !== station.streamUrl) return;
    // If playing but buffering stops for long, might be a dead stream
    const t = setTimeout(() => {
      // No native error event available — rely on user feedback
    }, 10000);
    return () => clearTimeout(t);
  }, [isPlaying, audio, station.streamUrl]);

  // Auto-play on mount
  useEffect(() => {
    if (!isThisStationPlaying) {
      setStreamError(false);
      start({
        stationName: station.name,
        stationLogo: station.logo,
        streamUrl: station.streamUrl,
        streamType: isAac ? 'aac' : '',
      });
      vizStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.key]);

  // Pulse animation for ON AIR
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Metadata polling — backend ICY first, metadataUrl fallback
  useEffect(() => {
    const fetchMeta = async () => {
      let title = '';
      // Try backend ICY metadata parser first (works for Shoutcast + Icecast)
      try {
        const icyRes = await fetch(
          `https://live.pusztaplay.eu/api/v1/radio/metadata?stream_url=${encodeURIComponent(station.streamUrl)}`,
          { headers: { 'User-Agent': 'PusztaPlayer v1.0' } },
        );
        if (icyRes.ok) {
          const icyData = await icyRes.json();
          if (icyData.title) title = icyData.title;
        }
      } catch {}
      // Fallback to Icecast status-json.xsl
      if (!title && station.metadataUrl) {
        try {
          const res = await fetch(station.metadataUrl!, { headers: { 'User-Agent': 'PusztaPlayer v1.0' } });
          if (res.ok) {
            const data = await res.json();
            title = data?.icestats?.source?.title || data?.current_song || '';
          }
        } catch {}
      }
      if (title) {
        setMetadata(title);
        setShowTitle(true);
        Animated.timing(titleAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      }
    };
    fetchMeta();
    metadataTimer.current = setInterval(fetchMeta, 30000);
    return () => { if (metadataTimer.current) clearInterval(metadataTimer.current); };
  }, [station.streamUrl, station.metadataUrl, titleAnim]);

  // Back handler
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      stop();
      vizStop();
      onBack();
      return true;
    });
    return () => h.remove();
  }, [onBack, stop, vizStop]);

  const handleRetry = useCallback(() => {
    setStreamError(false);
    stop();
    vizStop();
    setTimeout(() => {
      start({
        stationName: station.name,
        stationLogo: station.logo,
        streamUrl: station.streamUrl,
        streamType: isAac ? 'aac' : '',
      });
      vizStart();
    }, 500);
  }, [stop, vizStop, start, vizStart, station, isAac]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TFPressable style={styles.backBtn} focusedStyle={styles.backBtnFocus} onPress={() => { stop(); vizStop(); onBack(); }}>
          <Text style={styles.backText}>{'\u25C0'} Vissza</Text>
        </TFPressable>
        <View style={styles.headerRight}>
          {onToggleFav && (
            <TFPressable style={[styles.favBtn, isFav && styles.favBtnActive]} focusedStyle={styles.favBtnFocus} onPress={onToggleFav}>
              <Text style={styles.favBtnText}>{isFav ? '\u2764\uFE0F' : '\uD83E\uDD0D'}</Text>
            </TFPressable>
          )}
          <View style={styles.onAirRow}>
            <Animated.View style={[styles.onAirDot, { opacity: pulseAnim, transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.onAirText}>ON AIR</Text>
          </View>
        </View>
      </View>

      {/* Station logo */}
      <View style={styles.logoWrap}>
        {station.logo ? (
          <Image source={{ uri: station.logo }} style={styles.logo} resizeMode="contain" />
        ) : (
          <Text style={styles.fallbackLogo}>{'\uD83D\uDCFB'}</Text>
        )}
      </View>

      {/* Station name */}
      <Text style={styles.stationName}>{station.name}</Text>

      {/* Now playing metadata */}
      <View style={styles.metadataRow}>
        {streamError ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>Stream nem elérhető</Text>
            <TFPressable style={styles.retryBtn} focusedStyle={styles.retryBtnFocus} onPress={handleRetry}>
              <Text style={styles.retryBtnText}>Újra</Text>
            </TFPressable>
          </View>
        ) : metadata ? (
          <Animated.Text style={[styles.metadata, { opacity: titleAnim }]} numberOfLines={2}>
            {'\uD83C\uDFB5'} {metadata}
          </Animated.Text>
        ) : (
          <Text style={styles.metadataPlaceholder}>{'\uD83D\uDCFB'} Kapcsolódás...</Text>
        )}
      </View>

      {/* Winamp visualizer */}
      <View style={styles.vizWrap}>
        <AudioVisualizer animValues={animValues} active={vizActive} />
      </View>

      {/* Play/Pause button */}
      <TFPressable style={styles.playBtn} focusedStyle={styles.playBtnFocus} onPress={handleToggle}>
        <Text style={styles.playBtnText}>{isThisStationPlaying ? '\u25A0' : '\u25B6'}</Text>
      </TFPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0a0a10',
    padding: SPACING.md,
  },
  header: {
    position: 'absolute', top: 20, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: SPACING.md,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: '#222', borderWidth: 1, borderColor: '#444' },
  backBtnFocus: { borderColor: COLORS.yellow },
  backText: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '600' },
  favBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#222', borderWidth: 1, borderColor: '#444' },
  favBtnActive: { borderColor: COLORS.red, backgroundColor: '#2a1010' },
  favBtnFocus: { borderColor: COLORS.yellow },
  favBtnText: { fontSize: 16 },
  onAirRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onAirDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  onAirText: { color: COLORS.red, fontSize: FONT.sm, fontWeight: '800', letterSpacing: 2 },
  logoWrap: { marginBottom: 8 },
  logo: { width: 120, height: 120, borderRadius: 12 },
  fallbackLogo: { fontSize: 80 },
  stationName: { color: COLORS.white, fontSize: FONT.xl, fontFamily: 'Bangers-Regular', textAlign: 'center', marginBottom: 8 },
  metadataRow: { minHeight: 40, alignItems: 'center', marginBottom: 8 },
  metadata: { color: COLORS.cyan, fontSize: FONT.sm, textAlign: 'center', maxWidth: 320 },
  metadataPlaceholder: { color: COLORS.muted, fontSize: FONT.sm },
  errorRow: { alignItems: 'center', gap: 6 },
  errorText: { color: COLORS.red, fontSize: FONT.sm },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.red, borderWidth: 1, borderColor: '#000' },
  retryBtnFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.cyan },
  retryBtnText: { color: COLORS.white, fontSize: FONT.sm, fontWeight: '700' },
  vizWrap: { marginBottom: 20 },
  playBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.cyan,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#000',
  },
  playBtnFocus: { borderColor: COLORS.yellow },
  playBtnText: { color: COLORS.black, fontSize: 32, fontWeight: '900' },
});

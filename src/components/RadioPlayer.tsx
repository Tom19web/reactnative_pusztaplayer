import { useEffect, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing, BackHandler } from 'react-native';
import TFPressable from './TFPressable';
import { useBackgroundAudio } from '../store/AppContext';
import { COLORS, FONT, SPACING } from '../constants';
import { RadioStation } from '../constants/radioStations';

interface Props {
  station: RadioStation;
  onBack: () => void;
}

export default function RadioPlayer({ station, onBack }: Props) {
  const { audio, isPlaying, start, stop, clear } = useBackgroundAudio();
  const [metadata, setMetadata] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const visualizerBars = useRef(Array.from({ length: 7 }, () => new Animated.Value(0.2))).current;
  const metadataTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAac = station.streamUrl.toLowerCase().endsWith('.aac');
  const isThisStationPlaying = isPlaying && audio?.streamUrl === station.streamUrl;

  const handleToggle = () => {
    if (isThisStationPlaying) {
      stop();
    } else {
      start({
        stationName: station.name,
        stationLogo: station.logo,
        streamUrl: station.streamUrl,
        streamType: isAac ? 'aac' : '',
      });
    }
  };

  // Auto-start on mount
  useEffect(() => {
    if (!isThisStationPlaying) {
      start({
        stationName: station.name,
        stationLogo: station.logo,
        streamUrl: station.streamUrl,
        streamType: isAac ? 'aac' : '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visualizer animation
  useEffect(() => {
    const animations = visualizerBars.map((bar, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 0.3 + Math.random() * 0.7, duration: 500 + i * 80, useNativeDriver: false }),
          Animated.timing(bar, { toValue: 0.15 + Math.random() * 0.3, duration: 400 + i * 60, useNativeDriver: false }),
        ]),
      );
      loop.start();
      return loop;
    });
    return () => animations.forEach(a => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.key]);

  // ON AIR pulse animation
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

  // Metadata polling (every 30s)
  useEffect(() => {
    if (!station.metadataUrl) return;
    const fetchMeta = async () => {
      try {
        const res = await fetch(station.metadataUrl!, { headers: { 'User-Agent': 'PusztaPlayer v1.0' } });
        if (res.ok) {
          const data = await res.json();
          const title = data?.icestats?.source?.title || data?.current_song || '';
          if (title) setMetadata(title);
        }
      } catch {}
    };
    fetchMeta();
    metadataTimer.current = setInterval(fetchMeta, 30000);
    return () => { if (metadataTimer.current) clearInterval(metadataTimer.current); };
  }, [station.metadataUrl]);

  // Back button
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => h.remove();
  }, [onBack]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TFPressable style={styles.backBtn} focusedStyle={styles.backBtnFocus} onPress={onBack}>
          <Text style={styles.backText}>{'\u25C0'} Vissza</Text>
        </TFPressable>
        <View style={styles.onAirRow}>
          <Animated.View style={[styles.onAirDot, { opacity: pulseAnim, transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.onAirText}>ON AIR</Text>
        </View>
      </View>

      {/* Visualizer bars */}
      <View style={styles.visualizer}>
        {visualizerBars.map((bar, i) => (
          <Animated.View key={i} style={[styles.bar, { height: Animated.multiply(bar, 60) }]} />
        ))}
      </View>

      {/* Station info */}
      <View style={styles.stationInfo}>
        {station.logo ? (
          <Image source={{ uri: station.logo }} style={styles.logo} resizeMode="contain" />
        ) : (
          <Text style={styles.fallbackLogo}>{'\uD83D\uDCFB'}</Text>
        )}
        <Text style={styles.stationName}>{station.name}</Text>
        {metadata ? <Text style={styles.metadata} numberOfLines={1}>{metadata}</Text> : null}
      </View>

      {/* Play/Stop */}
      <TFPressable style={styles.playBtn} focusedStyle={styles.playBtnFocus} onPress={handleToggle}>
        <Text style={styles.playBtnText}>{isThisStationPlaying ? '\u25A0' : '\u25B6'}</Text>
      </TFPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.92)',
    padding: SPACING.md,
  },
  header: {
    position: 'absolute', top: 20, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: SPACING.md,
  },
  backBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: '#333', borderWidth: 1, borderColor: '#555' },
  backBtnFocus: { borderColor: COLORS.yellow },
  backText: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '600' },
  onAirRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onAirDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  onAirText: { color: COLORS.red, fontSize: FONT.sm, fontWeight: '800', letterSpacing: 2 },
  visualizer: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'center', height: 80, gap: 4,
    marginBottom: 20,
  },
  bar: { width: 8, backgroundColor: COLORS.cyan, borderRadius: 2, minHeight: 4 },
  stationInfo: { alignItems: 'center', marginBottom: 30 },
  logo: { width: 100, height: 100, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  fallbackLogo: { fontSize: 64, marginBottom: 12 },
  stationName: { color: COLORS.white, fontSize: FONT.lg, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  metadata: { color: COLORS.muted, fontSize: FONT.sm, maxWidth: 300, textAlign: 'center' },
  playBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.cyan,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#000',
  },
  playBtnFocus: { borderColor: COLORS.yellow },
  playBtnText: { color: COLORS.black, fontSize: 28, fontWeight: '900' },
});

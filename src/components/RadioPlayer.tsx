import { useEffect, useState, useRef } from 'react';
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
}

const RINGS = [
  { color: COLORS.yellow, maxScale: 2.2, size: 100 },
  { color: COLORS.cyan, maxScale: 3.0, size: 80 },
  { color: COLORS.yellow, maxScale: 3.8, size: 60 },
  { color: COLORS.cyan, maxScale: 4.6, size: 40 },
];

export default function RadioPlayer({ station, onBack }: Props) {
  const { audio, isPlaying, start, stop } = useBackgroundAudio();
  const { active: vizActive, start: vizStart, stop: vizStop, animValues } = useAudioVisualizer();
  const [metadata, setMetadata] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const metadataTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const ringRefs = useRef(RINGS.map(() => ({
    scale: new Animated.Value(0.5),
    opacity: new Animated.Value(0.5),
    scaleX: new Animated.Value(1),
    scaleY: new Animated.Value(1),
    rotate: new Animated.Value(0),
  }))).current;

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

  useEffect(() => {
    const t = setTimeout(() => vizStart(), 1500);
    return () => { clearTimeout(t); vizStop(); };
  }, []);

  useEffect(() => {
    ringRefs.forEach(ring => {
      ring.scale.setValue(0.5);
      ring.opacity.setValue(0.5);
      ring.scaleX.setValue(1);
      ring.scaleY.setValue(1);
      ring.rotate.setValue(0);
    });
    const loops = ringRefs.map((ring, i) => {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.timing(ring.scale, {
            toValue: RINGS[i].maxScale,
            duration: 2000,
            delay: i * 450,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(ring.opacity, {
            toValue: 0,
            duration: 2000,
            delay: i * 450,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.loop(
            Animated.sequence([
              Animated.timing(ring.scaleX, { toValue: 1.5, duration: 300 + i * 200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(ring.scaleX, { toValue: 0.7, duration: 400 + i * 150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]),
          ),
          Animated.loop(
            Animated.sequence([
              Animated.timing(ring.scaleY, { toValue: 0.6, duration: 400 + i * 200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(ring.scaleY, { toValue: 1.4, duration: 300 + i * 150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]),
          ),
          Animated.loop(
            Animated.timing(ring.rotate, {
              toValue: 1,
              duration: 3000 + i * 800,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
          ),
        ]),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach(l => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.key]);

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

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => h.remove();
  }, [onBack]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TFPressable style={styles.backBtn} focusedStyle={styles.backBtnFocus} onPress={onBack}>
          <Text style={styles.backText}>{'\u25C0'} Vissza</Text>
        </TFPressable>
        <View style={styles.onAirRow}>
          <Animated.View style={[styles.onAirDot, { opacity: pulseAnim, transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.onAirText}>ON AIR</Text>
        </View>
      </View>

      <View style={styles.stationInfo}>
        <View style={styles.ringsWrap}>
          {RINGS.map((r, i) => {
            const spin = ringRefs[i].rotate.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            });
            return (
            <Animated.View
              key={i}
              style={[
                styles.ring,
                {
                  width: r.size,
                  height: r.size,
                  borderRadius: r.size / 2,
                  borderColor: r.color,
                  opacity: ringRefs[i].opacity,
                  transform: [
                    { scale: ringRefs[i].scale },
                    { scaleX: ringRefs[i].scaleX },
                    { scaleY: ringRefs[i].scaleY },
                    { rotate: spin },
                  ],
                },
              ]}
            />
            );
          })}
          {station.logo ? (
            <Image source={{ uri: station.logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Text style={styles.fallbackLogo}>{'\uD83D\uDCFB'}</Text>
          )}
        </View>
        <Text style={styles.stationName}>{station.name}</Text>
        {metadata ? <Text style={styles.metadata} numberOfLines={1}>{metadata}</Text> : null}
      </View>

      <AudioVisualizer animValues={animValues} active={vizActive} />

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
  stationInfo: { alignItems: 'center', marginBottom: 30 },
  ringsWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  logo: { width: 100, height: 100, borderRadius: 8, zIndex: 1, borderWidth: 1, borderColor: '#333' },
  fallbackLogo: { fontSize: 64, marginBottom: 12, zIndex: 1 },
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

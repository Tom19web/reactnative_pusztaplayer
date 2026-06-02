import { useEffect, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing, BackHandler } from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import TFPressable from './TFPressable';
import { COLORS, FONT, SPACING } from '../constants';
import { RadioStation } from '../constants/radioStations';

interface Props {
  station: RadioStation;
  onBack: () => void;
}

export default function RadioPlayer({ station, onBack }: Props) {
  const videoRef = useRef<VideoRef>(null);
  const playingRef = useRef(true);
  const [videoKey, setVideoKey] = useState(0);
  const [metadata, setMetadata] = useState('');
  const [status, setStatus] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const metadataTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAac = station.streamUrl.toLowerCase().endsWith('.aac');
  const sourceType = isAac ? 'aac' : 'other';

  const handleToggle = () => {
    playingRef.current = !playingRef.current;
    setVideoKey(prev => prev + 1);
  };

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
      <Video
        key={videoKey}
        ref={videoRef}
        source={{ uri: station.streamUrl, type: sourceType }}
        style={styles.radioVideo}
        paused={!playingRef.current}
        onLoadStart={() => setStatus('\u23F3 Bet\u00F6l\u00E9s...')}
        onLoad={(d: any) => setStatus('\u2705 Lej\u00E1tsz\u00E1s')}
        onError={(e: any) => { const err = e?.error || e || {}; setStatus('\u274C ' + (err.errorString || err.message || 'ismeretlen') + ' ' + (err.errorCode || '')); }}
      />

      {/* Status */}
      {__DEV__ && status !== '' && (
        <View style={styles.statusBar} pointerEvents="none">
          <Text style={styles.statusUrl} numberOfLines={1}>{station.streamUrl}</Text>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      {/* Header */}
      <TFPressable style={styles.backBtn} focusedStyle={styles.backBtnFocus} onPress={onBack}>
        <Text style={styles.backBtnText}>{'\u2190'} Vissza</Text>
      </TFPressable>

      {/* Center content */}
      <View style={styles.center}>
        {/* ON AIR badge */}
        <View style={styles.onAirRow}>
          <Animated.View style={[styles.onAirDot, { opacity: pulseAnim }]} />
          <Text style={styles.onAirText}>ON AIR</Text>
        </View>

        {/* Logo */}
        <View style={styles.logoWrap}>
          <Image source={{ uri: station.logo }} style={styles.logo} resizeMode="contain" />
        </View>

        {/* Station name */}
        <Text style={styles.stationName}>{station.name}</Text>

        {/* Metadata / Now playing */}
        {metadata !== '' && (
          <Text style={styles.metadata} numberOfLines={2}>{'\u266B'} {metadata}</Text>
        )}

        {/* Play/Stop */}
        <TFPressable style={styles.playBtn} focusedStyle={styles.playBtnFocus} onPress={handleToggle} hasTVPreferredFocus>
          <Text style={styles.playBtnText}>{playingRef.current ? '\u25A0' : '\u25B6'}</Text>
        </TFPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  radioVideo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  statusBar: { position: 'absolute', top: 4, left: 4, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '80%' },
  statusUrl: { color: '#ff0', fontSize: 9, fontFamily: 'monospace' },
  statusText: { color: '#0f0', fontSize: 10, fontFamily: 'monospace' },
  backBtn: {
    position: 'absolute', top: SPACING.lg, left: SPACING.lg, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
  },
  backBtnFocus: { backgroundColor: COLORS.yellow },
  backBtnText: { color: COLORS.white, fontSize: FONT.sm, fontFamily: 'Poppins-Bold' },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xl, gap: SPACING.md,
  },
  onAirRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: SPACING.md,
  },
  onAirDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.red,
  },
  onAirText: {
    color: COLORS.red, fontSize: 18, fontFamily: 'Bangers-Regular',
    letterSpacing: 4,
  },
  logoWrap: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: COLORS.panel,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,204,0,0.3)',
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  logo: { width: 100, height: 100 },
  stationName: {
    color: COLORS.yellow, fontSize: FONT.xl,
    fontFamily: 'Bangers-Regular', letterSpacing: 2,
    textAlign: 'center',
  },
  metadata: {
    color: COLORS.muted, fontSize: FONT.sm, fontFamily: 'Poppins-Regular',
    textAlign: 'center', fontStyle: 'italic', marginTop: SPACING.lg,
  },
  playBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.yellow,
    alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  playBtnFocus: {
    backgroundColor: COLORS.cyan,
    transform: [{ scale: 1.1 }],
  },
  playBtnText: {
    color: COLORS.black, fontSize: 24,
  },
});

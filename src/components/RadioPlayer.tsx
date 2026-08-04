import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing, BackHandler, Dimensions, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import TFPressable from './TFPressable';
import RuggedBorder from './RuggedBorder';
import SoundEffect from './SoundEffect';
import DotPattern from './DotPattern';
import AudioVisualizer from './AudioVisualizer';
import { useBackgroundAudio } from '../store/AppContext';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';
import { COLORS, FONT, SPACING } from '../constants';
import { RadioStation } from '../constants/radioStations';

const { width: SW } = Dimensions.get('window');

interface Props {
  station: RadioStation;
  onBack: () => void;
  isFav?: boolean;
  onToggleFav?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  recommendations?: RadioStation[];
  favStations?: RadioStation[];
  onSelectStation?: (s: RadioStation) => void;
}

function StationCard({ station, onSelect }: { station: RadioStation; onSelect: (s: RadioStation) => void }) {
  return (
    <TFPressable style={styles.stationCard} focusedStyle={styles.stationCardFocus} onPress={() => onSelect(station)}>
      {station.logo ? (
        <Image source={{ uri: station.logo }} style={styles.stationLogo} resizeMode="contain" />
      ) : (
        <Text style={styles.stationFallback}>{'\uD83D\uDCFB'}</Text>
      )}
      <Text style={styles.stationName} numberOfLines={1}>{station.name}</Text>
    </TFPressable>
  );
}

export default function RadioPlayer({ station, onBack, isFav, onToggleFav, onPrev, onNext, recommendations, favStations, onSelectStation }: Props) {
  const { audio, isPlaying, start, stop } = useBackgroundAudio();
  const { active: vizActive, start: vizStart, stop: vizStop, animValues } = useAudioVisualizer();
  const [metadata, setMetadata] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const metadataTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [soundKey, setSoundKey] = useState(0);

  const isAac = station.streamUrl.toLowerCase().endsWith('.aac');
  const isThisStationPlaying = isPlaying && audio?.streamUrl === station.streamUrl;

  const sounds = ['ZENE!', '\uD83D\uDCA5 BOOM!', '\uD83C\uDFB5 WOW!', '\uD83D\uDD0A R\u00C1DI\u00D3!', '\uD83C\uDFA7 JEE!'];

  const handleToggle = useCallback(() => {
    if (isThisStationPlaying) {
      stop();
      vizStop();
    } else {
      setStreamError(false);
      start({ stationName: station.name, stationLogo: station.logo, streamUrl: station.streamUrl, streamType: isAac ? 'aac' : '' });
      vizStart();
      setSoundKey(k => k + 1);
    }
  }, [isThisStationPlaying, stop, vizStop, start, vizStart, station, isAac]);

  useEffect(() => {
    setStreamError(false);
    setMetadata(null);
    titleAnim.setValue(0);
    if (metadataTimer.current) { clearInterval(metadataTimer.current); metadataTimer.current = null; }
    start({ stationName: station.name, stationLogo: station.logo, streamUrl: station.streamUrl, streamType: isAac ? 'aac' : '' });
    vizStart();
  }, [station.key]);

  useEffect(() => {
    if (!isThisStationPlaying) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, isThisStationPlaying]);

  useEffect(() => {
    if (!isThisStationPlaying && audio?.streamUrl === station.streamUrl) {
      const id = setTimeout(() => { if (!isPlaying) setStreamError(true); }, 3000);
      return () => clearTimeout(id);
    }
  }, [isThisStationPlaying, isPlaying, audio?.streamUrl, station.streamUrl]);

  useEffect(() => {
    if (metadataTimer.current) clearInterval(metadataTimer.current);
    const fetchMeta = async () => {
      let title = '';
      try {
        const icyRes = await fetch(
          `https://live.pusztaplay.eu/api/v1/radio/metadata?stream_url=${encodeURIComponent(station.streamUrl)}`,
          { headers: { 'User-Agent': 'PusztaPlayer v1.0' } },
        );
        if (icyRes.ok) {
          const icyData = await icyRes.json();
          title = icyData.title || '';
        }
      } catch {}
      setMetadata(title || null);
      if (title) {
        titleAnim.setValue(0);
        Animated.timing(titleAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
    };
    fetchMeta();
    metadataTimer.current = setInterval(fetchMeta, 30000);
    return () => { if (metadataTimer.current) { clearInterval(metadataTimer.current); metadataTimer.current = null; } };
  }, [station.streamUrl, titleAnim]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      stop(); vizStop(); onBack();
      return true;
    });
    return () => h.remove();
  }, [onBack, stop, vizStop]);

  const handleRetry = useCallback(() => {
    setStreamError(false); stop(); vizStop();
    setTimeout(() => {
      start({ stationName: station.name, stationLogo: station.logo, streamUrl: station.streamUrl, streamType: isAac ? 'aac' : '' });
      vizStart();
    }, 500);
  }, [stop, vizStop, start, vizStart, station, isAac]);

  const recs = (recommendations || []).map(r => ({ ...r, votes: r.votes || 0 })).sort((a, b) => b.votes - a.votes).slice(0, 5);
  const favs = favStations || [];

  return (
    <View style={styles.wrapper}>
      <LinearGradient colors={['#06060c', '#0a0a12', '#08080e']} style={styles.bg} />

      <View style={styles.topBar}>
        <Text style={styles.topIcon}>📻</Text>
        <Text style={styles.topTitle}>RÁDIÓ</Text>
        <View style={styles.spacer} />
        <View style={styles.onAirRow}>
          <Animated.View style={[styles.onAirDot, { opacity: pulseAnim, transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.onAirText}>ON AIR</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Radio card */}
        <View style={styles.cardWrap}>
          <RuggedBorder color={COLORS.cyan} wobbleFactor={0.6}>
            <LinearGradient colors={['#0e0e18', '#09090f']} style={styles.cardInner}>
              <DotPattern dotColor={COLORS.cyan} dotOpacity={0.05} spacing={8} dotRadius={1.5} />

              <View style={styles.headerRow}>
                <View style={styles.logoOuter}>
                  <Animated.View style={[styles.logoGlow, { opacity: Animated.multiply(pulseAnim, 0.5), transform: [{ scale: Animated.add(0.9, Animated.multiply(pulseAnim, 0.1)) }] }]} />
                  {station.logo ? (
                    <Image source={{ uri: station.logo }} style={styles.logo} resizeMode="contain" />
                  ) : (
                    <Text style={styles.fallbackLogo}>{'\uD83D\uDCFB'}</Text>
                  )}
                </View>
                <View style={styles.headerInfo}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{station.name}</Text>
                  <View style={styles.headerSubRow}>
                    {isThisStationPlaying && (
                      <Animated.View style={[styles.liveBadge, { opacity: pulseAnim }]}>
                        <Text style={styles.liveBadgeText}>▶ ÉLŐ</Text>
                      </Animated.View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.controls}>
                <TFPressable style={styles.sideBtn} focusedStyle={styles.sideBtnFocus} onPress={onPrev} disabled={!onPrev}>
                  <Text style={[styles.sideIcon, !onPrev && { opacity: 0.3 }]}>{'\u23EE'}</Text>
                </TFPressable>
                <TFPressable style={styles.playBtn} focusedStyle={styles.playBtnFocus} onPress={handleToggle}>
                  <Text style={styles.playIcon}>{isThisStationPlaying ? '\u23F8' : '\u25B6'}</Text>
                </TFPressable>
                <TFPressable style={styles.sideBtn} focusedStyle={styles.sideBtnFocus} onPress={onNext} disabled={!onNext}>
                  <Text style={[styles.sideIcon, !onNext && { opacity: 0.3 }]}>{'\u23ED'}</Text>
                </TFPressable>
                {onToggleFav && (
                  <TFPressable style={styles.favBtn} focusedStyle={styles.favBtnFocus} onPress={onToggleFav}>
                    <Text style={styles.favText}>{isFav ? '\u2764\uFE0F' : '\u2661'}</Text>
                  </TFPressable>
                )}
              </View>

              <View style={styles.metaRow}>
                {metadata ? (
                  <Animated.Text style={[styles.metadata, { opacity: titleAnim }]} numberOfLines={2}>
                    {'\uD83C\uDFB5'} {metadata}
                  </Animated.Text>
                ) : streamError ? (
                  <Text style={styles.errorText}>Stream nem elérhető</Text>
                ) : isThisStationPlaying ? (
                  <Text style={styles.metaPlaceholder}>Hallgatás...</Text>
                ) : (
                  <Text style={styles.metaPlaceholder}>Indítsd el a lejátszást</Text>
                )}
              </View>

              {streamError && (
                <View style={styles.errorRow}>
                  <TFPressable style={styles.retryBtn} focusedStyle={styles.retryBtnFocus} onPress={handleRetry}>
                    <Text style={styles.retryBtnText}>Újra</Text>
                  </TFPressable>
                </View>
              )}

              <View style={styles.vizWrap}>
                <AudioVisualizer animValues={animValues} active={vizActive} />
              </View>
            </LinearGradient>
          </RuggedBorder>
        </View>

        {/* Two columns: recommended | favorites */}
        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.colTitle}>{'\u2B50'} Ajánlott</Text>
            <ScrollView style={styles.colScroll} showsVerticalScrollIndicator={false}>
              {recs.map(s => (
                <StationCard key={s.key} station={s} onSelect={onSelectStation!} />
              ))}
              {recs.length === 0 && <Text style={styles.colEmpty}>—</Text>}
            </ScrollView>
          </View>
          <View style={styles.column}>
            <Text style={styles.colTitle}>{'\u2764\uFE0F'} Kedvencek</Text>
            <ScrollView style={styles.colScroll} showsVerticalScrollIndicator={false}>
              {favs.map(s => (
                <StationCard key={s.key} station={s} onSelect={onSelectStation!} />
              ))}
              {favs.length === 0 && <Text style={styles.colEmpty}>Nincs kedvenc rádió</Text>}
            </ScrollView>
          </View>
        </View>
      </View>

      <SoundEffect key={`s1-${soundKey}`} text={sounds[soundKey % sounds.length]} textColor={COLORS.yellow} bgColor={COLORS.red} top={20} left={300} rotate={-8} fontSize={22} />
      <SoundEffect key={`s2-${soundKey}`} text="BOOM!" textColor={COLORS.white} bgColor={COLORS.cyan} top={60} right={30} rotate={12} fontSize={18} />
      <SoundEffect key={`s3-${soundKey}`} text="★" textColor="#000" bgColor={COLORS.yellow} bottom={80} left={50} rotate={-15} fontSize={32} />
      <SoundEffect key={`s4-${soundKey}`} text="POP!" textColor={COLORS.red} bgColor={COLORS.yellow} bottom={30} right={80} rotate={8} fontSize={20} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xs,
  },
  topIcon: { fontSize: 18, marginRight: 8 },
  topTitle: {
    color: COLORS.cyan, fontSize: 17, fontFamily: 'Bangers-Regular', letterSpacing: 2,
  },
  spacer: { flex: 1 },
  onAirRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onAirDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  onAirText: { color: COLORS.red, fontSize: 10, fontWeight: '900', letterSpacing: 3, fontFamily: 'Courier New' },
  // Card
  cardWrap: { alignItems: 'center', marginBottom: 12 },
  cardInner: {
    position: 'relative', borderRadius: 16,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    alignItems: 'center', overflow: 'hidden', width: Math.min(SW * 0.7, 420),
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    marginBottom: SPACING.sm, width: '100%',
  },
  logoOuter: { position: 'relative', width: 70, height: 70, flexShrink: 0, marginLeft: 24 },
  logoGlow: { position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 40, backgroundColor: COLORS.cyan },
  logo: { width: 70, height: 70, borderRadius: 12 },
  fallbackLogo: { fontSize: 48, textAlign: 'center' },
  headerInfo: { flex: 1, justifyContent: 'center', minHeight: 80, alignItems: 'flex-end', marginRight: 24 },
  headerSubRow: { marginTop: 6, gap: 4 },
  cardTitle: { color: COLORS.white, fontSize: 20, fontFamily: 'Bangers-Regular', textAlign: 'right', letterSpacing: 1 },
  liveBadge: { paddingHorizontal: 8, paddingVertical: 2, backgroundColor: COLORS.red, borderRadius: 6, alignSelf: 'flex-end' },
  liveBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '900', fontFamily: 'Courier New', letterSpacing: 2 },
  // Controls
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: SPACING.xs },
  sideBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  sideBtnFocus: { borderColor: COLORS.yellow, backgroundColor: '#222244' },
  sideIcon: { color: COLORS.text, fontSize: 12 },
  playBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.cyan, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
  playBtnFocus: { borderColor: COLORS.yellow, borderWidth: 2, backgroundColor: COLORS.yellow },
  playIcon: { color: '#000', fontSize: 14 },
  favBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  favBtnFocus: { borderColor: COLORS.yellow, backgroundColor: '#222244' },
  favText: { fontSize: 15 },
  // Meta
  metaRow: { minHeight: 28, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs },
  metadata: { color: COLORS.cyan, fontSize: 11, fontFamily: 'Courier New', letterSpacing: 1, textAlign: 'center' },
  metaPlaceholder: { color: COLORS.muted, fontSize: 10, textAlign: 'center' },
  errorText: { color: COLORS.red, fontSize: 10, textAlign: 'center' },
  errorRow: { alignItems: 'center', marginBottom: SPACING.xs },
  retryBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.red, borderWidth: 1, borderColor: '#000' },
  retryBtnFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.cyan },
  retryBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  vizWrap: { width: '100%', height: 48, marginTop: SPACING.xs },
  // Content area
  content: { flex: 1, paddingTop: 12 },
  // Two columns
  columns: { flex: 1, flexDirection: 'row', paddingHorizontal: SPACING.sm, gap: 24 },
  column: { flex: 1, paddingHorizontal: 8 },
  colTitle: { color: COLORS.yellow, fontSize: 13, fontFamily: 'Bangers-Regular', letterSpacing: 1, marginBottom: SPACING.xs, textAlign: 'center' },
  colScroll: { flex: 1 },
  colEmpty: { color: COLORS.muted, fontSize: 10, textAlign: 'center', marginTop: 20 },
  stationCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: SPACING.xs, borderRadius: 10, backgroundColor: '#0e0e18', borderWidth: 1, borderColor: '#1a1a2e', marginBottom: SPACING.xs, marginHorizontal: 6 },
  stationCardFocus: { borderColor: COLORS.yellow, backgroundColor: '#15152a' },
  stationLogo: { width: 28, height: 28, borderRadius: 6 },
  stationFallback: { fontSize: 20 },
  stationName: { color: COLORS.text, fontSize: 10, flex: 1, fontFamily: 'Courier New' },
});

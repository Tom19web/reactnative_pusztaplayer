import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Animated, Platform, Dimensions } from 'react-native';
import Video from 'react-native-video';
import TFPressable from './TFPressable';
import RuggedBorder from './RuggedBorder';
import SoundEffect from './SoundEffect';
import { Channel, EpgEntry } from '../types';
import { fetchShortEpg, fetchEnrichedEpg, EpgEnrichedData } from '../services/epgService';
import { loadXtreamCredentials } from '../services/storage';
import { COLORS, FONT, SPACING, SIZES } from '../constants';

interface LiveDetailPanelProps {
  channel: Channel;
  onPlay?: () => void;
  onClose?: () => void;
  isFav?: boolean;
  onToggleFav?: () => void;
  selectedQualityIdx?: number;
  onQualityChange?: (idx: number) => void;
}

let isTouch = true;
try { isTouch = !Platform.isTV; } catch {}
const screenH = Dimensions.get('window').height;

export default function LiveDetailPanel({ channel, onPlay, onClose, isFav, onToggleFav, selectedQualityIdx = 0, onQualityChange }: LiveDetailPanelProps) {
  const [epg, setEpg] = useState<EpgEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriched, setEnriched] = useState<EpgEnrichedData | null>(null);
  const playBtnRef = useRef<View>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const creds = await loadXtreamCredentials();
      if (!creds || !channel.streamId) { setLoading(false); return; }
      const rows = await fetchShortEpg(creds, channel.streamId, 2);
      if (!c) { setEpg(rows); setLoading(false); }
      if (channel.streamId) {
        const enrichedData = await fetchEnrichedEpg(channel.streamId);
        if (!c && enrichedData) setEnriched(enrichedData);
      }
    })();
    return () => { c = true; };
  }, [channel.streamId]);

  useEffect(() => {
    const t = setTimeout(() => playBtnRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const entryAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entryAnim, { toValue: 1, speed: 20, bounciness: 4, useNativeDriver: true }).start();
  }, [entryAnim]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => onClose?.());
  }, [onClose, slideAnim]);

  const handleTrapFocus = useCallback(() => {
    playBtnRef.current?.focus();
  }, []);

  return (
    <View style={styles.panelRoot} focusable={false}>
      <View style={styles.bgOverlay} />
      <View style={styles.panelWrap}>
        <RuggedBorder color={COLORS.yellow}>
          <Animated.View style={[styles.container, { opacity: entryAnim, transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) }, { scale: entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
          {onClose && (
            <TFPressable style={styles.closeBtn} focusedStyle={styles.closeBtnFocus} onPress={handleClose} hasTVPreferredFocus>
              <Text style={styles.closeBtnText}>{'\u2716'}</Text>
            </TFPressable>
          )}

          <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled>
            <View style={styles.fence} focusable={true} onFocus={handleTrapFocus} />
            <View style={styles.header}>
              {channel.streamUrl ? (
                <View style={styles.logoWrap}>
                  <Video
                    source={{ uri: channel.streamUrl, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36' } }}
                    style={styles.logo}
                    resizeMode="cover"
                    muted={true}
                    paused={false}
                    repeat={true}
                    playInBackground={false}
                    preventsDisplaySleepDuringVideoPlayback={false}
                  />
                </View>
              ) : channel.logo ? (
                <View style={styles.logoWrap}>
                  <Image source={{ uri: channel.logo }} style={styles.logo} resizeMode="contain" />
                </View>
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoPlaceholderText}>{'\uD83D\uDCFA'}</Text>
                </View>
              )}
              <View style={styles.headerInfo}>
                <Text style={styles.title} numberOfLines={2}>{channel.title}</Text>
                <Text style={styles.group}>{channel.group}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.epgSection}>
              <Text style={styles.epgHeader}>{'\uD83D\uDCE1'} Műsorújság</Text>
              {loading ? (
                <Text style={styles.loading}>{'\u23F3'} Műsorújság betöltése...</Text>
              ) : epg.length === 0 ? (
                <Text style={styles.noEpg}>Nincs EPG adat ehhez a csatornához.</Text>
              ) : (
                epg.slice(0, 2).map((entry, i) => {
                  const ai = enriched?.programs?.[i];
                  return (
                  <View key={i} style={[styles.epgRow, i === 0 && styles.epgRowNow]}>
                    <View style={styles.epgTimeRow}>
                      <Text style={styles.epgTime}>{entry.time}{entry.endTime ? ` \u2013 ${entry.endTime}` : ''}</Text>
                      {i === 0 && <Text style={styles.epgNowBadge}>MOST</Text>}
                    </View>
                    <Text style={styles.epgTitle} numberOfLines={1}>{entry.title}</Text>
                    {ai?.genres && ai.genres.length > 0 && (
                      <View style={styles.genreRow}>
                        {ai.genres.map((g, gi) => (
                          <View key={gi} style={styles.genreBadge}><Text style={styles.genreBadgeText}>{g}</Text></View>
                        ))}
                      </View>
                    )}
                    {ai?.cast && ai.cast.length > 0 && (
                      <Text style={styles.aiCast} numberOfLines={1}>{'\uD83C\uDFAD ' + ai.cast.join(', ')}</Text>
                    )}
                    {ai?.pow_synopsis ? (
                      <Text style={styles.aiPow} numberOfLines={3}>{'POW! ' + ai.pow_synopsis}</Text>
                    ) : entry.description ? (
                      <Text style={styles.epgDesc} numberOfLines={5}>{entry.description}</Text>
                    ) : null}
                  </View>
                  );
                })
              )}
            </View>

            <View style={styles.buttons}>
              {onPlay && (
                <TFPressable ref={playBtnRef} hasTVPreferredFocus style={styles.btnPlay} focusedStyle={styles.btnPlayFocus} onPress={onPlay}>
                  <Text style={styles.btnPlayText}>{'\u25B6'} Lejátszás</Text>
                </TFPressable>
              )}
              {channel.qualityVariants && channel.qualityVariants.length > 1 && (
                    <View style={styles.qualityRow}>
                  {channel.qualityVariants.map((qv, i) => (
                    <TFPressable
                      key={qv.label}
                      style={[styles.qualityBtn, i === selectedQualityIdx && styles.qualityBtnActive]}
                      focusedStyle={styles.qualityBtnFocused}
                      onPress={() => onQualityChange?.(i)}
                      accessibilityLabel={`${qv.label} minőség`}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.qualityBtnText, i === selectedQualityIdx && styles.qualityBtnTextActive]}>{qv.label}</Text>
                    </TFPressable>
                  ))}
                </View>
              )}
              {onToggleFav && (
                <TFPressable
                  style={[styles.btnFav, isFav && styles.btnFavActive]}
                  focusedStyle={styles.btnFavFocus}
                  onPress={onToggleFav}
                >
                  <Text style={styles.btnFavText}>{isFav ? '\u2764\uFE0F' : '\uD83E\uDD0D'} Kedvencekhez</Text>
                </TFPressable>
              )}
            </View>
            <View style={styles.fence} focusable={true} onFocus={handleTrapFocus} />
          </ScrollView>
        </Animated.View>
        </RuggedBorder>
        <SoundEffect text="LIVE!" textColor={COLORS.white} bgColor={COLORS.red} top={-14} left={-6} rotate={-15} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panelRoot: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  },
  fence: { height: 10, width: '100%', opacity: 0.01 },
  bgOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panelWrap: {
    position: 'absolute',
    top: isTouch ? 0 : 0,
    right: isTouch ? 0 : 24,
    left: isTouch ? 0 : undefined,
    bottom: isTouch ? 0 : undefined,
    alignItems: isTouch ? 'center' : undefined,
    justifyContent: isTouch ? 'center' : undefined,
  },
  container: {
    width: isTouch ? '100%' : 300,
    maxHeight: isTouch ? screenH * 0.85 : 600,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderRadius: isTouch ? 12 : 0,
    padding: 10,
  },
  scroll: { gap: 0, paddingBottom: isTouch ? 40 : 0 },
  closeBtn: {
    position: 'absolute', top: 10, right: 12, zIndex: 10,
    width: 20, height: 20, borderRadius: 4,
    backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnFocus: { backgroundColor: COLORS.yellow, transform: [{ scale: 1.15 }] },
  closeBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  header: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  logoWrap: {
    width: 90, aspectRatio: 16 / 9, borderRadius: 6,
    overflow: 'hidden', backgroundColor: '#0d3b4a',
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: '95%', height: '95%' },
  logoPlaceholder: { width: 90, aspectRatio: 16 / 9, borderRadius: 6, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoPlaceholderText: { fontSize: 20 },
  headerInfo: { flex: 1 },
  title: {
    fontSize: 14, color: COLORS.yellow,
    fontFamily: 'Bangers-Regular', letterSpacing: 1,
  },
  group: { fontSize: 8, color: COLORS.muted, marginTop: 4, fontFamily: 'Poppins-Regular' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  epgSection: { gap: 4, marginTop: 10 },
  epgHeader: { fontSize: 10, color: COLORS.text, fontWeight: '700' },
  loading: { color: COLORS.muted, fontSize: 10 },
  noEpg: { color: COLORS.muted, fontSize: 10, textAlign: 'center' },
  epgRow: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8, padding: 10, gap: 0,
  },
  epgRowNow: {
    backgroundColor: 'rgba(255,204,0,0.1)',
    borderLeftWidth: 3, borderLeftColor: COLORS.yellow,
  },
  epgTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  epgTime: { fontSize: 9, color: COLORS.muted },
  epgNowBadge: {
    fontSize: 9, fontWeight: '700', color: COLORS.black,
    backgroundColor: COLORS.yellow, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  epgTitle: { fontSize: 10, color: COLORS.text, fontWeight: '600' },
  epgDesc: { fontSize: 9, color: COLORS.muted, lineHeight: 13 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  genreBadge: {
    backgroundColor: COLORS.cyan,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderWidth: 1, borderColor: '#000',
  },
  genreBadgeText: { color: COLORS.black, fontSize: 8, fontFamily: '007Toontime' },
  aiCast: { color: COLORS.white, fontSize: 8, fontFamily: '007Toontime', marginTop: 4 },
  aiPow: { color: '#ffcc00', fontSize: 9, fontFamily: '007Toontime', marginTop: 4, fontStyle: 'italic', lineHeight: 13 },
  buttons: { flexDirection: 'column', gap: 4, marginTop: 8 },
  qualityRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  qualityBtn: {
    backgroundColor: COLORS.panel2, borderRadius: 6,
    paddingVertical: 4, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'transparent',
  },
  qualityBtnActive: { borderColor: COLORS.yellow, backgroundColor: 'rgba(255,204,0,0.15)' },
  qualityBtnFocused: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel },
  qualityBtnText: { color: COLORS.muted, fontSize: 9, fontWeight: '700', fontFamily: 'Poppins-Bold' },
  qualityBtnTextActive: { color: COLORS.yellow },
  btnPlay: {
    backgroundColor: COLORS.yellow, borderRadius: 10,
    paddingTop: 8, paddingBottom: 8, alignItems: 'center',
    borderWidth: 2, borderColor: '#000',
  },
  btnPlayFocus: { backgroundColor: COLORS.cyan },
  btnPlayText: { color: COLORS.black, fontSize: 10, fontWeight: '700', fontFamily: 'Poppins-Bold' },
  btnFav: {
    backgroundColor: COLORS.panel2, borderRadius: 10,
    paddingTop: 6, paddingBottom: 4, alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  btnFavActive: { borderColor: COLORS.red },
  btnFavFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel },
  btnFavText: { color: COLORS.text, fontSize: 10, fontWeight: '600', fontFamily: 'Poppins-Regular' },
});

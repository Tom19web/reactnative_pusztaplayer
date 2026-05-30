import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Animated } from 'react-native';
import TFPressable from './TFPressable';
import { Channel, EpgEntry } from '../types';
import { fetchShortEpg } from '../services/epgService';
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

export default function LiveDetailPanel({ channel, onPlay, onClose, isFav, onToggleFav, selectedQualityIdx = 0, onQualityChange }: LiveDetailPanelProps) {
  const [epg, setEpg] = useState<EpgEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const playBtnRef = useRef<View>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const creds = await loadXtreamCredentials();
      if (!creds || !channel.streamId) { setLoading(false); return; }
      const rows = await fetchShortEpg(creds, channel.streamId, 2);
      if (!c) { setEpg(rows); setLoading(false); }
    })();
    return () => { c = true; };
  }, [channel.streamId]);

  useEffect(() => {
    const t = setTimeout(() => playBtnRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => onClose?.());
  }, [onClose, slideAnim]);

  const handleTrapFocus = useCallback(() => {
    playBtnRef.current?.focus();
  }, []);

  return (
    <>
      <View style={styles.focusOverlay} focusable={true} onFocus={handleTrapFocus} />
      <View style={styles.bgOverlay} />
      <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) }] }]}>
      {/* Close */}
      {onClose && (
        <TFPressable style={styles.closeBtn} focusedStyle={styles.closeBtnFocus} onPress={handleClose}>
          <Text style={styles.closeBtnText}>{'\u2716'}</Text>
        </TFPressable>
      )}

      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled>

        {/* Logo + header */}
        <View style={styles.header}>
          {channel.logo ? (
            <View style={styles.logoWrap}>
              <Image source={{ uri: channel.logo }} style={styles.logo} resizeMode="contain" />
            </View>
          ) : (
            <View style={[styles.logoWrap, styles.logoPlaceholder]}>
              <Text style={styles.logoPlaceholderText}>{'\uD83D\uDCFA'}</Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.title} numberOfLines={2}>{channel.title}</Text>
            <Text style={styles.group}>{channel.group}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* EPG */}
        <View style={styles.epgSection}>
          <Text style={styles.epgHeader}>{'\uD83D\uDCE1'} Műsorújság</Text>
          {loading ? (
            <Text style={styles.loading}>{'\u23F3'} Műsorújság betöltése...</Text>
          ) : epg.length === 0 ? (
            <Text style={styles.noEpg}>Nincs EPG adat ehhez a csatornához.</Text>
          ) : (
            epg.slice(0, 2).map((entry, i) => (
              <View key={i} style={[styles.epgRow, i === 0 && styles.epgRowNow]}>
                <View style={styles.epgTimeRow}>
                  <Text style={styles.epgTime}>{entry.time}{entry.endTime ? ` \u2013 ${entry.endTime}` : ''}</Text>
                  {i === 0 && <Text style={styles.epgNowBadge}>MOST</Text>}
                </View>
                <Text style={styles.epgTitle} numberOfLines={1}>{entry.title}</Text>
                {entry.description ? <Text style={styles.epgDesc} numberOfLines={5}>{entry.description}</Text> : null}
              </View>
            ))
          )}
        </View>

        {/* Buttons */}
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
      </ScrollView>
    </Animated.View>
    <View style={styles.focusOverlay} focusable={true} onFocus={handleTrapFocus} />
    </>
  );
}

const styles = StyleSheet.create({
  focusOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 48,
  },
  bgOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 49,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    position: 'absolute', top: 20, right: 24, zIndex: 50,
    width: 300, maxHeight: 600,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderRadius: 10, padding: 10,
  },
  scroll: { gap: 0 },
  closeBtn: {
    position: 'absolute', top: 10, right: 12, zIndex: 10,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnFocus: { backgroundColor: COLORS.yellow, transform: [{ scale: 1.1 }] },
  closeBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  header: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  logoWrap: {
    width: 90, aspectRatio: 16 / 9, borderRadius: 6,
    overflow: 'hidden', backgroundColor: '#0d3b4a',
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: '95%', height: '95%' },
  logoPlaceholder: { backgroundColor: '#1a1a1a' },
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
  epgTime: { fontSize: 10, color: COLORS.muted },
  epgNowBadge: {
    fontSize: 10, fontWeight: '700', color: COLORS.black,
    backgroundColor: COLORS.yellow, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  epgTitle: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  epgDesc: { fontSize: 10, color: COLORS.muted, lineHeight: 14 },
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

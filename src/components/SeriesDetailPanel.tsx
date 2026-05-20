import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Animated } from 'react-native';
import TFPressable from './TFPressable';
import { xtreamGetSeriesInfo } from '../services/xtreamApi';
import { loadXtreamCredentials } from '../services/storage';
import {  COLORS, FONT, SPACING , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';

interface SeriesDetailPanelProps {
  seriesId?: number;
  title?: string;
  onClose?: () => void;
  onShowEpisodes?: () => void;
  isFav?: boolean;
  onToggleFav?: () => void;
  isWatchLater?: boolean;
  onToggleWatchLater?: () => void;
}

interface SeriesInfo {
  plot: string; cast: string; genre: string; rating: string; director: string; year: string; cover: string; seasonCount: number;
}

export default function SeriesDetailPanel({ seriesId, title, onClose, onShowEpisodes, isFav, onToggleFav, isWatchLater, onToggleWatchLater }: SeriesDetailPanelProps) {
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const epsBtnRef = useRef<View>(null);

  useEffect(() => {
    if (!seriesId) { setLoading(false); return; }
    let c = false;
    (async () => {
      setLoading(true);
      const creds = await loadXtreamCredentials();
      if (!creds) { setLoading(false); return; }
      try {
        const data = await xtreamGetSeriesInfo(creds.username, creds.password, seriesId);
        if (!c) {
          setInfo({
            plot: data.info?.plot || '', cast: data.info?.cast || '',
            genre: data.info?.genre || '', rating: data.info?.rating || '',
            director: data.info?.director || '', year: data.info?.year || data.info?.releaseDate || '',
            cover: data.info?.cover || data.info?.backdrop_path?.[0] || '',
            seasonCount: Object.keys(data.episodes || {}).length,
          });
        }
      } catch { /* silent */ }
      if (!c) setLoading(false);
    })();
    return () => { c = true; };
  }, [seriesId]);

  useEffect(() => {
    const t = setTimeout(() => epsBtnRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => onClose?.());
  }, [onClose, slideAnim]);

  const handleTrapFocus = useCallback(() => {
    epsBtnRef.current?.focus();
  }, []);

  return (
    <>
      <View style={styles.focusOverlay} focusable={true} onFocus={handleTrapFocus} />
      <View style={styles.bgOverlay} />
      <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) }] }]}>
      {onClose && (
        <TFPressable style={styles.closeBtn} focusedStyle={styles.closeBtnFocus} onPress={handleClose}>
          <Text style={styles.closeBtnText}>{'\u2716'}</Text>
        </TFPressable>
      )}

      <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled>
        <Text style={styles.title} numberOfLines={1}>{title || ''}</Text>
        <View style={styles.divider} />

        {loading ? (
          <Text style={styles.loading}>{'\u23F3'} Információk betöltése...</Text>
        ) : info ? (
          <>
            <View style={styles.content}>
              <View style={styles.plotCol}>
                <Text style={styles.plotLabel}>Tartalom:</Text>
                <Text style={styles.plot} numberOfLines={12}>{info.plot || 'Nincs leírás.'}</Text>
              </View>
              <View style={styles.coverCol}>
                {info.cover ? (
                  <Image source={{ uri: info.cover }} style={styles.cover} resizeMode="cover" />
                ) : null}
              </View>
            </View>

            <View style={[styles.divider, { marginBottom: 2 }]} />
            <View style={styles.tagsRow}>
              <View style={styles.tagBox}>
                <Text style={styles.tagText}>{'\uD83C\uDFAD'} {info.genre}</Text>
              </View>
              {info.rating ? (
                <View style={styles.tagBox}>
                  <Text style={styles.tagRating}>{'\u2605'} {info.rating}</Text>
                </View>
              ) : null}
              {info.year ? (
                <View style={styles.tagBox}>
                  <Text style={styles.tagText}>{info.year}</Text>
                </View>
              ) : null}
              {info.seasonCount > 0 ? (
                <View style={styles.tagBox}>
                  <Text style={styles.tagText}>{info.seasonCount} évad</Text>
                </View>
              ) : null}
            </View>
            {info.director ? <Text style={styles.director}>Rendező: {info.director}</Text> : null}
            {info.cast ? <Text style={styles.cast} numberOfLines={3}>Szereplők: {info.cast}</Text> : null}
          </>
        ) : (
          <Text style={styles.loading}>{'\u26A0'} Nem sikerült betölteni az adatokat.</Text>
        )}

        <View style={styles.buttons}>
          {onShowEpisodes && (
            <TFPressable ref={epsBtnRef} hasTVPreferredFocus style={styles.btnEps} focusedStyle={styles.btnEpsFocus} onPress={onShowEpisodes}>
              <Text style={styles.btnEpsText}>{'\uD83D\uDCFA'} Epizódok</Text>
            </TFPressable>
          )}
          {onToggleFav && (
            <TFPressable style={[styles.btnFav, isFav && styles.btnFavActive]} focusedStyle={styles.btnFavFocus} onPress={onToggleFav}>
              <Text style={styles.btnFavText}>{isFav ? '\u2764\uFE0F' : '\uD83E\uDD0D'} Kedvencekhez</Text>
            </TFPressable>
          )}
          {onToggleWatchLater && (
            <TFPressable style={[styles.btnWl, isWatchLater && styles.btnWlActive]} focusedStyle={styles.btnWlFocus} onPress={onToggleWatchLater}>
              <Text style={styles.btnWlText}>{isWatchLater ? '\u23F1\uFE0F' : '\uD83D\uDCCB'} Megnézendő</Text>
            </TFPressable>
          )}
        </View>
      </ScrollView>
    </Animated.View>
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
  title: {
    fontSize: 14, color: COLORS.yellow,
    fontFamily: FONT_FAMILY_BANGERS, letterSpacing: 1, marginBottom: 4,
  },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  loading: { color: COLORS.muted, fontSize: 10, textAlign: 'center' },
  content: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  plotCol: { flex: 1 },
  plotLabel: { fontSize: 9, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  plot: { fontSize: 9, color: COLORS.text, lineHeight: 12 },
  coverCol: {},
  cover: { width: 90, aspectRatio: 2 / 3, borderRadius: 6, marginVertical: 4 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tagBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 9, color: COLORS.text },
  tagRating: { fontSize: 9, color: COLORS.yellow },
  director: { fontSize: 9, color: COLORS.muted, marginTop: 1 },
  cast: { fontSize: 9, color: COLORS.muted, maxHeight: 33, overflow: 'hidden', marginTop: 1 },
  buttons: { flexDirection: 'column', gap: 4, marginTop: 8 },
  btnEps: {
    backgroundColor: COLORS.yellow, borderRadius: 10,
    paddingTop: 8, paddingBottom: 8, alignItems: 'center',
    borderWidth: 2, borderColor: '#000',
  },
  btnEpsFocus: { backgroundColor: COLORS.cyan },
  btnEpsText: { color: COLORS.black, fontSize: 10, fontWeight: '700', fontFamily: FONT_FAMILY_POPPINS_BOLD },
  btnFav: {
    backgroundColor: COLORS.panel2, borderRadius: 10,
    paddingTop: 6, paddingBottom: 4, alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  btnFavActive: { borderColor: COLORS.red },
  btnFavFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel },
  btnFavText: { color: COLORS.text, fontSize: 10, fontWeight: '600', fontFamily: FONT_FAMILY_POPPINS },
  btnWl: {
    backgroundColor: COLORS.panel2, borderRadius: 10,
    paddingTop: 6, paddingBottom: 4, alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  btnWlActive: { borderColor: COLORS.cyan },
  btnWlFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel },
  btnWlText: { color: COLORS.text, fontSize: 10, fontWeight: '600', fontFamily: FONT_FAMILY_POPPINS },
});

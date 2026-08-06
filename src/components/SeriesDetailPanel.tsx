import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Animated, Platform, Dimensions } from 'react-native';
import TFPressable from './TFPressable';
import RuggedBorder from './RuggedBorder';
import SoundEffect from './SoundEffect';
import { xtreamGetSeriesInfo } from '../services/xtreamApi';
import { loadXtreamCredentials } from '../services/storage';
import { COLORS, IS_TOUCH, SCREEN_HEIGHT } from '../constants';
import { fetchSimilar, EmbeddingRecommendation } from '../services/aiProxy';

interface SeriesDetailPanelProps {
  seriesId?: number;
  title?: string;
  onClose?: () => void;
  onShowEpisodes?: () => void;
  isFav?: boolean;
  onToggleFav?: () => void;
  isWatchLater?: boolean;
  onToggleWatchLater?: () => void;
  onOpenSimilar?: (item: { key: string; title: string; type: string; streamId?: number; seriesId?: number }) => void;
  onCastPress?: (name: string) => void;
}

interface SeriesInfo {
  plot: string; cast: string; genre: string; rating: string; director: string; year: string; cover: string; seasonCount: number;
}

export default function SeriesDetailPanel({ seriesId, title, onClose, onShowEpisodes, isFav, onToggleFav, isWatchLater, onToggleWatchLater, onOpenSimilar, onCastPress }: SeriesDetailPanelProps) {
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [similar, setSimilar] = useState<EmbeddingRecommendation[]>([]);
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
      } catch (e) {
        if (__DEV__) console.warn('[SeriesDetailPanel] load failed:', e);
      }
      if (!c) setLoading(false);
    })();
    return () => { c = true; };
  }, [seriesId]);

  useEffect(() => {
    const t = setTimeout(() => epsBtnRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!seriesId || !onOpenSimilar) return;
    let c = false;
    (async () => {
      const items = await fetchSimilar(seriesId, 'series', 5);
      if (!c && items.length > 0) {
        setSimilar(items);
      }
    })();
    return () => { c = true; };
  }, [seriesId, onOpenSimilar]);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const entryAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entryAnim, { toValue: 1, speed: 20, bounciness: 4, useNativeDriver: true }).start();
  }, [entryAnim]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => onClose?.());
  }, [onClose, slideAnim]);

  const handleTrapFocus = useCallback(() => {
    epsBtnRef.current?.focus();
  }, []);

  return (
    <View style={styles.panelRoot} focusable={false}>
      <View style={styles.bgOverlay} />
      <View style={styles.panelWrap}>
        <RuggedBorder color={COLORS.yellow}>
          <Animated.View style={[styles.container, { opacity: entryAnim, transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) }, { scale: entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
            {onClose && (
              <TFPressable focusable={true} style={styles.closeBtn} focusedStyle={styles.closeBtnFocus} onPress={handleClose}>
                <Text style={styles.closeBtnText}>{'\u2716'}</Text>
              </TFPressable>
            )}

          <View focusable={true} style={{ height: 4, width: '100%', position: 'absolute', top: 0, opacity: 0.01 }} onFocus={handleTrapFocus} />
          <View focusable={true} style={{ height: 4, width: '100%', position: 'absolute', bottom: 0, opacity: 0.01 }} onFocus={handleTrapFocus} />
          <View focusable={true} style={{ width: 4, height: '100%', position: 'absolute', left: 0, opacity: 0.01 }} onFocus={handleTrapFocus} />
          <View focusable={true} style={{ width: 4, height: '100%', position: 'absolute', right: 0, opacity: 0.01 }} onFocus={handleTrapFocus} />
          <ScrollView contentContainerStyle={styles.scroll} nestedScrollEnabled>
            <Text style={styles.title} numberOfLines={1}>{title || ''}</Text>
            <View style={styles.divider} />

            {loading ? (
              <Text style={styles.loading}>{'\u23F3'} Információk betöltése...</Text>
            ) : info ? (
              <>
                <View style={styles.content}>
                  <View style={styles.plotCol}>
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
                      <Text style={styles.tagText}>{info.seasonCount} {String.fromCharCode(233)}vad</Text>
                    </View>
                  ) : null}
                </View>
                {info.director ? <Text style={styles.meta}>Rendez{String.fromCharCode(337)}: {info.director}</Text> : null}
                {info.cast ? (
                  <View style={styles.castWrap}>
                    <Text style={styles.meta}>Szerepl{String.fromCharCode(337)}k: </Text>
                    {info.cast.split(',').map((name, i) => {
                      const trimmed = name.trim();
                      if (!trimmed) return null;
                      return (
                        <TFPressable
                          key={`${trimmed}-${i}`}
                          style={styles.castChip}
                          focusedStyle={styles.castChipFocus}
                          onPress={() => { if (typeof onCastPress === 'function') onCastPress(trimmed); }}
                        >
                          <Text style={styles.castChipText}>{trimmed}</Text>
                        </TFPressable>
                      );
                    })}
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.loading}>{'\u26A0'} Nem sikerült betölteni az adatokat.</Text>
            )}

            <View style={styles.buttons}>
              {onShowEpisodes && (
                <View style={{ flex: 1 }}>
                <TFPressable ref={epsBtnRef} hasTVPreferredFocus style={styles.btnEps} focusedStyle={styles.btnEpsFocus} onPress={onShowEpisodes}>
                  <Text style={styles.btnEpsText}>{'\uD83D\uDCFA'} Epiz{String.fromCharCode(243)}dok</Text>
                </TFPressable>
                </View>
              )}
              {onToggleFav && (
                <View style={{ flex: 1 }}>
                <TFPressable style={[styles.btnFav, isFav && styles.btnFavActive]} focusedStyle={styles.btnFavFocus} onPress={onToggleFav}>
                  <Text style={styles.btnFavText}>{isFav ? '\u2764\uFE0F' : '\uD83E\uDD0D'} Kedvencekhez</Text>
                </TFPressable>
                </View>
              )}
              {onToggleWatchLater && (
                <View style={{ flex: 1 }}>
                <TFPressable style={[styles.btnWl, isWatchLater && styles.btnWlActive]} focusedStyle={styles.btnWlFocus} onPress={onToggleWatchLater}>
                  <Text style={styles.btnWlText}>{isWatchLater ? '\u23F1\uFE0F' : '\uD83D\uDCCB'} Megn{String.fromCharCode(233)}zend{String.fromCharCode(337)}</Text>
                </TFPressable>
                </View>
              )}
            </View>

            {similar.length > 0 && (
              <View style={styles.similarSection}>
                <View style={[styles.divider, { marginBottom: 4 }]} />
                <Text style={styles.similarLabel}>Hasonl{String.fromCharCode(243)}k:</Text>
                <View style={styles.similarRow}>
                  {similar.map(s => (
                    <TFPressable
                      key={s.key}
                      style={styles.similarCard}
                      focusedStyle={styles.similarCardFocus}
                      onPress={() => {
                        onOpenSimilar?.({
                          key: s.key,
                          title: s.title,
                          type: s.type,
                          seriesId: parseInt(s.key, 10),
                        });
                      }}
                    >
                      <Text style={styles.similarTitle} numberOfLines={2}>{s.title}</Text>
                      <Text style={styles.similarPct}>{Math.round(s.similarity * 100)}%</Text>
                    </TFPressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
        </RuggedBorder>
        <SoundEffect text="BINGE!" textColor={COLORS.white} bgColor={COLORS.red} top={-15} right={8} rotate={10} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panelRoot: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  },
  fence: { height: 20, width: '100%', opacity: 0.01 },
  bgOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panelWrap: {
    position: 'absolute',
    top: IS_TOUCH ? 0 : 20,
    right: IS_TOUCH ? 0 : 24,
    left: IS_TOUCH ? 0 : undefined,
    bottom: IS_TOUCH ? 0 : undefined,
    alignItems: IS_TOUCH ? 'center' : undefined,
    justifyContent: IS_TOUCH ? 'center' : undefined,
  },
  container: {
    width: IS_TOUCH ? '90%' : 300,
    maxWidth: IS_TOUCH ? 400 : undefined,
    maxHeight: IS_TOUCH ? SCREEN_HEIGHT * 0.85 : 600,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderRadius: IS_TOUCH ? 12 : 0,
    padding: 10,
  },
  scroll: { gap: 0, paddingBottom: IS_TOUCH ? 40 : 0 },
  closeBtn: {
    position: 'absolute', top: 10, right: 12, zIndex: 10,
    width: IS_TOUCH ? 40 : 20, height: IS_TOUCH ? 40 : 20, borderRadius: 4,
    backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnFocus: { backgroundColor: COLORS.yellow, transform: [{ scale: 1.15 }] },
  closeBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  title: {
    fontSize: 14, color: COLORS.yellow,
    fontFamily: 'Bangers-Regular', letterSpacing: 1, marginBottom: 4,
  },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  loading: { color: COLORS.muted, fontSize: 10, textAlign: 'center' },
  content: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  plotCol: { flex: 1 },
  plot: { fontSize: 8, color: COLORS.text, lineHeight: 10 },
  coverCol: {},
  cover: { width: 80, aspectRatio: 2 / 3, borderRadius: 6, marginVertical: 4 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tagBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 8, color: COLORS.text },
  tagRating: { fontSize: 8, color: COLORS.yellow },
  meta: { fontSize: 8, color: COLORS.muted, marginTop: 1 },
  castWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, marginTop: 1 },
  castChip: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
    borderWidth: 1, borderColor: 'transparent',
  },
  castChipFocus: { borderColor: COLORS.yellow, backgroundColor: 'rgba(255,204,0,0.12)' },
  castChipText: { color: COLORS.muted, fontSize: 8 },
  buttons: { flexDirection: 'row', gap: 6, marginTop: 8, width: '100%' },
  btnEps: {
    flex: 1, backgroundColor: COLORS.yellow, borderRadius: 10,
    paddingTop: 8, paddingBottom: 8, alignItems: 'center',
    borderWidth: 2, borderColor: '#000',
  },
  btnEpsFocus: { backgroundColor: COLORS.cyan },
  btnEpsText: { color: COLORS.black, fontSize: 8, fontWeight: '700', fontFamily: 'Poppins-Bold' },
  btnFav: {
    flex: 1, backgroundColor: COLORS.panel2, borderRadius: 10,
    paddingTop: 6, paddingBottom: 4, alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  btnFavActive: { borderColor: COLORS.red },
  btnFavFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel },
  btnFavText: { color: COLORS.text, fontSize: 8, fontWeight: '600', fontFamily: 'Poppins-Regular' },
  btnWl: {
    flex: 1, backgroundColor: COLORS.panel2, borderRadius: 10,
    paddingTop: 6, paddingBottom: 4, alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  btnWlActive: { borderColor: COLORS.cyan },
  btnWlFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel },
  btnWlText: { color: COLORS.text, fontSize: 8, fontWeight: '600', fontFamily: 'Poppins-Regular' },
  similarSection: { marginTop: 8 },
  similarLabel: { fontSize: 10, color: COLORS.yellow, fontFamily: 'Bangers-Regular', letterSpacing: 0.5, marginBottom: 4 },
  similarRow: { flexDirection: 'column', gap: 3 },
  similarCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.panel2, borderRadius: 6, padding: 6,
    borderWidth: 1, borderColor: 'transparent',
  },
  similarCardFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel },
  similarTitle: { fontSize: 8, color: COLORS.text, lineHeight: 10, flex: 1 },
  similarPct: { fontSize: 9, color: COLORS.cyan, fontWeight: '700', minWidth: 32, textAlign: 'right' },
});

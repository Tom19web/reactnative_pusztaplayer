import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, BackHandler, Dimensions, Animated } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';
import TFPressable from '../components/TFPressable';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import { XtreamEpisode, XtreamSeriesInfo } from '../types';
import { xtreamGetSeriesInfo, buildEpisodeUrl } from '../services/xtreamApi';
import { loadXtreamCredentials } from '../services/storage';
import { fetchEpisodePlot, EpisodePlot } from '../services/aiProxy';
import { COLORS, FONT, SPACING } from '../constants';

interface EpisodeScreenProps {
  seriesId: number;
  title: string;
  onPlayEpisode: (episode: { key: string; title: string; streamUrl: string }) => void;
  onBack: () => void;
}

const SCREEN_W = Dimensions.get('window').width;

function HeaderBg() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#060810', '#0c0f20', '#151430']} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="epdots" x="0" y="0" width={10} height={10} patternUnits="userSpaceOnUse">
            <Circle cx={5} cy={5} r={2} fill="#2a2550" opacity={0.35} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#epdots)" />
      </Svg>
    </View>
  );
}

export default function EpisodeScreen({ seriesId, title, onPlayEpisode, onBack }: EpisodeScreenProps) {
  const [seasons, setSeasons] = useState<Record<string, XtreamEpisode[]>>({});
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<XtreamSeriesInfo | null>(null);
  const [epPlots, setEpPlots] = useState<Record<string, EpisodePlot | null>>({});
  const epPlotsRef = useRef(epPlots);
  epPlotsRef.current = epPlots;
  const seasonsRef = useRef(seasons);
  seasonsRef.current = seasons;

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => handler.remove();
  }, [onBack]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const creds = await loadXtreamCredentials();
      if (!creds) { setLoading(false); return; }
      try {
        const data = await xtreamGetSeriesInfo(creds.username, creds.password, seriesId);
        if (!cancelled) {
          setSeriesInfo(data);
          setSeasons(data.episodes || {});
          const keys = Object.keys(data.episodes || {}).sort((a, b) => Number(a) - Number(b));
          if (keys.length > 0) setExpandedSeason(keys[0]);
        }
      } catch (e) {
        if (__DEV__) console.warn('[EpisodeScreen] load failed:', e);
        if (!cancelled) setError('Nem sikerült betölteni az adatokat.');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [seriesId]);

  useEffect(() => {
    const curSeasons = seasonsRef.current;
    const curEpPlots = epPlotsRef.current;
    if (!expandedSeason || !curSeasons[expandedSeason]) return;
    let cancelled = false;
    (async () => {
      const eps = curSeasons[expandedSeason];
      for (const ep of eps) {
        const key = `${seriesId}_${expandedSeason}_${ep.episode_num}`;
        if (curEpPlots[key] !== undefined) continue;
        const plotData = await fetchEpisodePlot(seriesId, parseInt(expandedSeason), ep.episode_num || 0);
        if (!cancelled) setEpPlots(prev => ({ ...prev, [key]: plotData }));
      }
    })();
    return () => { cancelled = true; };
  }, [expandedSeason, seriesId]);

  const info = seriesInfo?.info;
  const seasonKeys = Object.keys(seasons).sort((a, b) => Number(a) - Number(b));
  const cover = info?.cover || info?.backdrop_path?.[0];
  const genre = info?.genre || '';
  const year = (info?.releaseDate || info?.year || '').slice(0, 4);
  const cast = info?.cast || '';
  const rating = info?.rating || '';
  const plot = (info?.plot || '').slice(0, 500);
  const seasonCount = seasonKeys.length;

  return (
    <View style={s.root}>
      <SoundEffect text="BINGE!" textColor={COLORS.yellow} bgColor={COLORS.red} top={-4} right={-12} rotate={12} fontSize={16} />
      <SoundEffect text="NEXT!" textColor={COLORS.red} bgColor={COLORS.yellow} bottom={-10} left={-16} rotate={-10} fontSize={14} />
      <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
        <Animated.View style={{ opacity: fadeAnim }}>
          {loading ? (
            <Text style={s.loading}>{'\u23F3'} Epizódok betöltése...</Text>
          ) : error ? (
            <Text style={s.muted}>{error}</Text>
          ) : !seasonKeys.length ? (
            <Text style={s.muted}>Nincsenek epizódok.</Text>
          ) : (
            <>
              <RuggedBorder color={COLORS.cyan} wobbleFactor={0.7}>
                <View style={s.card}>
                  <HeaderBg />
                  <View style={s.headerRow}>
                    <View style={s.posterWrap}>
                      {cover ? (
                        <Image source={{ uri: cover }} style={s.poster} resizeMode="cover" />
                      ) : (
                        <View style={[s.poster, s.posterPlaceholder]}>
                          <Text style={s.posterPlaceholderText}>🎬</Text>
                        </View>
                      )}
                    </View>
                    <View style={s.headerInfo}>
                      <Text style={s.title} numberOfLines={2}>{title}</Text>
                      <View style={s.tagRow}>
                        {genre ? <View style={s.tag}><Text style={s.tagText}>{'\uD83C\uDFAD'} {genre}</Text></View> : null}
                        {rating ? <View style={s.tag}><Text style={s.tagText}>{'\u2605'} {rating}</Text></View> : null}
                        {year ? <View style={s.tag}><Text style={s.tagText}>{year}</Text></View> : null}
                        {seasonCount > 0 ? <View style={s.tag}><Text style={s.tagText}>{seasonCount} évad</Text></View> : null}
                      </View>
                      {cast ? <Text style={s.cast} numberOfLines={2}>Szereplők: {cast}</Text> : null}
                      {plot ? <Text style={s.plot} numberOfLines={5}>{plot}{info?.plot && info.plot.length >= 500 ? '\u2026' : ''}</Text> : null}
                    </View>
                  </View>
                </View>
              </RuggedBorder>

              {seasonKeys.map(seasonNum => (
                <View key={seasonNum} style={s.seasonBlock}>
                  <TFPressable
                    style={s.seasonHeader}
                    focusedStyle={s.seasonHeaderFocus}
                    onPress={() => setExpandedSeason(expandedSeason === seasonNum ? null : seasonNum)}
                    accessibilityLabel={`${seasonNum}. évad ${expandedSeason === seasonNum ? 'összecsukása' : 'kibontása'}`}
                    accessibilityRole="button"
                  >
                    <Text style={s.seasonTitle}>{expandedSeason === seasonNum ? '\u25BD' : '\u25B6'} {seasonNum}. évad</Text>
                    <Text style={s.epCount}>{seasons[seasonNum].length} epizód</Text>
                  </TFPressable>

                  {expandedSeason === seasonNum && (
                    <View style={s.episodeList}>
                      {seasons[seasonNum].map((ep: XtreamEpisode) => {
                        const ext = ep.container_extension || 'm3u8';
                        const epKey = `ep_${ep.id}`;
                        return (
                          <TFPressable
                            key={ep.id}
                            style={s.epCard}
                            focusedStyle={s.epCardFocus}
                            accessibilityLabel={`${ep.title || `Epizód ${ep.episode_num}`}`}
                            accessibilityRole="button"
                            onPress={() => {
                              loadXtreamCredentials().then(creds => {
                                if (!creds) return;
                                const url = buildEpisodeUrl(creds.username, creds.password, ep.id, ext);
                                onPlayEpisode({ key: epKey, title: ep.title || `Epizód ${ep.episode_num}`, streamUrl: url });
                              });
                            }}
                          >
                            <View style={s.epBadge}>
                              <Text style={s.epBadgeText}>S{seasonNum.padStart(2, '0')}E{String(ep.episode_num ?? 0).padStart(2, '0')}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.epTitle} numberOfLines={2}>{ep.title || `Epizód ${ep.episode_num}`}</Text>
                              {(() => {
                                const pk = `${seriesId}_${seasonNum}_${ep.episode_num}`;
                                const pd = epPlots[pk];
                                return pd?.plot ? <Text style={s.epPlot} numberOfLines={3}>{pd.plot}</Text> : null;
                              })()}
                            </View>
                          </TFPressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingVertical: SPACING.md, paddingHorizontal: 20, paddingBottom: 60 },
  loading: { color: COLORS.muted, fontSize: 12, textAlign: 'center', marginTop: SPACING.lg },
  muted: { color: COLORS.muted, fontSize: 12 },
  // Card
  card: {
    padding: SPACING.md,
    backgroundColor: 'rgba(10,10,20,0.92)',
    borderRadius: 8,
    overflow: 'visible',
    marginBottom: SPACING.lg,
  },
  headerRow: { flexDirection: 'row', gap: SPACING.md },
  posterWrap: { width: 120, height: 180, borderRadius: 10, overflow: 'hidden', backgroundColor: COLORS.bg, borderWidth: 2, borderColor: COLORS.black },
  poster: { width: '100%', height: '100%' },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  posterPlaceholderText: { fontSize: 36 },
  headerInfo: { flex: 1, justifyContent: 'center' },
  title: { color: COLORS.yellow, fontSize: 22, fontFamily: 'Bangers-Regular', letterSpacing: 1, marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  tag: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 8, color: COLORS.text },
  cast: { fontSize: 8, color: COLORS.muted, marginBottom: 4 },
  plot: { fontSize: 9, color: COLORS.text, lineHeight: 13 },
  // Seasons
  seasonBlock: { marginBottom: SPACING.sm },
  seasonHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.panel, padding: SPACING.sm, borderRadius: 4,
    borderWidth: 2, borderColor: 'transparent',
  },
  seasonHeaderFocus: { borderColor: COLORS.yellow },
  seasonTitle: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  epCount: { color: COLORS.muted, fontSize: 12 },
  episodeList: { marginTop: 4, gap: 4 },
  epCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.panel, padding: SPACING.sm, borderRadius: 4,
    borderWidth: 1, borderColor: 'transparent',
  },
  epCardFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel2 },
  epBadge: { backgroundColor: COLORS.panel2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  epBadgeText: { color: COLORS.cyan, fontSize: 9, fontWeight: '700' },
  epTitle: { color: COLORS.text, fontSize: 11, flex: 1 },
  epPlot: { color: COLORS.muted, fontSize: 8, marginTop: 4, lineHeight: 12 },
});

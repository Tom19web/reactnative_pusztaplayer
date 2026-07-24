import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Polygon, G } from 'react-native-svg';
import TFPressable from './TFPressable';
import SoundEffect from './SoundEffect';
import ComicStarburst, { comicStarburstPoints } from './ComicStarburst';
import DotPattern from './DotPattern';
import RuggedBorder from './RuggedBorder';
import { PlayIcon } from '../../assets/icons';
import { HistoryItem, PlaylistData } from '../types';
import { COLORS, FONT, SPACING } from '../constants';
import { fetchShortEpg } from '../services/epgService';
import { xtreamGetVodInfo, xtreamGetSeriesInfo } from '../services/xtreamApi';
import { loadXtreamCredentials } from '../services/storage';
import { useFavorites, useToggleFavorite } from '../store/AppContext';

const INTERVAL = 7000;

interface HomeHeroProps {
  history: HistoryItem[];
  playlist: PlaylistData | null;
  onPlayContent: (key: string) => void;
}

interface SlideExtra {
  epg?: { time: string; endTime?: string; title: string; description?: string }[];
  plot?: string;
  loading?: boolean;
}

function typeLabel(type: string) {
  if (type === 'live') return { icon: '\uD83D\uDCFA', text: 'Live TV' };
  if (type === 'series') return { icon: '\uD83D\uDCFA', text: 'Sorozat' };
  return { icon: '\uD83C\uDFAC', text: 'Film' };
}

function resolveStreamId(item: HistoryItem, playlist: PlaylistData | null): number | null {
  if (!playlist) return null;
  if (item.type === 'live') {
    const ch = playlist.liveChannels?.find(c => c.key === item.key);
    return ch?.streamId ?? null;
  }
  if (item.type === 'movie') {
    const m = playlist.movies?.find(c => c.key === item.key);
    return m?.streamId ?? null;
  }
  if (item.type === 'series') {
    const s = playlist.series?.find(c => c.key === item.key);
    return s?.seriesId ?? null;
  }
  return null;
}

function fmtPos(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function HeroSlideContent({ item, playlist, onPlayContent, isFav, onToggleFav, slideIndex }: { item: HistoryItem; playlist: PlaylistData | null; onPlayContent: (key: string) => void; isFav?: boolean; onToggleFav?: () => void; slideIndex: number }) {
  const [extra, setExtra] = useState<SlideExtra>({ loading: true });

  useEffect(() => {
    let c = false;
    (async () => {
      const creds = await loadXtreamCredentials();
      if (!creds || !playlist) { if (!c) setExtra({ loading: false }); return; }
      if (item.type === 'live') {
        const sid = resolveStreamId(item, playlist);
        if (sid) {
          const rows = await fetchShortEpg(creds, sid, 2);
          if (!c) setExtra({ epg: rows, loading: false });
        } else {
          if (!c) setExtra({ loading: false });
        }
      } else if (item.type === 'movie') {
        const sid = resolveStreamId(item, playlist);
        if (sid) {
          try {
            const data = await xtreamGetVodInfo(creds.username, creds.password, sid);
            if (!c) setExtra({ plot: data.info?.plot || '', loading: false });
          } catch { if (!c) setExtra({ loading: false }); }
        } else { if (!c) setExtra({ loading: false }); }
      } else if (item.type === 'series') {
        const sid = resolveStreamId(item, playlist);
        if (sid) {
          try {
            const data = await xtreamGetSeriesInfo(creds.username, creds.password, sid);
            if (!c) setExtra({ plot: data.info?.plot || '', loading: false });
          } catch { if (!c) setExtra({ loading: false }); }
        } else { if (!c) setExtra({ loading: false }); }
      } else { if (!c) setExtra({ loading: false }); }
    })();
    return () => { c = true; };
  }, [item.key, item.type, playlist]);

  const { icon, text } = typeLabel(item.type);
  const plot = extra.plot ? (extra.plot.length > 350 ? extra.plot.slice(0, 350) + '...' : extra.plot) : '';
  const logoSrc = item.type === 'live' ? item.logo : (
    item.type === 'movie'
      ? playlist?.movies?.find(m => m.key === item.key)?.logo
      : (playlist?.series?.find(s => s.key === item.key)?.logo || item.logo)
  );

  const SFX = [
    { text: 'BANG!', top: -8, right: 90, textColor: '#FFEE00', bgColor: '#FF0044', rotate: -8 },
    { text: 'POW!', top: 6, right: 70, textColor: '#FF0000', bgColor: '#FFEE00', rotate: 6 },
    { text: 'ZAP!', top: -6, right: 100, textColor: '#FFEE00', bgColor: '#39FF14', rotate: -12 },
    { text: 'BOOM!', top: 10, right: 80, textColor: '#00FFFF', bgColor: '#FF6600', rotate: 10 },
    { text: 'WHAM!', top: -14, right: 95, textColor: '#FFEE00', bgColor: '#FF0044', rotate: -4 },
  ];
  const sfx = SFX[slideIndex % SFX.length];

  return (
    <View style={slideStyles.container}>
      <View style={slideStyles.colLeft}>
        <View style={[slideStyles.titleRow, { position: 'relative' }]}>
          <Text style={slideStyles.title} numberOfLines={1}>{item.title}</Text>
          <SoundEffect text={sfx.text} textColor={sfx.textColor} bgColor={sfx.bgColor} top={sfx.top} right={sfx.right} rotate={sfx.rotate} fontSize={18} />
          <View style={slideStyles.badge}>
            <Text style={slideStyles.badgeText}>{icon} {text}</Text>
          </View>
        </View>
          <View style={slideStyles.actionRow}>
            <TFPressable style={slideStyles.playBtn} focusedStyle={slideStyles.playBtnFocus} onPress={() => onPlayContent(item.key)} accessibilityLabel="Lejátszás folytatása" accessibilityRole="button">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <PlayIcon size={12} color={COLORS.black} />
                <Text style={slideStyles.playBtnText}>{item.type !== 'live' && item.position > 5 && item.duration > 0 ? `Folytatás ${fmtPos(item.position)}-nél` : 'Lejátszás'}</Text>
              </View>
            </TFPressable>
            {onToggleFav && (
              <TFPressable style={slideStyles.favBtn} focusedStyle={slideStyles.favBtnFocus} onPress={onToggleFav} accessibilityLabel={isFav ? 'Eltávolítás a kedvencekből' : 'Hozzáadás a kedvencekhez'} accessibilityRole="button">
                <Text style={[slideStyles.favBtnText, isFav && slideStyles.favBtnTextActive]}>{isFav ? '\u2764\uFE0F' : '\u2661'}</Text>
              </TFPressable>
            )}
          </View>
        {item.type === 'live' && extra.epg && (
          <View style={slideStyles.infoBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={slideStyles.epgBadge}>
                <Text style={slideStyles.epgBadgeText}>{'\uD83D\uDD34'} Most:</Text>
              </View>
              <Text style={slideStyles.epgNextTitle} numberOfLines={1}>{extra.epg[0]?.title || 'N/A'}</Text>
            </View>
            {extra.epg[0]?.description ? <Text style={slideStyles.epgDesc} numberOfLines={2}>{extra.epg[0].description}</Text> : null}
            {extra.epg[1] && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={slideStyles.epgBadge}>
                  <Text style={slideStyles.epgBadgeText}>{'Következő:'}</Text>
                </View>
                <Text style={slideStyles.epgNextTitle} numberOfLines={1}>{extra.epg[1].title}</Text>
              </View>
            )}
            {extra.epg[1]?.description ? <Text style={slideStyles.epgNextDesc} numberOfLines={1}>{extra.epg[1].description}</Text> : null}
          </View>
        )}
        {(item.type === 'movie' || item.type === 'series') && plot ? (
          <Text style={slideStyles.plot} numberOfLines={4}>Tartalom: {plot}</Text>
        ) : null}
      </View>
      <View style={slideStyles.colRight}>
        {logoSrc ? (
          <Image source={{ uri: logoSrc }} style={item.type === 'live' ? slideStyles.logoLive : slideStyles.poster} resizeMode="contain" />
        ) : (
          <Text style={slideStyles.fallback}>{icon}</Text>
        )}
      </View>
    </View>
  );
}

export default function HomeHero({ history, playlist, onPlayContent }: HomeHeroProps) {
  const favItems = useFavorites();
  const toggleFav = useToggleFavorite();
  const items = history.slice(0, 5);
  const [currentIdx, setCurrentIdx] = useState(0);
  const animVal = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const carouselWidthRef = useRef(0);
  const [starDims, setStarDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    setCurrentIdx(0);
    animVal.setValue(0);
  }, [items.length, animVal]);

  const isAnimatingRef = useRef(false);

  const goTo = useCallback((idx: number) => {
    if (isAnimatingRef.current) return;
    const nextIdx = idx >= items.length ? 0 : idx < 0 ? items.length - 1 : idx;
    isAnimatingRef.current = true;
    const offset = carouselWidthRef.current * nextIdx;
    Animated.timing(animVal, {
      toValue: -offset,
      duration: 500,
      useNativeDriver: true,
    }).start(() => { isAnimatingRef.current = false; });
    setCurrentIdx(nextIdx);
  }, [items.length, animVal]);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setTimeout(() => goTo(currentIdx + 1), INTERVAL);
    return () => clearTimeout(timer);
  }, [currentIdx, items.length, goTo]);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyHeadline}>Kezdjünk hozzá</Text>
        <Text style={styles.emptyTitle}>Nincs előzmény még</Text>
        <Text style={styles.emptySub}>Válassz tartalmat a lejátszás kezdéséhez.</Text>
      </View>
    );
  }

  return (
      <RuggedBorder color={COLORS.cyan} wobbleFactor={0.7}>
      <View style={styles.carouselOuter} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; carouselWidthRef.current = width; if (width > 0) setStarDims({ w: width, h: height }); }}>
        <LinearGradient
          colors={['#1a2228', '#101820', '#080810']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.carouselGradient}
        />
        {starDims.w > 0 && (
          <Svg width={starDims.w} height={starDims.h} style={styles.carouselGradient} pointerEvents="none">
            <G transform={`translate(${starDims.w - 65}, 8)`}>
              <G transform="translate(2,2)"><Polygon points={comicStarburstPoints(25, 5, 2, 2)} fill="#000" /></G>
              <Polygon points={comicStarburstPoints(25, 5, 2, 2)} fill="#FFEE00" stroke="#000" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </G>
            <G transform={`translate(${starDims.w - 80}, ${starDims.h - 40})`}>
              <G transform="translate(2,2)"><Polygon points={comicStarburstPoints(20, 5, 2, 2)} fill="#000" /></G>
              <Polygon points={comicStarburstPoints(20, 5, 2, 2)} fill="#FF6600" stroke="#000" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </G>
            <G transform="translate(16, 30)">
              <G transform="translate(2,2)"><Polygon points={comicStarburstPoints(22, 5, 2, 2)} fill="#000" /></G>
              <Polygon points={comicStarburstPoints(22, 5, 2, 2)} fill="#39FF14" stroke="#000" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </G>
          </Svg>
        )}
        <DotPattern dotColor="#fff" dotOpacity={0.05} spacing={14} />
        <Animated.View style={[styles.track, { transform: [{ translateX: animVal }] }]}>
          {items.map((item, i) => (
            <View key={item.key} style={styles.slide}>
              <HeroSlideContent slideIndex={i} item={item} playlist={playlist} onPlayContent={onPlayContent} isFav={favItems.some(f => f.key === item.key)} onToggleFav={() => toggleFav({ key: item.key, title: item.title, type: item.type === 'live' ? 'live' : item.type === 'series' ? 'series' : 'movie', group: item.group || '', logo: item.logo || '', streamUrl: '', seriesId: '' })} />
              {(item.type === 'movie' || item.type === 'series') && (
                <View style={{ position: 'absolute', top: 20, right: 10 }}>
                  <ComicStarburst size={22} pointsCount={5} fillColor={['#39FF14', '#FFEE00', '#FF6600', '#FF0044'][i % 4]} borderColor="#000" borderWidth={2} shadowOffset={2} />
                </View>
              )}
            </View>
          ))}
        </Animated.View>
        {items.length > 1 && (
          <View style={styles.dots}>
            {items.map((_, i) => (
              <TFPressable
                key={i}
                style={[styles.dot, i === currentIdx && styles.dotActive]}
                focusedStyle={styles.dotFocus}
                onPress={() => goTo(i)}
                accessibilityLabel={`${i + 1}. slide`}
                accessibilityRole="button"
              />
            ))}
          </View>
        )}
      </View>
      </RuggedBorder>
  );
}

const slideStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    minHeight: 130,
  },
  colLeft: {
    flex: 3,
    paddingLeft: 20, paddingRight: 20, paddingTop: 3, paddingBottom: 16,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: COLORS.yellow,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#000',
  },
  badgeText: { color: COLORS.black, fontSize: 7, fontWeight: '700', fontFamily: '007Toontime' },
  title: { color: COLORS.white, fontSize: 18, fontFamily: 'Bangers-Regular', fontWeight: '200', letterSpacing: 1, flex: 1, marginRight: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playBtn: {
    backgroundColor: COLORS.yellow,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#000',
  },
  playBtnFocus: { backgroundColor: COLORS.cyan },
  playBtnText: { color: COLORS.black, fontSize: 8, fontFamily: '007Toontime' },
  favBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.panel2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  favBtnFocus: { borderColor: COLORS.yellow, backgroundColor: 'rgba(255,255,255,0.15)' },
  favBtnText: { fontSize: 16, color: COLORS.muted },
  favBtnTextActive: { color: COLORS.red },
  infoBlock: { gap: 2 },
  epgBadge: {
    backgroundColor: COLORS.cyan,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderWidth: 1, borderColor: '#000',
  },
  epgBadgeText: { color: COLORS.black, fontSize: 9, fontFamily: '007Toontime' },
  epgDesc: { color: COLORS.white, fontSize: 8, lineHeight: 11, fontFamily: '007Toontime' },
  epgNextLabel: { color: COLORS.white, fontSize: 10, fontFamily: '007Toontime', marginTop: 2 },
  epgNextTitle: { color: COLORS.white, fontSize: 10, fontFamily: '007Toontime' },
  epgNextDesc: { color: COLORS.white, fontSize: 8, lineHeight: 10, fontFamily: '007Toontime' },
  plot: { color: COLORS.white, fontSize: 9, lineHeight: 13, fontFamily: '007Toontime' },
  colRight: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    overflow: 'hidden',
  },
  poster: { width: 100, height: 150, borderRadius: 6 },
  logoLive: { width: 130, height: 73, borderRadius: 4 },
  fallback: { fontSize: 56, opacity: 0.15 },
});

const styles = StyleSheet.create({
  emptyContainer: { flex: 1, padding: SPACING.lg, alignItems: 'center', backgroundColor: 'rgba(25, 25, 25, 0.92)', borderRadius: 10, borderWidth: 1, borderColor: '#000', marginTop: SPACING.md },
  emptyHeadline: { color: COLORS.yellow, fontSize: 38, fontWeight: '800', marginBottom: SPACING.xs },
  emptyTitle: { color: COLORS.text, fontSize: 30, fontWeight: '700' },
  emptySub: { color: COLORS.muted, fontSize: 20, marginTop: SPACING.sm, textAlign: 'center' },
  carouselOuter: { borderRadius: 0, overflow: 'hidden', position: 'relative', backgroundColor: '#080808' },
  carouselGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  track: { flexDirection: 'row' },
  slide: { minWidth: '100%', position: 'relative' },
  dots: {
    position: 'absolute', bottom: 12, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { backgroundColor: COLORS.yellow },
  dotFocus: { backgroundColor: COLORS.yellow, transform: [{ scale: 1.2 }] },
});

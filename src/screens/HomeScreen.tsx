import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Image, ImageBackground, StyleSheet, BackHandler, Modal } from 'react-native';
import TFPressable from '../components/TFPressable';
import HomeHero from '../components/HomeHero';
import ShadowWrapper from '../components/ShadowWrapper';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import DotPattern from '../components/DotPattern';
import SimpleCard from '../components/SimpleCard';
import MovieDetailPanel from '../components/MovieDetailPanel';
import SeriesDetailPanel from '../components/SeriesDetailPanel';
import ExitDialog from '../components/ExitDialog';
import { useCore, useFavorites, useHistory, useClearHistory, useProfiles, useBackgroundAudio, useToggleWatchLater, useWatchLater, useToggleFavorite } from '../store/AppContext';
import { useRecommended, usePopular } from '../hooks/useRecommendations';
import { useAIRecommend } from '../hooks/useAIRecommend';
import { COLORS, FONT, SPACING, USER_STATUS_LOGGED_IN } from '../constants';
import type { Movie, Series } from '../types';
import { fetchSimilar, type EmbeddingRecommendation } from '../services/aiProxy';

function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

interface HomeScreenProps {
  onNavigate: (route: string, params?: { id?: string }) => void;
  onPlayContent: (key: string) => void;
}

export default function HomeScreen({ onNavigate, onPlayContent }: HomeScreenProps) {
  const { state: { playlist, isLoading, user } } = useCore();
  const watchHistory = useHistory();
  const favorites = useFavorites();
  const clearHistory = useClearHistory();
  const isLoggedIn = user.status === USER_STATUS_LOGGED_IN;
  const [showExit, setShowExit] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const similarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { clear: clearBgAudio } = useBackgroundAudio();

  const allLive = playlist ? (playlist.liveChannels || []) : [];
  const liveCards = useMemo(() => sample(allLive, Math.min(6, allLive.length)), [allLive]);
  const profiles = useProfiles();

  const allProfHistory = useMemo(() => profiles.flatMap(p => p.watch_progress || []), [profiles]);
  const allProfFavorites = useMemo(() => profiles.flatMap(p => p.favorites || []), [profiles]);

  const reco = useRecommended(watchHistory, playlist, favorites);
  const popular = usePopular(profiles.length, playlist, allProfHistory, allProfFavorites);
  const aiRec = useAIRecommend(watchHistory, playlist);
  const toggleWl = useToggleWatchLater();
  const wlItems = useWatchLater();
  const toggleFav = useToggleFavorite();
  const isWl = (key: string) => wlItems.some(w => w.key === key);

  const handleMoviePlay = useCallback(() => {
    if (selectedMovie) { onPlayContent(selectedMovie.key); setSelectedMovie(null); }
  }, [selectedMovie, onPlayContent]);
  const handleMovieClose = useCallback(() => setSelectedMovie(null), []);
  const handleMovieToggleFav = useCallback(() => {
    if (!selectedMovie) return;
    toggleFav({ key: selectedMovie.key, title: selectedMovie.title, type: 'movie', group: selectedMovie.group || '', logo: selectedMovie.logo || '', streamUrl: '', seriesId: '' });
  }, [selectedMovie, toggleFav]);
  const handleMovieToggleWl = useCallback(() => {
    if (!selectedMovie) return;
    toggleWl({ key: selectedMovie.key, title: selectedMovie.title, type: 'movie', group: selectedMovie.group || '', logo: selectedMovie.logo || '' });
  }, [selectedMovie, toggleWl]);

  const handleSeriesClose = useCallback(() => setSelectedSeries(null), []);
  const handleShowEpisodes = useCallback(() => {
    if (!selectedSeries) return;
    onNavigate('episodes', { seriesId: selectedSeries.seriesId, title: selectedSeries.title });
    setSelectedSeries(null);
  }, [selectedSeries, onNavigate]);
  const handleSeriesToggleFav = useCallback(() => {
    if (!selectedSeries) return;
    toggleFav({ key: selectedSeries.key, title: selectedSeries.title, type: 'series', group: selectedSeries.group || '', logo: selectedSeries.logo || '', streamUrl: '', seriesId: selectedSeries.seriesId.toString() });
  }, [selectedSeries, toggleFav]);
  const handleSeriesToggleWl = useCallback(() => {
    if (!selectedSeries) return;
    toggleWl({ key: selectedSeries.key, title: selectedSeries.title, type: 'series', group: selectedSeries.group || '', logo: selectedSeries.logo || '' });
  }, [selectedSeries, toggleWl]);

  const handleOpenSimilar = useCallback((item: { key: string; title: string; type: string; streamId?: number; seriesId?: number }) => {
    setSelectedMovie(null);
    setSelectedSeries(null);
    if (item.type === 'movie' && item.streamId) {
      const m = playlist?.movies?.find(m => m.streamId === item.streamId);
      if (m) similarTimerRef.current = setTimeout(() => setSelectedMovie(m), 100);
    } else if (item.type === 'series' && item.seriesId) {
      const s = playlist?.series?.find(s => s.seriesId === item.seriesId);
      if (s) similarTimerRef.current = setTimeout(() => setSelectedSeries(s), 100);
    }
  }, [playlist]);

  useEffect(() => {
    return () => { if (similarTimerRef.current) clearTimeout(similarTimerRef.current); };
  }, []);

  const [dailyPicks, setDailyPicks] = useState<EmbeddingRecommendation[]>([]);

  useEffect(() => {
    const movies = playlist?.movies;
    if (!movies || movies.length === 0 || dailyPicks.length > 0) return;
    const seed = movies[Math.floor(Math.random() * movies.length)];
    fetchSimilar(seed.streamId, 'movie', 5)
      .then(items => { setDailyPicks(items); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedSeries) { setSelectedSeries(null); return true; }
      if (selectedMovie) { setSelectedMovie(null); return true; }
      clearBgAudio();
      setShowExit(true);
      return true;
    });
    return () => handler.remove();
  }, [selectedMovie, selectedSeries, clearBgAudio]);

  if (showExit) {
    return (
      <Modal transparent animationType="fade" onRequestClose={() => setShowExit(false)}>
        <View style={styles.exitOverlay}>
          <ExitDialog onDismiss={() => setShowExit(false)} />
        </View>
      </Modal>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>{'\u23F3'} Betöltés...</Text>
      </View>
    );
  }

  // Welcome (not logged in)
  if (!isLoggedIn) {
    return (
      <ImageBackground source={require('../../assets/splash-bg.png')} style={styles.welcomeRoot} resizeMode="cover">
        <View style={styles.welcomeCenter}>
          <Image source={require('../../assets/pp-logo.png')} style={styles.welcomeLogo} resizeMode="contain" />
          <Text style={styles.welcomeTitle}>{String.fromCharCode(220)}dv{String.fromCharCode(246)}z{String.fromCharCode(246)}l a PusztaPlayer!</Text>
          <Text style={styles.welcomeSub}>A folytat{String.fromCharCode(225)}shoz jelentkezz be.</Text>
          <RuggedBorder color={COLORS.black}>
            <TFPressable
              style={styles.welcomeBtnPrimary}
              focusedStyle={styles.welcomeBtnFocus}
              onPress={() => onNavigate('Login')}
              accessibilityLabel="Bejelentkezés"
              accessibilityRole="button"
            >
              <Text style={styles.welcomeBtnText}>{'\uD83D\uDD10'} BEJELENTKEZ{String.fromCharCode(201)}S</Text>
            </TFPressable>
            <SoundEffect text="GO!" textColor={COLORS.white} bgColor={COLORS.red} top={-14} right={-8} rotate={12} />
          </RuggedBorder>
        </View>
      </ImageBackground>
    );
  }

  // Logged in
  const liveHistory = watchHistory.filter(i => i.type === 'live');
  const mediaHistory = watchHistory.filter(i => i.type !== 'live');

  return (
    <>
      <ScrollView style={styles.container}>
      <View style={{ marginBottom: 10 }}>
        <HomeHero history={watchHistory} playlist={playlist} onPlayContent={onPlayContent} />
      </View>

      {(aiRec.items.length > 0 || reco.items.length > 0) && (
        <View style={[styles.section, { marginBottom: SPACING.md + 8 }]}>
          <RuggedBorder color={COLORS.black} wobbleFactor={0.7} minDimension={80} strokeWidth={4}>
            <View style={{ paddingHorizontal: 3 }}>
              <View style={styles.yellowHeader}>
                <DotPattern dotColor="#000" dotOpacity={0.12} spacing={10} />
                <Text style={styles.yellowHeaderText}>
                  {aiRec.items.length > 0 ? 'Neked aj\u00E1nljuk' : reco.title}
                </Text>
              </View>
            </View>
            <SoundEffect text="POP!" textColor="#FF6600" bgColor={COLORS.cyan} top={-10} right={30} rotate={-8} fontSize={36} />
          </RuggedBorder>
          <View style={[styles.gridWrap, { marginTop: SPACING.xs * 4 }]}>
            {aiRec.items.length > 0 ? (
              aiRec.items.slice(0, 5).map(rec => {
                const movie = playlist?.movies?.find(m => m.key === rec.key);
                const series = playlist?.series?.find(s => s.key === rec.key);
                const item = movie || series;
                if (!item) return null;
                const sub = rec.similarity ? `${rec.similarity}% ${rec.reason}` : rec.reason;
                return (
                  <SimpleCard key={rec.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={sub} imageUrl={item.logo || ''} onPress={() => {
                    if (movie) setSelectedMovie(movie);
                    else if (series) setSelectedSeries(series);
                  }} isFav={favorites.some(f => f.key === item.key)} />
                );
              })
            ) : (
              reco.items.slice(0, 5).map(item => (
                <SimpleCard key={item.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={item.group || ''} imageUrl={item.logo || ''} onPress={() => {
                  if (item.type === 'movie') {
                    const m = playlist?.movies?.find(m => m.key === item.key);
                    if (m) setSelectedMovie(m);
                  } else {
                    const s = playlist?.series?.find(s => s.key === item.key);
                    if (s) setSelectedSeries(s);
                  }
                }} isFav={favorites.some(f => f.key === item.key)} />
              ))
            )}
          </View>
        </View>
      )}

      {popular.items.length > 0 && (
        <View style={[styles.section, { marginBottom: SPACING.md + 4 }]}>
          <RuggedBorder color={COLORS.black} wobbleFactor={0.7} minDimension={80} strokeWidth={4}>
            <View style={{ paddingHorizontal: 3 }}>
              <View style={styles.yellowHeader}>
                <DotPattern dotColor="#000" dotOpacity={0.12} spacing={10} />
                <Text style={styles.yellowHeaderText}>Magyar n{String.fromCharCode(233)}z{String.fromCharCode(337)}k kedvencei</Text>
              </View>
            </View>
            <SoundEffect text="HOT!" textColor={COLORS.yellow} bgColor={COLORS.red} top={-12} right={200} rotate={12} fontSize={30} />
          </RuggedBorder>
          <View style={[styles.gridWrap, { marginTop: SPACING.xs * 4 }]}>
            {popular.items.slice(0, 5).map(item => (
              <SimpleCard key={item.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={item.group || ''} imageUrl={item.logo || ''} onPress={() => onPlayContent(item.key)} isFav={favorites.some(f => f.key === item.key)} />
            ))}
          </View>
        </View>
      )}

      {dailyPicks.length > 0 && (
        <View style={[styles.section, { marginBottom: SPACING.md + 4 }]}>
          <RuggedBorder color={COLORS.black} wobbleFactor={0.7} minDimension={80} strokeWidth={4}>
            <View style={{ paddingHorizontal: 3 }}>
              <View style={styles.yellowHeader}>
                <DotPattern dotColor="#000" dotOpacity={0.12} spacing={10} />
                <Text style={styles.yellowHeaderText}>{'\uD83D\uDCC5'} Napi v{String.fromCharCode(225)}logat{String.fromCharCode(225)}s</Text>
              </View>
            </View>
          </RuggedBorder>
          <View style={[styles.gridWrap, { marginTop: SPACING.xs * 4 }]}>
            {dailyPicks.slice(0, 5).map(rec => {
              const movie = playlist?.movies?.find(m => m.streamId === parseInt(rec.key, 10));
              const series = playlist?.series?.find(s => s.seriesId === parseInt(rec.key, 10));
              const item = movie || series;
              if (!item) return null;
              return (
                <SimpleCard key={rec.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={`${Math.round(rec.similarity * 100)}% ${rec.reason || ''}`} imageUrl={item.logo || ''} onPress={() => {
                  if (movie) setSelectedMovie(movie);
                  else if (series) setSelectedSeries(series);
                }} isFav={favorites.some(f => f.key === item.key)} />
              );
            })}
          </View>
        </View>
      )}

      {watchHistory.length > 0 && (
        <View style={styles.section}>
          <RuggedBorder color={COLORS.black} wobbleFactor={0.7} minDimension={80} strokeWidth={4}>
            <View style={{ paddingHorizontal: 3 }}>
              <View style={styles.yellowHeader}>
                <DotPattern dotColor="#000" dotOpacity={0.12} spacing={10} />
                <Text style={styles.yellowHeaderText}>Utolj{String.fromCharCode(225)}ra megtekintett </Text>
                <ShadowWrapper offset={4} borderRadius={4}>
                  <TFPressable style={styles.clearBtn} focusedStyle={styles.clearBtnFocus} onPress={clearHistory}>
                    <Text style={styles.clearBtnText}>{'\u00D7'} törlés</Text>
                  </TFPressable>
                </ShadowWrapper>
              </View>
          </View>
          </RuggedBorder>
          {liveHistory.length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subHeader}>{'\uD83D\uDCFA'} LIVE TV</Text>
              <View style={styles.gridWrap}>
                {liveHistory.slice(0, 5).map(item => (
                  <SimpleCard key={item.key} type="live" title={item.title} subtitle={item.group || ''} imageUrl={item.logo || ''} onPress={() => onPlayContent(item.key)} isFav={favorites.some(f => f.key === item.key)} />
                ))}
              </View>
            </View>
          )}
          {mediaHistory.length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subHeader}>{'\uD83C\uDFAC'} Filmek & Sorozat</Text>
              <View style={styles.gridWrap}>
                {mediaHistory.slice(0, 5).map(item => {
                  const prog = item.duration > 0 ? item.position / item.duration : undefined;
                  return (
                    <SimpleCard key={item.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={item.group || ''} imageUrl={item.logo || ''} onPress={() => onPlayContent(item.key)} progress={prog} isFav={favorites.some(f => f.key === item.key)} />
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}

      {liveCards.length > 0 && (
        <View style={[styles.section, { marginBottom: SPACING.md + 4 }]}>
          <RuggedBorder color={COLORS.black} wobbleFactor={0.7} minDimension={80} strokeWidth={4}>
            <View style={{ paddingHorizontal: 3 }}>
              <View style={[styles.yellowHeader, { paddingTop: Math.round(SPACING.xs / 2), paddingBottom: Math.round((SPACING.xs + 2) / 2) }]}>
                <DotPattern dotColor="#000" dotOpacity={0.12} spacing={10} />
                <Text style={styles.yellowHeaderText}>Most megy {String.fromCharCode(233)}l{String.fromCharCode(337)}ben </Text>
              </View>
            </View>
            <SoundEffect text="ON!" textColor={COLORS.red} bgColor={COLORS.cyan} top={-8} right={-6} rotate={-10} fontSize={30} />
          </RuggedBorder>
          <View style={[styles.gridWrap, { marginTop: SPACING.xs * 4 }]}>
            {liveCards.slice(0, 5).map(item => (
              <SimpleCard key={item.key} type="live" title={item.title} subtitle={item.group || ''} imageUrl={item.logo || ''} onPress={() => onPlayContent(item.key)} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>

      <Modal visible={!!selectedMovie} transparent animationType="fade" onRequestClose={handleMovieClose}>
        <MovieDetailPanel
          streamId={selectedMovie?.streamId}
          title={selectedMovie?.title}
          onClose={handleMovieClose}
          onPlay={handleMoviePlay}
          isFav={favorites.some(f => f.key === selectedMovie?.key)}
          onToggleFav={handleMovieToggleFav}
          isWatchLater={isWl(selectedMovie?.key || '')}
          onToggleWatchLater={handleMovieToggleWl}
          onOpenSimilar={handleOpenSimilar}
          onCastPress={(name: string) => { setSelectedMovie(null); onNavigate('castSearch', { castName: name }); }}
        />
      </Modal>
      <Modal visible={!!selectedSeries} transparent animationType="fade" onRequestClose={handleSeriesClose}>
        <SeriesDetailPanel
          seriesId={selectedSeries?.seriesId}
          title={selectedSeries?.title}
          onClose={handleSeriesClose}
          onShowEpisodes={handleShowEpisodes}
          isFav={favorites.some(f => f.key === selectedSeries?.key)}
          onToggleFav={handleSeriesToggleFav}
          isWatchLater={isWl(selectedSeries?.key || '')}
          onToggleWatchLater={handleSeriesToggleWl}
          onOpenSimilar={handleOpenSimilar}
          onCastPress={(name: string) => { setSelectedSeries(null); onNavigate('castSearch', { castName: name }); }}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.md },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  loadingText: { color: COLORS.muted, fontSize: FONT.lg },
  // Welcome screen
  welcomeRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeCenter: { alignItems: 'center', paddingHorizontal: 80 },
  welcomeLogo: { width: 120, height: 120, borderRadius: 24, marginBottom: 20 },
  welcomeTitle: { color: COLORS.yellow, fontSize: FONT.xxl, fontFamily: 'Bangers-Regular', letterSpacing: 2, textAlign: 'center', marginBottom: SPACING.xs },
  welcomeSub: { color: COLORS.muted, fontSize: FONT.md, fontFamily: 'Poppins-Regular', marginBottom: SPACING.lg, textAlign: 'center' },
  welcomeBtnPrimary: { backgroundColor: COLORS.yellow, borderRadius: 0, borderWidth: 3, borderColor: COLORS.black, paddingVertical: 8, paddingHorizontal: 24, alignSelf: 'stretch', alignItems: 'center' },
  welcomeBtnFocus: { backgroundColor: COLORS.cyan },
  welcomeBtnText: { color: COLORS.black, fontSize: 11, fontFamily: 'Poppins-Bold', letterSpacing: 1, textTransform: 'uppercase' },
  // Exit
  exitOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  // Sections
  section: { marginBottom: SPACING.md },
  yellowHeader: { position: 'relative', backgroundColor: COLORS.yellow, borderRadius: 8, paddingTop: SPACING.xs, paddingBottom: SPACING.xs + 2, paddingHorizontal: SPACING.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  yellowHeaderText: { color: COLORS.black, fontFamily: 'Bangers-Regular', fontSize: 14, letterSpacing: 0.5, textAlign: 'left' },
  subHeader: { color: COLORS.white, fontFamily: 'Bangers-Regular', fontSize: 16, marginTop: SPACING.sm, marginBottom: SPACING.xs * 2 },
  subSection: { marginBottom: SPACING.sm + 4 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: SPACING.md },
  clearBtn: { backgroundColor: COLORS.red, borderRadius: 4, borderWidth: 1, borderColor: COLORS.black, paddingHorizontal: 10, paddingVertical: 3 },
  clearBtnFocus: { backgroundColor: COLORS.cyan, transform: [{ scale: 0.95 }] },
  clearBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '700', fontFamily: 'Poppins-Bold' },
  epOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: COLORS.bg },
});

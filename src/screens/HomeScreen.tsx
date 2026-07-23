import { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, Image, ImageBackground, StyleSheet, BackHandler, Modal } from 'react-native';
import TFPressable from '../components/TFPressable';
import HomeHero from '../components/HomeHero';
import ShadowWrapper from '../components/ShadowWrapper';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import SimpleCard from '../components/SimpleCard';
import ExitDialog from '../components/ExitDialog';
import { useCore, useFavorites, useHistory, useClearHistory, useProfiles, useBackgroundAudio } from '../store/AppContext';
import { useRecommended, usePopular } from '../hooks/useRecommendations';
import { useAIRecommend } from '../hooks/useAIRecommend';
import { COLORS, FONT, SPACING, USER_STATUS_LOGGED_IN } from '../constants';
import type { RouteName } from '../types';

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
  const { clear: clearBgAudio } = useBackgroundAudio();

  const allLive = playlist ? (playlist.liveChannels || []) : [];
  const liveCards = useMemo(() => sample(allLive, Math.min(6, allLive.length)), [allLive]);
  const profiles = useProfiles();

  const allProfHistory = useMemo(() => profiles.flatMap(p => p.watch_progress || []), [profiles]);
  const allProfFavorites = useMemo(() => profiles.flatMap(p => p.favorites || []), [profiles]);

  const reco = useRecommended(watchHistory, playlist, favorites);
  const popular = usePopular(profiles.length, playlist, allProfHistory, allProfFavorites);
  const aiRec = useAIRecommend(watchHistory, playlist);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      clearBgAudio();
      setShowExit(true);
      return true;
    });
    return () => handler.remove();
  }, []);

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

      {reco.items.length > 0 && (
        <View style={styles.section}>
          <RuggedBorder color={COLORS.black}>
            <View style={styles.yellowHeader}>
              <Text style={styles.yellowHeaderText}>{reco.title}</Text>
            </View>
            <SoundEffect text="POP!" textColor="#FF6600" bgColor={COLORS.cyan} top={-10} right={10} rotate={-8} />
          </RuggedBorder>
          <View style={[styles.gridWrap, { marginTop: SPACING.xs * 2 }]}>
            {reco.items.slice(0, 8).map(item => (
              <SimpleCard key={item.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={item.group || ''} imageUrl={item.logo || ''} onPress={() => onPlayContent(item.key)} isFav={favorites.some(f => f.key === item.key)} />
            ))}
          </View>
        </View>
      )}

      {popular.items.length > 0 && (
        <View style={styles.section}>
          <RuggedBorder color={COLORS.black}>
            <View style={styles.yellowHeader}>
              <Text style={styles.yellowHeaderText}>Magyar n{String.fromCharCode(233)}z{String.fromCharCode(337)}k kedvencei</Text>
            </View>
          </RuggedBorder>
          <View style={[styles.gridWrap, { marginTop: SPACING.xs * 2 }]}>
            {popular.items.slice(0, 8).map(item => (
              <SimpleCard key={item.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={item.group || ''} imageUrl={item.logo || ''} onPress={() => onPlayContent(item.key)} isFav={favorites.some(f => f.key === item.key)} />
            ))}
          </View>
        </View>
      )}

      {aiRec.items.length > 0 && (
        <View style={styles.section}>
          <RuggedBorder color={COLORS.black}>
            <View style={styles.yellowHeader}>
              <Text style={styles.yellowHeaderText}>{'\uD83E\uDD16'} AI Aj{String.fromCharCode(225)}nlja</Text>
            </View>
          </RuggedBorder>
          <View style={[styles.gridWrap, { marginTop: SPACING.xs * 2 }]}>
            {aiRec.items.slice(0, 5).map(rec => {
              const movie = playlist?.movies?.find(m => m.key === rec.key);
              const series = playlist?.series?.find(s => s.key === rec.key);
              const item = movie || series;
              if (!item) return null;
              return (
                <SimpleCard key={rec.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={rec.reason} imageUrl={item.logo || ''} onPress={() => onPlayContent(item.key)} isFav={favorites.some(f => f.key === item.key)} />
              );
            })}
          </View>
        </View>
      )}

      {watchHistory.length > 0 && (
        <View style={styles.section}>
          <RuggedBorder color={COLORS.black}>
            <View style={styles.yellowHeader}>
              <Text style={styles.yellowHeaderText}>Utolj{String.fromCharCode(225)}ra megtekintett </Text>
              {watchHistory.length > 0 && (
                <ShadowWrapper offset={4} borderRadius={4}>
                  <TFPressable style={styles.clearBtn} focusedStyle={styles.clearBtnFocus} onPress={clearHistory}>
                    <Text style={styles.clearBtnText}>{'\u00D7'} törlés</Text>
                  </TFPressable>
                </ShadowWrapper>
              )}
            </View>
          </RuggedBorder>
          {liveHistory.length > 0 && (
            <View style={styles.subSection}>
              <Text style={styles.subHeader}>{'\uD83D\uDCFA'} LIVE TV</Text>
              <View style={styles.gridWrap}>
                {liveHistory.slice(0, 5).map(item => (
                  <SimpleCard key={item.key} type="live" title={item.title} subtitle={item.group || ''} imageUrl={item.logo} onPress={() => onPlayContent(item.key)} isFav={favorites.some(f => f.key === item.key)} />
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
                    <SimpleCard key={item.key} type={item.type === 'series' ? 'series' : 'movie'} title={item.title} subtitle={item.group || ''} imageUrl={item.logo} onPress={() => onPlayContent(item.key)} progress={prog} isFav={favorites.some(f => f.key === item.key)} />
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}

      {liveCards.length > 0 && (
        <View style={styles.section}>
          <RuggedBorder color={COLORS.black}>
            <View style={[styles.yellowHeader, { paddingTop: Math.round(SPACING.xs / 2), paddingBottom: Math.round((SPACING.xs + 2) / 2) }]}>
              <Text style={styles.yellowHeaderText}>Most megy {String.fromCharCode(233)}l{String.fromCharCode(337)}ben </Text>
            </View>
          </RuggedBorder>
          <View style={[styles.gridWrap, { marginTop: SPACING.xs * 2 }]}>
            {liveCards.slice(0, 5).map(item => (
              <SimpleCard key={item.key} type="live" title={item.title} subtitle={item.group || ''} imageUrl={item.logo} onPress={() => onPlayContent(item.key)} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.md },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  loadingText: { color: COLORS.muted, fontSize: FONT.lg },
  // Welcome screen
  welcomeRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeCenter: { alignItems: 'center', paddingHorizontal: 40 },
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
  yellowHeader: { backgroundColor: COLORS.yellow, borderRadius: 0, paddingTop: SPACING.xs, paddingBottom: SPACING.xs + 2, paddingHorizontal: SPACING.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  yellowHeaderText: { color: COLORS.black, fontFamily: 'Bangers-Regular', fontSize: 18, letterSpacing: 0.5, textAlign: 'left' },
  subHeader: { color: COLORS.white, fontFamily: 'Bangers-Regular', fontSize: 16, marginTop: SPACING.sm, marginBottom: SPACING.xs * 2 },
  subSection: { marginBottom: SPACING.sm + 4 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: SPACING.md },
  clearBtn: { backgroundColor: COLORS.red, borderRadius: 4, borderWidth: 1, borderColor: COLORS.black, paddingHorizontal: 10, paddingVertical: 3 },
  clearBtnFocus: { backgroundColor: COLORS.cyan, transform: [{ scale: 0.95 }] },
  clearBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '700', fontFamily: 'Poppins-Bold' },
});

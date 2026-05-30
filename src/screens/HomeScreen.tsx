import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, FlatList, ScrollView, Image, ImageBackground, StyleSheet, BackHandler, Modal } from 'react-native';
import TFPressable from '../components/TFPressable';
import HomeHero from '../components/HomeHero';
import ShadowWrapper from '../components/ShadowWrapper';
import SimpleCard from '../components/SimpleCard';
import ExitDialog from '../components/ExitDialog';
import DevLoginForm from '../components/DevLoginForm';
import { useCore, useFavorites, useHistory, useClearHistory } from '../store/AppContext';
import { COLORS, FONT, SPACING, SIZES, USER_STATUS_LOGGED_IN } from '../constants';
import type { RouteName } from '../types';
import { useDevLogin } from '../hooks/useDevLogin';

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
  const { loading: devLoading, error: devError, login: devLoginApi, reset: resetDevLogin } = useDevLogin();
  const [showExit, setShowExit] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);
  const logoTapCount = useRef(0);
  const logoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allLive = playlist ? (playlist.liveChannels || []) : [];
  const liveCards = useMemo(() => sample(allLive, Math.min(6, allLive.length)), [allLive]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showDevLogin) { setShowDevLogin(false); return true; }
      setShowExit(true);
      return true;
    });
    return () => handler.remove();
  }, [showDevLogin]);

  useEffect(() => {
    return () => { if (logoTapTimer.current) clearTimeout(logoTapTimer.current); };
  }, []);

  const handleLogoTap = () => {
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    logoTapCount.current += 1;
    if (logoTapCount.current >= 2) {
      logoTapCount.current = 0;
      setShowDevLogin(true);
      return;
    }
    logoTapTimer.current = setTimeout(() => { logoTapCount.current = 0; }, 800);
  };

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

  // Dev login on welcome screen
  if (!isLoggedIn && showDevLogin) {
    return (
      <ImageBackground source={require('../../assets/splash-bg.png')} style={styles.welcomeRoot} resizeMode="cover">
        <DevLoginForm
          loading={devLoading}
          error={devError}
          onLogin={(email, pass) => devLoginApi(email, pass)}
          onBack={() => { setShowDevLogin(false); resetDevLogin(); }}
        />
      </ImageBackground>
    );
  }

  // Welcome (not logged in)
  if (!isLoggedIn) {
    return (
      <ImageBackground source={require('../../assets/splash-bg.png')} style={styles.welcomeRoot} resizeMode="cover">
        <View style={styles.welcomeCenter}>
          <TFPressable onPress={handleLogoTap} accessibilityLabel="PusztaPlayer logó" accessibilityRole="button">
            <Image source={require('../../assets/pp-logo.png')} style={styles.welcomeLogo} resizeMode="contain" />
          </TFPressable>
          <Text style={styles.welcomeTitle}>Üdvözöl a PusztaPlayer!</Text>
          <Text style={styles.welcomeSub}>A folytatáshoz jelentkezz be.</Text>
          <ShadowWrapper offset={6} borderRadius={14}>
            <TFPressable
              style={styles.welcomeBtnPrimary}
              focusedStyle={styles.welcomeBtnFocus}
              onPress={() => onNavigate('Login')}
              hasTVPreferredFocus
              accessibilityLabel="Bejelentkezés"
              accessibilityRole="button"
            >
              <Text style={styles.welcomeBtnText}>{'\uD83D\uDD10'} BEJELENTKEZÉS</Text>
            </TFPressable>
          </ShadowWrapper>
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

      {watchHistory.length > 0 && (
        <View style={styles.section}>
          <ShadowWrapper offset={6} borderRadius={10}>
            <View style={styles.yellowHeader}>
              <Text style={styles.yellowHeaderText}>Utoljára megtekintett </Text>
              {watchHistory.length > 0 && (
                <ShadowWrapper offset={4} borderRadius={4}>
                  <TFPressable style={styles.clearBtn} focusedStyle={styles.clearBtnFocus} onPress={clearHistory}>
                    <Text style={styles.clearBtnText}>{'\u00D7'} törlés</Text>
                  </TFPressable>
                </ShadowWrapper>
              )}
            </View>
          </ShadowWrapper>
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
          <ShadowWrapper offset={3} borderRadius={10}>
            <View style={[styles.yellowHeader, { paddingTop: Math.round(SPACING.xs / 2), paddingBottom: Math.round((SPACING.xs + 2) / 2) }]}>
              <Text style={styles.yellowHeaderText}>Most megy élőben </Text>
            </View>
          </ShadowWrapper>
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
  welcomeBtnPrimary: { backgroundColor: COLORS.yellow, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl, borderRadius: 14, alignItems: 'center' },
  welcomeBtnFocus: { backgroundColor: COLORS.cyan },
  welcomeBtnText: { color: COLORS.black, fontWeight: '700', fontSize: FONT.md, fontFamily: 'Poppins-Bold' },
  // Exit
  exitOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  // Sections
  section: { marginBottom: SPACING.md },
  yellowHeader: { backgroundColor: COLORS.yellow, borderRadius: 6, paddingTop: SPACING.xs, paddingBottom: SPACING.xs + 2, paddingHorizontal: SPACING.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  yellowHeaderText: { color: COLORS.black, fontFamily: 'Bangers-Regular', fontSize: 18, letterSpacing: 0.5, textAlign: 'left' },
  subHeader: { color: COLORS.white, fontFamily: 'Bangers-Regular', fontSize: 16, marginTop: SPACING.sm, marginBottom: SPACING.xs * 2 },
  subSection: { marginBottom: SPACING.sm + 4 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: SPACING.md },
  clearBtn: { backgroundColor: COLORS.red, borderRadius: 4, borderWidth: 1, borderColor: COLORS.black, paddingHorizontal: 10, paddingVertical: 3 },
  clearBtnFocus: { backgroundColor: COLORS.cyan, transform: [{ scale: 0.95 }] },
  clearBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '700', fontFamily: 'Poppins-Bold' },
});

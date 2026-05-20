// Windows-specific HomeScreen - BackHandler.addEventListener not available
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, FlatList, Image, ImageBackground, StyleSheet, Modal } from 'react-native';
import TFPressable from '../components/TFPressable';
import HomeHero from '../components/HomeHero';
import ShadowWrapper from '../components/ShadowWrapper';
import SimpleCard from '../components/SimpleCard';
import ExitDialog from '../components/ExitDialog';
import DevLoginForm from '../components/DevLoginForm';
import { useCore, useFavorites, useHistory, useClearHistory } from '../store/AppContext';
import { COLORS, FONT, SPACING, SIZES, USER_STATUS_LOGGED_IN , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';
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

  // Windows: BackHandler may not be available; skip addEventListener
  useEffect(() => {
    try {
      const BackHandler = require('react-native').BackHandler;
      if (BackHandler && BackHandler.addEventListener) {
        const handler = BackHandler.addEventListener('hardwareBackPress', () => {
          if (showDevLogin) { setShowDevLogin(false); return true; }
          setShowExit(true);
          return true;
        });
        return () => handler.remove();
      }
    } catch {}
  }, [showDevLogin]);

  useEffect(() => {
    return () => { if (logoTapTimer.current) clearTimeout(logoTapTimer.current); };
  }, []);

  // ... rest of the component stays the same as the original
  const handleLogoTap = () => {
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    logoTapCount.current += 1;
    if (logoTapCount.current >= 2) {
      logoTapCount.current = 0;
      setShowDevLogin(true);
      return;
    }
    logoTapTimer.current = setTimeout(() => { logoTapCount.current = 0; }, 500);
  };

  // duplicated from original HomeScreen for Windows
  const recentHistory = watchHistory.slice(0, 3);
  const favItems = favorites.slice(0, 3);
  const hasContent = isLoggedIn && playlist && (playlist.liveChannels?.length > 0 || playlist.movieChannels?.length > 0 || playlist.seriesChannels?.length > 0);

  return (
    <View style={s.container}>
      {showDevLogin && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDevLogin(false)}>
          <View style={s.overlay}>
            <DevLoginForm
              loading={devLoading}
              error={devError}
              onLogin={async (email, pass) => {
                const ok = await devLoginApi(email, pass);
                if (ok) setShowDevLogin(false);
              }}
              onBack={() => setShowDevLogin(false)}
            />
          </View>
        </Modal>
      )}
      {isLoading ? (
        <View style={s.centerContainer}>
          <Text style={s.loadingText}>{'\u23F3'} Betöltés…</Text>
        </View>
      ) : !isLoggedIn ? (
        <ImageBackground source={require('../../assets/splash-bg.png')} style={s.welcomeRoot} resizeMode="cover">
          <View style={s.welcomeCenter}>
            <TFPressable onPress={handleLogoTap} accessibilityLabel="PusztaPlayer logó" accessibilityRole="button">
              <Image source={require('../../assets/pp-logo.png')} style={s.welcomeLogo} resizeMode="contain" />
            </TFPressable>
            <Text style={s.welcomeTitle}>Üdvözl a PusztaPlayer!</Text>
            <Text style={s.welcomeSub}>A folytatáshoz jelentkezz be.</Text>
            <ShadowWrapper offset={6} borderRadius={14}>
              <TFPressable
                style={s.welcomeBtnPrimary}
                focusedStyle={s.welcomeBtnFocus}
                onPress={() => onNavigate('Login')}
                hasTVPreferredFocus
                accessibilityLabel="Bejelentkezés"
                accessibilityRole="button"
              >
                <Text style={s.welcomeBtnText}>{'\uD83D\uDD10'} BEJELENTKEZÉS</Text>
              </TFPressable>
            </ShadowWrapper>
          </View>
        </ImageBackground>
      ) : (
      <View style={s.scroll}>
        <View style={s.heroRow}>
          <HomeHero history={watchHistory} playlist={playlist} onPlayContent={onPlayContent} />
          <ShadowWrapper offset={6} borderRadius={14}>
            <View style={s.controlsCard}>
              <TFPressable style={s.ctrlBtn} focusedStyle={s.ctrlBtnFocus} onPress={() => onNavigate('Live')}>
                <Text style={s.ctrlBtnLabel}>Live TV</Text>
                <Text style={s.ctrlBtnCount}>{allLive.length}</Text>
              </TFPressable>
              <TFPressable style={s.ctrlBtn} focusedStyle={s.ctrlBtnFocus} onPress={() => onNavigate('Movies')}>
                <Text style={s.ctrlBtnLabel}>Movies</Text>
                <Text style={s.ctrlBtnCount}>{playlist?.movieChannels?.length ?? 0}</Text>
              </TFPressable>
              <TFPressable style={s.ctrlBtn} focusedStyle={s.ctrlBtnFocus} onPress={() => onNavigate('Series')}>
                <Text style={s.ctrlBtnLabel}>Series</Text>
                <Text style={s.ctrlBtnCount}>{playlist?.seriesChannels?.length ?? 0}</Text>
              </TFPressable>
            </View>
          </ShadowWrapper>
        </View>

        {!hasContent && !isLoading && (
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>{'\uD83D\uDCFA'}</Text>
            <Text style={s.emptyTitle}>Nincs tartalom</Text>
            <Text style={s.emptyDesc}>
              Tölts be egy playlistet a beállításokban, vagy szinkronizálj a {isLoggedIn ? 'profiloddal' : 'fiókodhoz tartozó Xtream adatokkal'}.
            </Text>
          </View>
        )}

        {isLoading && <Text style={s.loadingText}>Betöltés…</Text>}

        {recentHistory.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Folytatás</Text>
            <FlatList horizontal data={recentHistory} keyExtractor={(_, i) => `h-${i}`}
              renderItem={({ item }) => (
                <SimpleCard title={item.title} image={item.image} onPress={() => onPlayContent(item.key)} />
              )}
            />
          </View>
        )}

        {favItems.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Kedvencek</Text>
            <FlatList horizontal data={favItems} keyExtractor={(_, i) => `f-${i}`}
              renderItem={({ item }) => (
                <SimpleCard title={item.title} image={item.image} onPress={() => onPlayContent(item.key)} />
              )}
            />
          </View>
        )}

        {liveCards.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Élő csatornák</Text>
            <FlatList horizontal data={liveCards} keyExtractor={(_, i) => `l-${i}`}
              renderItem={({ item }) => (
                <SimpleCard title={item.title} image={item.image} onPress={() => onPlayContent(item.key)} />
              )}
            />
          </View>
        )}

        <View style={s.footer}>
          <Text style={s.footerText}>pusztaplayer v0.7</Text>
        </View>
      </View>
      )}

      {showExit && <ExitDialog onClose={() => setShowExit(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  // Welcome screen
  welcomeRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeCenter: { alignItems: 'center', paddingHorizontal: 40 },
  welcomeLogo: { width: 120, height: 120, borderRadius: 24, marginBottom: 20 },
  welcomeTitle: { color: COLORS.yellow, fontSize: FONT.xxl, fontFamily: FONT_FAMILY_BANGERS, letterSpacing: 2, textAlign: 'center', marginBottom: SPACING.xs },
  welcomeSub: { color: COLORS.muted, fontSize: FONT.md, fontFamily: FONT_FAMILY_POPPINS, marginBottom: SPACING.lg, textAlign: 'center' },
  welcomeBtnPrimary: { backgroundColor: COLORS.yellow, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl, borderRadius: 14, alignItems: 'center' },
  welcomeBtnFocus: { backgroundColor: COLORS.cyan },
  welcomeBtnText: { color: COLORS.black, fontWeight: '700', fontSize: FONT.md, fontFamily: FONT_FAMILY_POPPINS_BOLD },
  scroll: { flexGrow: 1, padding: SPACING.lg, gap: SPACING.md },
  heroRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  controlsCard: { backgroundColor: COLORS.panel, borderRadius: 14, padding: SPACING.sm, flexDirection: 'row', gap: 4 },
  ctrlBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.xs, borderRadius: 10, backgroundColor: COLORS.bg },
  ctrlBtnFocus: { backgroundColor: COLORS.yellow },
  ctrlBtnLabel: { color: COLORS.muted, fontSize: FONT.xs, fontFamily: FONT_FAMILY_POPPINS },
  ctrlBtnCount: { color: COLORS.yellow, fontSize: FONT.sm, fontFamily: FONT_FAMILY_POPPINS_BOLD },
  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: COLORS.yellow, fontFamily: FONT_FAMILY_BANGERS, fontSize: FONT.lg },
  emptyDesc: { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center', maxWidth: 400, fontFamily: FONT_FAMILY_POPPINS },
  loadingText: { color: COLORS.yellow, fontSize: FONT.md, textAlign: 'center', paddingVertical: SPACING.xxl },
  section: { marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.white, fontFamily: FONT_FAMILY_POPPINS_BOLD, fontSize: FONT.md, marginBottom: SPACING.sm },
  footer: { alignItems: 'center', paddingVertical: SPACING.lg },
  footerText: { color: COLORS.muted, fontSize: FONT.xs },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
});


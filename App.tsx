import React, { useEffect, useState, useRef } from 'react';
import { StatusBar, View, Text, Image, ImageBackground, StyleSheet, Animated, LogBox, Platform, Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';
import { AppProvider, useAppDispatch, useCore } from './src/store/AppContext';
import AppNavigator from './src/navigation/AppNavigator';
import BackgroundAudio from './src/components/BackgroundAudio';
import ErrorBoundary from './src/components/ErrorBoundary';
import RuggedBorder from './src/components/RuggedBorder';
import SoundEffect from './src/components/SoundEffect';
import ComicStarburst from './src/components/ComicStarburst';
import * as Sentry from '@sentry/react-native';

const { version: pkgVersion } = require('./package.json') as { version: string };
const DISPLAY_VERSION = 'v' + (pkgVersion || '0.7.0').split('.').slice(0, 2).join('.');

if (!__DEV__ && SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: 'production',
  });
}
import { NetProvider } from './src/components/NetProvider';
import { initPlaylistFromCache, xtreamLogin } from './src/services/playlistService';
import { loadXtreamCredentials } from './src/services/storage';
import { COLORS, QR_API_BASE, USER_AGENT, SENTRY_DSN, initLiveFormat } from './src/constants';
import type { PlaylistData } from './src/types';

LogBox.ignoreLogs([
  'new NativeEventEmitter',
  'Deep imports from the \'react-native\' package are deprecated',
]);

const LOADING_STEPS = [
  'Kérlek várj, amíg a szuperhősök felépítik a birodalmadat...',
  'Mindent ellenőrzünk, hogy ne a meccsnézés közben derüljön ki valami...',
  'A szuperhőseid most felépítik a külső kerítést, hogy ne zavarhassanak illetéktelenek...',
  'A személyes adataid + csatornáid betöltése...',
];
const STEP_DELAY = 1500;

// Progress bar inline
function ProgressBar({ pct }: { pct: number }) {
  return (
    <View style={pb.wrap}>
      <View style={[pb.fill, { width: `${Math.max(2, pct * 100)}%` as any }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  wrap: { height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, alignSelf: 'stretch', marginTop: 10, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: COLORS.cyan },
});

let isTV = false;
let isTablet = false;
let isTouch = true;
let deviceLabel = 'Android Mobile edition';
let isWindowsOS = false;
try {
  isTV = Platform.isTV;
  const { width: winW, height: winH } = Dimensions.get('window');
  isTouch = !isTV;
  isTablet = Math.min(winW, winH) >= 600;
  isWindowsOS = Platform.OS === 'windows';
  deviceLabel = isWindowsOS ? (isTV ? 'Xbox edition' : 'Windows edition') : isTV ? 'FireTV edition' : isTablet ? 'Android Tablet edition' : 'Android Mobile edition';
} catch {}

function AppInitializer() {
  const dispatch = useAppDispatch();
  const { state: { isLoading } } = useCore();
  const [apiReady, setApiReady] = useState(false);
  const [animReady, setAnimReady] = useState(false);
  const [pendingPlaylist, setPendingPlaylist] = useState<PlaylistData | null>(null);
  const [pendingUser, setPendingUser] = useState<any>(null);

  // Logo animations: heartbeat + starburst
  const fadeLogo = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const burstScale = useRef(new Animated.Value(0)).current;
  const burstOpacity = useRef(new Animated.Value(1)).current;
  const fadeTitle = useRef(new Animated.Value(0)).current;
  const fadeVer = useRef(new Animated.Value(0)).current;
  const fadeEdition = useRef(new Animated.Value(0)).current;
  const stepFades = useRef(LOADING_STEPS.map(() => new Animated.Value(0))).current;
  const stepChecks = useRef(LOADING_STEPS.map(() => new Animated.Value(0))).current;
  const fadeSteps = useRef(new Animated.Value(1)).current;
  const fadeDone = useRef(new Animated.Value(0)).current;
  const [animStep, setAnimStep] = useState(0);
  const [apiProgress, setApiProgress] = useState(0);

  // Heartbeat + Starburst combined logo entrance
  useEffect(() => {
    // Starburst expands behind logo
    Animated.parallel([
      Animated.timing(burstScale, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.timing(burstOpacity, { toValue: 0, duration: 500, delay: 300, useNativeDriver: false }),
    ]).start();

    // Heartbeat: 0.5 → 1.15 → 0.9 → 1.05 → 1.0
    Animated.sequence([
      Animated.timing(fadeLogo, { toValue: 1, duration: 400, useNativeDriver: false }),
      Animated.timing(logoScale, { toValue: 1.15, duration: 200, useNativeDriver: false }),
      Animated.timing(logoScale, { toValue: 0.9, duration: 150, useNativeDriver: false }),
      Animated.timing(logoScale, { toValue: 1.05, duration: 100, useNativeDriver: false }),
      Animated.timing(logoScale, { toValue: 1.0, duration: 150, useNativeDriver: false }),
    ]).start();

    // Title + version + edition sequential fade
    Animated.sequence([
      Animated.delay(600),
      Animated.timing(fadeTitle, { toValue: 1, duration: 400, useNativeDriver: false }),
      Animated.timing(fadeVer, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.timing(fadeEdition, { toValue: 1, duration: 300, useNativeDriver: false }),
    ]).start(() => setAnimStep(1));
  }, []);

  // Animated loading steps — fixed delay, not API-dependent
  useEffect(() => {
    if (animStep < 1 || animStep > LOADING_STEPS.length) return;
    const i = animStep - 1;

    stepFades[i].setValue(0);
    stepChecks[i].setValue(0);

    Animated.sequence([
      Animated.timing(stepFades[i], { toValue: 1, duration: 400, useNativeDriver: false }),
      Animated.delay(STEP_DELAY),
      Animated.spring(stepChecks[i], { toValue: 1, speed: 10, bounciness: 10, useNativeDriver: false }),
      Animated.delay(200),
    ]).start(() => setAnimStep(prev => prev <= LOADING_STEPS.length ? prev + 1 : prev));
  }, [animStep]);

  // Done animation
  useEffect(() => {
    if (animStep !== LOADING_STEPS.length + 1) return;
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(fadeSteps, { toValue: 0, duration: 250, useNativeDriver: false }),
        Animated.timing(fadeDone, { toValue: 1, duration: 350, useNativeDriver: false }),
      ]),
      Animated.delay(400),
      Animated.timing(fadeDone, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start(() => setAnimReady(true));
  }, [animStep]);

  // Defer playlist dispatch until profiles loaded
  useEffect(() => {
    if (!isLoading && pendingPlaylist) {
      dispatch({ type: 'SET_PLAYLIST', payload: pendingPlaylist });
      dispatch({ type: 'SET_USER', payload: pendingUser });
      setPendingPlaylist(null);
      setPendingUser(null);
    }
  }, [isLoading, pendingPlaylist, pendingUser, dispatch]);

  // API loading
  useEffect(() => {
    (async () => {
      try {
        await initLiveFormat();
        const creds = await loadXtreamCredentials();
        setApiProgress(1);
        if (creds) {
          const playlist = await xtreamLogin(creds.username, creds.password);
          setApiProgress(2);

          let email = creds.email;
          let nickname = creds.nickname;
          let phone = creds.phone;
          if (creds.apiKey) {
            try {
              const resp = await fetch(`${QR_API_BASE}/user?api_key=${encodeURIComponent(creds.apiKey)}`, { headers: { 'User-Agent': USER_AGENT } });
              if (resp.ok) {
                const wpUser = await resp.json();
                if (wpUser && !wpUser.error) {
                  email = wpUser.email || email;
                  nickname = wpUser.nickname || nickname || wpUser.xtream_user;
                  phone = wpUser.phone || phone;
                }
              }
            } catch { /* silent */ }
          }
          setApiProgress(3);

          setPendingPlaylist(playlist);
          setPendingUser({ name: creds.username, status: 'Xtream bejelentkezve', email, nickname, phone, apiKey: creds.apiKey });
        } else {
          const cached = await initPlaylistFromCache();
          if (cached) {
            setPendingPlaylist(cached);
            setPendingUser({ name: cached.xtreamUser, status: 'Xtream bejelentkezve' });
          }
        }
      } catch {
        const cached = await initPlaylistFromCache();
        if (cached) {
          setPendingPlaylist(cached);
          setPendingUser({ name: cached.xtreamUser, status: 'Xtream bejelentkezve' });
        }
      }
      setApiProgress(4);
      setApiReady(true);
    })();
  }, [dispatch]);

  const ready = apiReady && animReady;

  if (!ready) {
    return (
      <ImageBackground source={require('./assets/splash-bg.png')} style={styles.splash} resizeMode="cover">
        <SoundEffect text="LOADING..." textColor={COLORS.yellow} bgColor={COLORS.red} top={-2} right={-10} rotate={14} fontSize={12} />
        <View style={styles.splashContent}>
          {/* Upper: PopArtCard with gradient + RuggedBorder */}
          <RuggedBorder color={COLORS.cyan} wobbleFactor={0.7}>
            <View style={styles.card}>
              {/* Gradient + dot background */}
              <View style={StyleSheet.absoluteFill}>
                <LinearGradient colors={['#060810', '#0c0f20', '#151430']} style={StyleSheet.absoluteFill} />
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <Pattern id="spdots" x="0" y="0" width={10} height={10} patternUnits="userSpaceOnUse">
                      <Circle cx={5} cy={5} r={2} fill="#2a2550" opacity={0.35} />
                    </Pattern>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#spdots)" />
                </Svg>
              </View>

              <View style={styles.cardRow}>
                <View style={styles.logoWrap}>
                  {/* Expanding starburst behind logo */}
                  <Animated.View style={[StyleSheet.absoluteFill, {
                    alignItems: 'center', justifyContent: 'center',
                    opacity: burstOpacity,
                    transform: [{ scale: burstScale.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.5] }) }],
                  }]}>
                    <ComicStarburst size={80} pointsCount={12} fillColor={COLORS.yellow} borderColor={COLORS.red} borderWidth={3} shadowOffset={3} />
                  </Animated.View>
                  <Animated.Image
                    source={require('./assets/pp-logo.png')}
                    style={[styles.splashLogo, {
                      opacity: fadeLogo,
                      transform: [{ scale: logoScale }],
                    }]}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.cardTextCol}>
                  <Animated.Text style={[styles.splashTitle, { opacity: fadeTitle }]}>pusztaplayer </Animated.Text>
                  <Animated.Text style={[styles.splashVersion, { opacity: fadeVer }]}>{DISPLAY_VERSION}</Animated.Text>
                  <Animated.Text style={[styles.splashEdition, { opacity: fadeEdition }]}>{deviceLabel}</Animated.Text>
                </View>
              </View>
            </View>
          </RuggedBorder>

          {/* Lower: loading steps */}
          <View style={styles.stepsWrap}>
            <Animated.View style={{ opacity: fadeSteps, alignSelf: 'stretch', width: '100%' }}>
              {LOADING_STEPS.map((text, i) => (
                <View key={i} style={styles.stepRow}>
                  <Animated.Text style={[styles.stepText, { opacity: stepFades[i] }]} numberOfLines={1}>{text}</Animated.Text>
                  <Animated.Text
                    style={[styles.stepCheck, {
                      opacity: stepChecks[i],
                      transform: [{ scale: stepChecks[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
                    }]}
                  >
                    {'\u2713'}
                  </Animated.Text>
                </View>
              ))}
            </Animated.View>
            <ProgressBar pct={Math.max(0, animStep - 1) / LOADING_STEPS.length} />
            <Animated.Text style={[styles.doneText, { opacity: fadeDone }]}>MINDEN KÉSZ, INDULÁS!</Animated.Text>
          </View>
        </View>
      </ImageBackground>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <BackgroundAudio />
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </View>
  );
}

export default __DEV__ ? App : Sentry.wrap(App);

function App() {
  return (
    <SafeAreaProvider>
      <NetProvider>
        <AppProvider>
          <AppInitializer />
        </AppProvider>
      </NetProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  splash: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    width: '100%',
    maxWidth: 600,
  },
  // ── Card ──────────────────────────────
  card: {
    paddingVertical: 24,
    paddingHorizontal: 28,
    borderRadius: 10,
    overflow: 'visible',
    width: '100%',
    backgroundColor: 'rgba(10,10,20,0.92)',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  logoWrap: {
    position: 'relative',
    width: 75,
    height: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 75,
    height: 75,
    borderRadius: 18,
  },
  cardTextCol: {
    alignItems: 'flex-start',
  },
  splashTitle: {
    color: COLORS.yellow,
    fontSize: 32,
    fontFamily: 'Bangers-Regular',
    letterSpacing: 1,
  },
  splashVersion: {
    color: COLORS.yellow,
    fontSize: 14,
    fontFamily: 'Bangers-Regular',
    opacity: 0.7,
    marginTop: -4,
  },
  splashEdition: {
    color: COLORS.cyan,
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    marginTop: 6,
  },
  // ── Steps ─────────────────────────────
  stepsWrap: {
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 500,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
    alignSelf: 'stretch',
    width: '100%',
  },
  stepText: {
    color: COLORS.muted,
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    flex: 1,
  },
  stepCheck: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: '800',
  },
  doneText: {
    color: COLORS.yellow,
    fontSize: 24,
    fontFamily: 'Bangers-Regular',
    letterSpacing: 1,
    marginTop: 4,
  },
});

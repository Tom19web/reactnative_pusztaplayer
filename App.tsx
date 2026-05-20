import React, { useEffect, useState, useRef } from 'react';
import { StatusBar, View, Text, Image, ImageBackground, StyleSheet, Animated, LogBox, Platform, Dimensions } from 'react-native';

// Windows: stub fetch to prevent native HTTP module crash
// REMOVED - let native HTTP module work
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useAppDispatch } from './src/store/AppContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import * as Sentry from '@sentry/react-native';

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
import { COLORS, QR_API_BASE, USER_AGENT, SENTRY_DSN } from './src/constants';

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

// Platform values may not be ready at module load time on Windows
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
  const [apiReady, setApiReady] = useState(false);
  const [animReady, setAnimReady] = useState(false);
  const fadeLogo = useRef(new Animated.Value(0)).current;
  const fadeTitle = useRef(new Animated.Value(0)).current;
  const fadeVer = useRef(new Animated.Value(0)).current;
  const fadeEdition = useRef(new Animated.Value(0)).current;
  const stepFades = useRef(LOADING_STEPS.map(() => new Animated.Value(0))).current;
  const stepChecks = useRef(LOADING_STEPS.map(() => new Animated.Value(0))).current;
  const fadeSteps = useRef(new Animated.Value(1)).current;
  const fadeDone = useRef(new Animated.Value(0)).current;

  // Track which visual step we're on (0 = logo, 1-4 = loading text, 5 = done)
  const [animStep, setAnimStep] = useState(0);

  // API progress stages (0-4): creds loaded, login done, wp fetch done, playlist dispatched, apiReady
  const [apiProgress, setApiProgress] = useState(0);

  useEffect(() => {
    // Logo + title staggered fade-in (fixed, no delay)
    Animated.sequence([
Animated.timing(fadeLogo, { toValue: 1, duration: 500, useNativeDriver: false }),
Animated.timing(fadeTitle, { toValue: 1, duration: 400, useNativeDriver: false }),
Animated.timing(fadeVer, { toValue: 1, duration: 300, useNativeDriver: false }),
Animated.timing(fadeEdition, { toValue: 1, duration: 300, useNativeDriver: false }),
]).start(() => setAnimStep(1));
}, []);

  // Animated loading steps — each step advances when BOTH the previous animation is done
  // AND enough API progress has been made (minDelay gets smaller as apiProgress increases)
  useEffect(() => {
    if (animStep < 1 || animStep > LOADING_STEPS.length) return;
    const i = animStep - 1;
    const minDelay = Math.max(300, 2000 - apiProgress * 400);
    const isDone = apiProgress >= i;
    const delay = isDone ? 300 : minDelay;

    stepFades[i].setValue(0);
    stepChecks[i].setValue(0);

    Animated.sequence([
      Animated.timing(stepFades[i], { toValue: 1, duration: 400, useNativeDriver: false }),
      Animated.delay(delay),
      Animated.spring(stepChecks[i], { toValue: 1, speed: 10, bounciness: 10, useNativeDriver: false }),
      Animated.delay(200),
    ]).start(() => setAnimStep(prev => prev <= LOADING_STEPS.length ? prev + 1 : prev));
  }, [animStep, apiProgress]);

  // Final "done" animation when all steps complete
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

  // API loading runs in parallel with animations
  useEffect(() => {
    (async () => {
      try {
        const creds = await loadXtreamCredentials();
        setApiProgress(1);
        if (creds) {
          const playlist = await xtreamLogin(creds.username, creds.password);
          setApiProgress(2);

          // Fetch latest user data from WordPress (email, phone, nickname) on every startup
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
            } catch { /* silent — use cached data */ }
          }
          setApiProgress(3);

          dispatch({ type: 'SET_PLAYLIST', payload: playlist });
          dispatch({ type: 'SET_USER', payload: { name: creds.username, status: 'Xtream bejelentkezve', email, nickname, phone, apiKey: creds.apiKey } });
        } else {
          const cached = await initPlaylistFromCache();
          if (cached) {
            dispatch({ type: 'SET_PLAYLIST', payload: cached });
            dispatch({ type: 'SET_USER', payload: { name: cached.xtreamUser, status: 'Xtream bejelentkezve' } });
          }
        }
      } catch {
        const cached = await initPlaylistFromCache();
        if (cached) {
          dispatch({ type: 'SET_PLAYLIST', payload: cached });
          dispatch({ type: 'SET_USER', payload: { name: cached.xtreamUser, status: 'Xtream bejelentkezve' } });
        }
      }
      setApiProgress(4);
      setApiReady(true);
    })();
  }, [dispatch]);

  // Only proceed when BOTH API and animation are done
  const ready = apiReady && animReady;

  if (!ready) {
    return (
      <ImageBackground source={require('./assets/splash-bg.png')} style={styles.splash} resizeMode="cover">
        <View style={styles.splashTop}>
          <View style={styles.splashTopLeft}>
            <Animated.Image
              source={require('./assets/pp-logo.png')}
              style={[styles.splashLogo, { opacity: fadeLogo, transform: [{ scale: fadeLogo.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}
              resizeMode="contain"
            />
          </View>
          <View style={styles.splashTopRight}>
            <Animated.Text style={[styles.splashTitle, { opacity: fadeTitle }]}>pusztaplayer </Animated.Text>
            <Animated.Text style={[styles.splashVersion, { opacity: fadeVer }]}>v0.7 </Animated.Text>
            <Animated.Text style={[styles.splashEdition, { opacity: fadeEdition }]}>{deviceLabel}</Animated.Text>
          </View>
        </View>
        <View style={styles.splashBottom}>
          <Animated.View style={{ opacity: fadeSteps }}>
            {LOADING_STEPS.map((text, i) => (
              <View key={i} style={styles.stepRow}>
                <Animated.Text style={[styles.stepText, { opacity: stepFades[i] }]} numberOfLines={1}>{text}</Animated.Text>
                <Animated.Text style={[styles.stepCheck, { opacity: stepChecks[i] }]}>{'\u2713'}</Animated.Text>
              </View>
            ))}
          </Animated.View>
          <Animated.View style={[styles.doneWrap, { opacity: fadeDone }]}>
            <Text style={styles.doneText}>{'\u2713'}</Text>
          </Animated.View>
        </View>
      </ImageBackground>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </View>
  );
}

const AppRoot = __DEV__ ? App : Sentry.wrap(App);

export default function App() {
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
    backgroundColor: '#0a0a0a',
  },
  splashTop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 40,
    gap: 24,
  },
  splashTopLeft: {
    alignItems: 'flex-end',
  },
  splashLogo: {
    width: 100,
    height: 100,
    borderRadius: 20,
  },
  splashTopRight: {
    alignItems: 'flex-start',
  },
  splashTitle: {
    color: COLORS.yellow,
    fontSize: 42,
    fontFamily: 'Bangers-Regular',
    letterSpacing: 1,
  },
  splashVersion: {
    color: COLORS.yellow,
    fontSize: 20,
    fontFamily: 'Bangers-Regular',
    opacity: 0.7,
    marginTop: -4,
  },
  splashEdition: {
    color: COLORS.cyan,
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    marginTop: 8,
  },
  splashBottom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepText: {
    color: COLORS.muted,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
  },
  stepCheck: {
    color: '#4caf50',
    fontSize: 18,
    fontWeight: '800',
  },
  doneText: {
    color: COLORS.yellow,
    fontSize: 32,
    fontFamily: 'Bangers-Regular',
    letterSpacing: 1,
    marginTop: 8,
  },
});

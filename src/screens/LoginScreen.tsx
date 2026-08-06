import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform, Linking, ImageBackground, Animated } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import TFPressable from '../components/TFPressable';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import { USER_STATUS_LOGGED_IN, COLORS, IS_TV, SCREEN_WIDTH } from '../constants';
import { useSetUser, useSetPlaylist } from '../store/AppContext';
import { xtreamLogin } from '../services/playlistService';
import { saveXtreamCredentials } from '../services/storage';
import { registerSession } from '../services/liveProxy';
import { requestQRCode, pollQRCode, stopPolling } from '../services/qrAuth';
import { useHardwareBack } from '../hooks/useHardwareBack';

interface LoginScreenProps { onLoginSuccess: () => void; onBack?: () => void; }

const CARD_W = Math.min(440, SCREEN_WIDTH - 80);
const COUNTDOWN_SECS = 300;

// Progress bar SVG: small inline component
function ProgressBar({ pct, warn }: { pct: number; warn: boolean }) {
  return (
    <View style={pb.wrap}>
      <View style={[pb.fill, { width: `${Math.max(2, pct * 100)}%` as any, backgroundColor: warn ? COLORS.red : COLORS.cyan }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  wrap: { height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, alignSelf: 'stretch', marginBottom: 8, marginTop: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});

export default function LoginScreen({ onLoginSuccess, onBack }: LoginScreenProps) {
  const [step, setStep] = useState<'idle' | 'qr' | 'polling' | 'loggingIn' | 'expired' | 'error'>('idle');
  const [qrData, setQrData] = useState<{ code: string; authUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [dotsDone, setDotsDone] = useState(1);
  const setUser = useSetUser();
  const setPlaylist = useSetPlaylist();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const mountedRef = useRef(true);

  // Animated transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useHardwareBack(() => { onBack?.(); }, [onBack]);
  const fadeTo = useCallback((cb: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    cb();
  }, [fadeAnim]);

  useEffect(() => () => { mountedRef.current = false; stopPolling(); if (timerRef.current) clearInterval(timerRef.current); }, []);

  const fmtCode = (c: string) => {
    const s = c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return s.length <= 4 ? s : s.slice(0, Math.ceil(s.length / 2)) + ' ' + s.slice(Math.ceil(s.length / 2));
  };

  const startCountdown = () => {
    startRef.current = Date.now();
    setCountdown(COUNTDOWN_SECS);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, COUNTDOWN_SECS - Math.floor((Date.now() - startRef.current) / 1000));
      setCountdown(left);
      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        fadeTo(() => { setStep('expired'); setErrorMsg('A kód lejárt. Kérj egy újat.'); setDotsDone(0); });
      }
    }, 250);
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ':' + String(sec).padStart(2, '0');
  };

  const handleStart = async () => {
    if (step !== 'idle') return;
    setErrorMsg('');
    fadeTo(() => setStep('qr'));
    try {
      const r = await requestQRCode();
      setQrData(r);
      const code = fmtCode(r.code);
      setVerifyCode(code);
      startCountdown();
      setDotsDone(2);

      if (!IS_TV) {
        try { Linking.openURL(r.authUrl); } catch {}
      }

      fadeTo(() => setStep('polling'));
      pollQRCode(r.code, async (authResult) => {
        if (!mountedRef.current) return;
        const { xtreamUser, xtreamPass, userEmail, nickname, phone, apiKey } = authResult;
        if (xtreamUser && xtreamPass) {
          fadeTo(() => { setStep('loggingIn'); setDotsDone(3); });
          try {
            saveXtreamCredentials(xtreamUser, xtreamPass, { email: userEmail, nickname, phone, apiKey });
            await registerSession(xtreamUser, xtreamPass, apiKey || '');
            const playlist = await xtreamLogin(xtreamUser, xtreamPass);
            if (!mountedRef.current) return;
            setUser(xtreamUser, USER_STATUS_LOGGED_IN, userEmail || '', nickname || '', phone || '', apiKey || '');
            setPlaylist(playlist);
            if (timerRef.current) clearInterval(timerRef.current);
            stopPolling();
            onLoginSuccess();
          } catch (e: unknown) {
            if (!mountedRef.current) return;
            fadeTo(() => { setStep('error'); setErrorMsg('Bejelentkezési hiba: ' + (e instanceof Error ? e.message : 'ismeretlen')); });
          }
        }
      }, (err) => {
        if (!mountedRef.current) return;
        fadeTo(() => { setStep('error'); setErrorMsg(err); });
      });
    } catch (e: unknown) {
      fadeTo(() => { setStep('error'); setErrorMsg(e instanceof Error ? e.message : 'QR kód hiba'); });
    }
  };

  const handleBack = () => {
    stopPolling();
    if (timerRef.current) clearInterval(timerRef.current);
    fadeTo(() => {
      setStep('idle'); setQrData(null); setVerifyCode(''); setErrorMsg(''); setCountdown(0); setDotsDone(1);
    });
  };

  const handleRetry = () => {
    stopPolling();
    if (timerRef.current) clearInterval(timerRef.current);
    fadeTo(() => {
      setStep('idle'); setQrData(null); setErrorMsg(''); setCountdown(0); setDotsDone(1);
    });
    setTimeout(handleStart, 100);
  };

  const pct = countdown / COUNTDOWN_SECS;
  const isWarn = countdown < 60 && countdown > 0;

  return (
    <ImageBackground source={require('../../assets/splash-bg.png')} style={s.root} resizeMode="cover">
      <SoundEffect text="SCAN!" textColor={COLORS.yellow} bgColor={COLORS.red} top={12} right={SCREEN_WIDTH * 0.08} rotate={15} fontSize={14} />
      <SoundEffect text="GO!" textColor={COLORS.red} bgColor={COLORS.yellow} bottom={20} left={SCREEN_WIDTH * 0.1} rotate={-10} fontSize={16} />
      <ScrollView contentContainerStyle={s.scrollInner} nestedScrollEnabled>
        <RuggedBorder color={COLORS.cyan} wobbleFactor={0.7}>
          <View style={[s.card, { width: CARD_W }]}>
            <Text style={s.title}>PUSZTAPLAYER</Text>
            <Text style={s.subtitle}>DARK POP-ART PLAYER</Text>
            <View style={s.divider} />

            <Animated.View style={{ opacity: fadeAnim, alignSelf: 'stretch', alignItems: 'center' }}>
            {step === 'idle' ? (
              <>
                <Text style={s.emoji}>{'\uD83D\uDCFA'}</Text>
                <Text style={s.desc}>
                  {IS_TV
                    ? <>A Pusztaplayer és a <Text style={s.descBold}>pusztaplay.eu</Text> szolgáltatásainak használatához be kell jelentkezned. Nincs jelszó — csak egy QR kód, amit a telefonoddal beolvasol.</>
                    : <>A Pusztaplayer és a <Text style={s.descBold}>pusztaplay.eu</Text> szolgáltatásainak használatához be kell jelentkezned. Nyomd meg a gombot és jelentkezz be a böngészőben.</>
                  }
                </Text>
                <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={handleStart} testID="qr-login-btn" accessibilityLabel={IS_TV ? 'Bejelentkezés QR kóddal' : 'Bejelentkezés'} accessibilityRole="button">
                  <Text style={s.btnPrimaryText}>{IS_TV ? 'BEJELENTKEZÉS QR KÓDDAL' : 'BEJELENTKEZÉS'}</Text>
                </TFPressable>
                {errorMsg ? <Text style={s.errText}>{'\u26A0 ' + errorMsg}</Text> : null}
              </>
            ) : (
              <>
                <View style={s.dotsRow}>
                  {[1, 2, 3].map(i => (
                    <View key={i} style={[s.dot, i < dotsDone ? s.dotDone : i === dotsDone ? s.dotActive : s.dotPending]} />
                  ))}
                </View>

                {IS_TV && step !== 'loggingIn' && qrData && (
                  <>
                    <View style={s.qrWrap}>
                      <View style={s.qrInner}>
                        <QRCode value={qrData.authUrl} size={120} backgroundColor="#fff" color="#000" />
                      </View>
                    </View>
                    {verifyCode ? <Text style={s.verifyCode}>{verifyCode}</Text> : null}
                  </>
                )}

                <Text style={s.pollText}>
                  {step === 'loggingIn' ? '' :
                   IS_TV ? 'Olvasd be a QR kódot a telefonoddal.' :
                   'Jóváhagyásra vár a böngészőben…'}
                </Text>

                {step === 'polling' && <ProgressBar pct={pct} warn={isWarn} />}
                {step === 'polling' && <Text style={[s.countdownText, isWarn && s.countdownWarn]}>{'\u23F3 ' + fmtTime(countdown)}</Text>}

                {step === 'loggingIn' && (
                  <View style={s.pollRow}><ActivityIndicator color={COLORS.yellow} size="small" /><Text style={s.pollText}> Bejelentkezés…</Text></View>
                )}

                {step === 'expired' || step === 'error' ? (
                  <>
                    <Text style={s.errText}>{errorMsg}</Text>
                    <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={handleRetry} testID="retry-btn" accessibilityLabel="Újrapróbálkozás" accessibilityRole="button">
                      <Text style={s.btnPrimaryText}>{'\uD83D\uDD04'} ÚJRA</Text>
                    </TFPressable>
                  </>
                ) : null}
                {step !== 'loggingIn' && step !== 'expired' && (
                  <TFPressable style={s.btnGhost} focusedStyle={s.btnGhostFocus} onPress={handleBack} testID="cancel-btn" accessibilityLabel="Mégsem" accessibilityRole="button">
                    <Text style={s.btnGhostText}>MÉGSEM</Text>
                  </TFPressable>
                )}
              </>
            )}
            </Animated.View>
          </View>
        </RuggedBorder>
      </ScrollView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  scrollInner: { flexGrow: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 40 },
  card: { paddingVertical: 14, paddingHorizontal: 36, alignItems: 'center', backgroundColor: 'rgba(10,10,20,0.92)', borderRadius: 8, overflow: 'visible' },
  title: { color: COLORS.yellow, fontSize: 24, fontFamily: 'Bangers-Regular', letterSpacing: 3, textShadowColor: COLORS.black, textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
  subtitle: { color: COLORS.muted, fontSize: 8, fontFamily: 'Poppins-Bold', letterSpacing: 3, textTransform: 'uppercase', marginTop: 2 },
  divider: { height: 2, backgroundColor: '#1a1a1a', alignSelf: 'stretch', marginVertical: 8 },
  emoji: { fontSize: 36, marginBottom: 4 },
  desc: { color: COLORS.muted, fontSize: 10, fontFamily: 'Poppins-Regular', lineHeight: 15, textAlign: 'center', marginBottom: 8 },
  descBold: { color: COLORS.text, fontFamily: 'Poppins-Bold' },
  btnPrimary: { backgroundColor: COLORS.yellow, borderRadius: 12, borderWidth: 3, borderColor: COLORS.black, paddingVertical: 8, paddingHorizontal: 24, alignSelf: 'stretch', alignItems: 'center' },
  btnPrimaryFocus: { backgroundColor: COLORS.cyan },
  btnPrimaryText: { color: COLORS.black, fontSize: 11, fontFamily: 'Poppins-Bold', letterSpacing: 1, textTransform: 'uppercase' },
  btnGhost: { backgroundColor: 'transparent', borderRadius: 12, borderWidth: 3, borderColor: '#1a1a1a', paddingVertical: 7, paddingHorizontal: 24, alignSelf: 'stretch', alignItems: 'center', marginTop: 6 },
  btnGhostFocus: { borderColor: COLORS.yellow, backgroundColor: 'rgba(246,200,0,0.08)' },
  btnGhostText: { color: COLORS.muted, fontSize: 11, fontFamily: 'Poppins-Bold', letterSpacing: 1 },
  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotDone: { backgroundColor: COLORS.cyan },
  dotActive: { backgroundColor: COLORS.yellow, shadowColor: COLORS.yellow, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 1, elevation: 8 },
  dotPending: { backgroundColor: '#333' },
  pollText: { color: COLORS.cyan, fontSize: 10, fontFamily: 'Poppins-Bold', marginBottom: 6, textAlign: 'center' },
  pollRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  qrWrap: { backgroundColor: '#0d0d0d', borderRadius: 14, borderWidth: 2, borderColor: '#1a1a1a', padding: 10, marginBottom: 6 },
  qrInner: { padding: 4, backgroundColor: '#fff', borderRadius: 8, borderWidth: 3, borderColor: COLORS.black },
  verifyCode: { color: COLORS.yellow, fontSize: 12, fontFamily: 'Poppins-Bold', letterSpacing: 6, marginBottom: 4 },
  countdownText: { color: COLORS.muted, fontSize: 8, fontFamily: 'Poppins-Regular' },
  countdownWarn: { color: COLORS.yellow, fontFamily: 'Poppins-Bold' },
  errText: { color: COLORS.red, fontSize: 10, fontFamily: 'Poppins-Bold', marginTop: 8, textAlign: 'center' },
});

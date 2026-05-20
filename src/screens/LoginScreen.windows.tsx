import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Dimensions, StyleSheet, ActivityIndicator, Platform, Linking, TextInput } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import TFPressable from '../components/TFPressable';
import PopArtCard from '../components/PopArtCard';
import DevLoginForm from '../components/DevLoginForm';
import { COLORS, FONT, USER_STATUS_LOGGED_IN, XTREAM_SERVER, FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';
import { useDevLogin } from '../hooks/useDevLogin';
import { useSetUser, useSetPlaylist } from '../store/AppContext';
import { xtreamLogin, xtreamFullLogin } from '../services/playlistService';
import { saveXtreamCredentials, loadXtreamCredentials } from '../services/storage';
import { requestQRCode, pollQRCode, stopPolling } from '../services/qrAuth';

const QR_EXPIRY_MS = 300000;
let isTV = false;
try { isTV = Platform.isTV; } catch {}

interface LoginScreenProps { onLoginSuccess: () => void; }

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [step, setStep] = useState<'idle' | 'devLogin' | 'qr' | 'polling' | 'loggingIn' | 'expired' | 'error' | 'direct'>('idle');
  const [qrData, setQrData] = useState<{ code: string; authUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(0);
  // Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬ Windows Xtream credentials Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬
  // Szerkeszd a windows-credentials.json fÄ‚Ë‡jlt a sajÄ‚Ë‡t adataiddal
  let winCreds = { xtream_url: 'https://live.pusztaplay.eu', xtream_user: '', xtream_pass: '' };
  try {
    const loaded = require('../../windows-credentials.json');
    if (loaded) winCreds = loaded;
  } catch {}
  const [directServer, setDirectServer] = useState(winCreds.xtream_url);
  const [directUser, setDirectUser] = useState(winCreds.xtream_user);
  const [directPass, setDirectPass] = useState(winCreds.xtream_pass);
  const { loading: devLoading, error: devError, login: devLoginApi, reset: resetDevLogin } = useDevLogin();
  const setUser = useSetUser();
  const setPlaylist = useSetPlaylist();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  useEffect(() => () => { stopPolling(); if (timerRef.current) clearInterval(timerRef.current); }, []);

  const isTV = false;

  const fmtCode = (c: string) => {
    const s = c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return s.length <= 4 ? s : s.slice(0, Math.ceil(s.length / 2)) + ' ' + s.slice(Math.ceil(s.length / 2));
  };

  const startCountdown = () => {
    startRef.current = Date.now();
    setCountdown(300);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, 300 - Math.floor((Date.now() - startRef.current) / 1000));
      setCountdown(left);
      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setStep('expired');
        setErrorMsg('A kÄ‚Ĺ‚d lejÄ‚Ë‡rt. KÄ‚Â©rj egy Ä‚Ĺźjat.');
      }
    }, 250);
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ':' + String(sec).padStart(2, '0');
  };

  // Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬ Direct Xtream login Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬Ă˘â€ťâ‚¬
  const handleDirectLogin = async () => {
    if (!directUser || !directPass) {
      setErrorMsg('Add meg a felhasznÄ‚Ë‡lÄ‚Ĺ‚nevet Ä‚Â©s jelszÄ‚Ĺ‚t.');
      return;
    }
    setStep('loggingIn');
    setErrorMsg('');
    try {
      const { loginWithEmbeddedData } = await import('../services/embeddedData');
      const playlist = await loginWithEmbeddedData(directUser, directPass);
      // Ensure currentPlaylist is set for createPlaybackSession
      const { savePlaylistToCache, initPlaylistFromCache } = await import('../services/playlistService');
      await savePlaylistToCache(playlist);
      await initPlaylistFromCache();

      // Preserve existing apiKey from previous QR login
      let extra: { email?: string; nickname?: string; phone?: string; apiKey?: string } = {};
      try {
        const existing = await loadXtreamCredentials();
        if (existing && existing.apiKey) {
          extra = { email: existing.email, nickname: existing.nickname, phone: existing.phone, apiKey: existing.apiKey };
        }
      } catch {}

      setUser(directUser, USER_STATUS_LOGGED_IN, extra.email || '', extra.nickname || '', extra.phone || '', extra.apiKey || '');
      setPlaylist(playlist);
      saveXtreamCredentials(directUser, directPass, extra);
      onLoginSuccess();
    } catch (e: unknown) {
      setStep('error');
      setErrorMsg(e instanceof Error ? e.message : 'Xtream bejelentkezÄ‚Â©si hiba');
    }
  };

  const handleStart = async () => {
    if (step !== 'idle') return;
    setErrorMsg('');
    setStep('qr');
    try {
      const r = await requestQRCode();
      setQrData(r);
      const code = fmtCode(r.code);
      setVerifyCode(code);
      startCountdown();

      // Touchscreen: open browser for auth, poll in background
      if (!isTV) {
        try { Linking.openURL(r.authUrl); } catch {}
      }

      setStep('polling');
      pollQRCode(r.code, async (authResult) => {
        const { xtreamUser, xtreamPass, userEmail, nickname, phone, apiKey } = authResult;
        if (xtreamUser && xtreamPass) {
          setStep('loggingIn');
          try {
            const playlist = await xtreamLogin(xtreamUser, xtreamPass);
            setUser(xtreamUser, USER_STATUS_LOGGED_IN, userEmail || '', nickname || '', phone || '', apiKey || '');
            saveXtreamCredentials(xtreamUser, xtreamPass, { email: userEmail, nickname, phone, apiKey });
            setPlaylist(playlist);
            if (timerRef.current) clearInterval(timerRef.current);
            stopPolling();
            onLoginSuccess();
          } catch (e: unknown) {
            setStep('error');
            setErrorMsg('BejelentkezÄ‚Â©si hiba: ' + (e instanceof Error ? e.message : 'ismeretlen'));
          }
        }
      }, (err) => {
        setStep('error');
        setErrorMsg(err);
      });
    } catch (e: unknown) {
      setStep('direct');
    }
  };

  const handleBack = () => {
    stopPolling();
    if (timerRef.current) clearInterval(timerRef.current);
    setStep('idle');
    setQrData(null);
    setVerifyCode('');
    setErrorMsg('');
    setCountdown(0);
    resetDevLogin();
  };

  const handleRetry = () => {
    stopPolling();
    if (timerRef.current) clearInterval(timerRef.current);
    setStep('idle');
    setQrData(null);
    setErrorMsg('');
    setCountdown(0);
    setTimeout(handleStart, 100);
  };

  // Dev login
  if (step === 'devLogin') {
    return (
      <View style={s.root}>
        <DevLoginForm
          loading={devLoading}
          error={devError || errorMsg}
          onLogin={async (email, pass) => {
            setStep('loggingIn');
            const ok = await devLoginApi(email, pass);
            if (ok) {
              if (timerRef.current) clearInterval(timerRef.current);
              stopPolling();
              onLoginSuccess();
            } else {
              setStep('devLogin');
            }
          }}
          onBack={handleBack}
        />
      </View>
    );
  }

  // Direct Xtream login
  if (step === 'direct') {
    return (
      <View style={s.root}>
        <PopArtCard shadowOffset={10} borderRadius={22} borderWidth={4} contentStyle={s.cardInner}>
          <Text style={s.title}>XTREAM BELÉPÉS</Text>
          <Text style={s.subtitle}>Szerver, felhasználó, jelszó</Text>
          <View style={s.divider} />
          <View style={s.input}>
            <Text style={s.inputText}>{directServer}</Text>
          </View>
          <View style={s.input}>
            <Text style={s.inputText}>{directUser || 'Felhasználónév'}</Text>
          </View>
          <View style={s.input}>
            <Text style={s.inputText}>{directPass ? '********' : 'Jelszó'}</Text>
          </View>
          <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={handleDirectLogin}>
            <Text style={s.btnPrimaryText}>BELÉPÉS</Text>
          </TFPressable>
          {errorMsg ? <Text style={s.errText}>{'\u26A0 ' + errorMsg}</Text> : null}
          <TFPressable style={s.btnGhost} focusedStyle={s.btnGhostFocus} onPress={() => { setStep('idle'); setErrorMsg(''); }}>
            <Text style={s.btnGhostText}>VISSZA</Text>
          </TFPressable>
        </PopArtCard>
      </View>
    );
  }

  // Normal render
  return (
    <View style={s.root}>
      <View style={s.scrollInner}>
      <PopArtCard shadowOffset={10} borderRadius={22} borderWidth={4} contentStyle={s.cardInner}>
        <Text style={s.title}>PUSZTAPLAYER</Text>
        <Text style={s.subtitle}>DARK POP-ART PLAYER</Text>
        <View style={s.divider} />

        {step === 'idle' ? (
          <>
            <Text style={s.emoji}>{isTV ? '\uD83D\uDCF1' : '\uD83D\uDD10'}</Text>
            <Text style={s.desc}>
              {isTV
                ? <>A Pusztaplayer és a <Text style={s.descBold}>pusztaplay.eu</Text> szolgáltatásainak használatához be kell jelentkezned. Nincs jelszó — csak egy QR kód, amit a telefonoddal beolvasol.</>
                : <>A Pusztaplayer és a <Text style={s.descBold}>pusztaplay.eu</Text> szolgáltatásainak használatához be kell jelentkezned. Nyomd meg a gombot és jelentkezz be a böngészőben.</>
              }
            </Text>
            <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={handleStart} testID="qr-login-btn" accessibilityLabel={isTV ? 'Bejelentkezés QR kóddal' : 'Bejelentkezés'} accessibilityRole="button">
              <Text style={s.btnPrimaryText}>{isTV ? 'BEJELENTKEZÉS QR KÓDDAL' : 'BEJELENTKEZÉS'}</Text>
            </TFPressable>
            <TFPressable style={s.btnSecondary} focusedStyle={s.btnSecondaryFocus} onPress={() => setStep('direct')}>
              <Text style={s.btnSecondaryText}>Xtream adatokkal</Text>
            </TFPressable>
            {/* Dev login: visible on TV + Windows */}
            {(isTV || Platform.OS === 'windows') && (
              <TFPressable style={s.devGear} focusedStyle={s.devGearFocus} onPress={() => setStep('devLogin')} accessibilityLabel="Fejlesztői bejelentkezés" accessibilityRole="button">
                <Text style={s.devGearText}>{'\u2699'}</Text>
              </TFPressable>
            )}
            {errorMsg ? <Text style={s.errText}>{'\u26A0 ' + errorMsg}</Text> : null}
          </>
        ) : (
          <>
            {isTV ? (
              <>
                {step !== 'loggingIn' && (
                  <View style={s.dotsRow}>
                    {(['done', step === 'polling' ? 'active' : 'pending', 'pending'] as const).map((st, i) => (
                      <View key={i} style={[s.dot, st === 'done' ? s.dotDone : st === 'active' ? s.dotActive : s.dotPending]} />
                    ))}
                  </View>
                )}
                {step === 'polling' && <Text style={s.pollText}>Olvasd be a QR kódot a telefonoddal.</Text>}
                {step === 'loggingIn' && (
                  <View style={s.pollRow}><ActivityIndicator color="#f6c800" size="small" /><Text style={s.pollText}> Bejelentkezés…</Text></View>
                )}
                {step !== 'loggingIn' && qrData && (
                  <>
                    <View style={s.qrWrap}>
                      <View style={s.qrInner}>
                         <QRCode value={qrData.authUrl} size={150} backgroundColor="#fff" color="#000" />
                      </View>
                    </View>
                    {verifyCode ? <Text style={s.verifyCode}>{verifyCode}</Text> : null}
                    <Text style={[s.countdownText, countdown < 60 && s.countdownWarn]}>{'\u23F3 ' + fmtTime(countdown)}</Text>
                  </>
                )}
              </>
            ) : (
              <>
                {step !== 'loggingIn' && (
                  <View style={s.dotsRow}>
                    {(['done', step === 'polling' ? 'active' : 'pending', 'pending'] as const).map((st, i) => (
                      <View key={i} style={[s.dot, st === 'done' ? s.dotDone : st === 'active' ? s.dotActive : s.dotPending]} />
                    ))}
                  </View>
                )}
                {step === 'polling' && <>
                  <Text style={s.pollText}>Jóváhagyásra vár a böngészőben…</Text>
                  <Text style={[s.countdownText, countdown < 60 && s.countdownWarn]}>{'\u23F3 ' + fmtTime(countdown)}</Text>
                </>}
                {step !== 'loggingIn' && qrData && (
                  <>
                    <View style={s.qrWrap}>
                      <View style={s.qrInner}>
                         <QRCode value={qrData.authUrl} size={150} backgroundColor="#fff" color="#000" />
                      </View>
                    </View>
                    {verifyCode ? <Text style={s.verifyCode}>{verifyCode}</Text> : null}
                    <Text style={[s.countdownText, countdown < 60 && s.countdownWarn]}>{'\u23F3 ' + fmtTime(countdown)}</Text>
                  </>
                )}
                {step === 'loggingIn' && (
                  <View style={s.pollRow}><ActivityIndicator color="#f6c800" size="small" /><Text style={s.pollText}> Bejelentkezés…</Text></View>
                )}
              </>
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
      </PopArtCard>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  scrollInner: { flexGrow: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 40 },
  cardInner: { width: Math.min(440, Dimensions.get('window').width - 80), paddingVertical: 14, paddingHorizontal: 36, alignItems: 'center' },
  title: { color: '#f6c800', fontSize: 32, fontFamily: FONT_FAMILY_BANGERS, letterSpacing: 3, textShadowColor: '#000', textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
  subtitle: { color: '#555', fontSize: 8, fontFamily: FONT_FAMILY_POPPINS_BOLD, letterSpacing: 3, textTransform: 'uppercase', marginTop: 2 },
  divider: { height: 2, backgroundColor: '#1a1a1a', alignSelf: 'stretch', marginVertical: 8 },
  emoji: { fontSize: 48, marginBottom: 4 },
  desc: { color: '#999', fontSize: 11, fontFamily: FONT_FAMILY_POPPINS, lineHeight: 16, textAlign: 'center', marginBottom: 8 },
  descBold: { color: '#fff', fontFamily: FONT_FAMILY_POPPINS_BOLD },
  btnPrimary: { backgroundColor: '#f6c800', borderRadius: 12, borderWidth: 3, borderColor: '#000', paddingVertical: 8, paddingHorizontal: 24, alignSelf: 'stretch', alignItems: 'center' },
  btnPrimaryFocus: { backgroundColor: '#1fd6e8' },
  btnPrimaryText: { color: '#000', fontSize: 11, fontFamily: FONT_FAMILY_POPPINS_BOLD, letterSpacing: 1, textTransform: 'uppercase' },
  btnGhost: { backgroundColor: 'transparent', borderRadius: 12, borderWidth: 3, borderColor: '#1a1a1a', paddingVertical: 7, paddingHorizontal: 24, alignSelf: 'stretch', alignItems: 'center', marginTop: 6 },
  btnGhostFocus: { borderColor: '#f6c800', backgroundColor: 'rgba(246,200,0,0.08)' },
  btnGhostText: { color: '#888', fontSize: 11, fontFamily: FONT_FAMILY_POPPINS_BOLD, letterSpacing: 1 },
  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotDone: { backgroundColor: '#1fd6e8' },
  dotActive: { backgroundColor: '#f6c800', shadowColor: '#f6c800', shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 1, elevation: 8 },
  dotPending: { backgroundColor: '#333' },
  pollText: { color: '#1fd6e8', fontSize: 11, fontFamily: FONT_FAMILY_POPPINS_BOLD, marginBottom: 8 },
  pollRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  qrWrap: { backgroundColor: '#0d0d0d', borderRadius: 14, borderWidth: 2, borderColor: '#1a1a1a', padding: 12, marginBottom: 6 },
  qrInner: { padding: 5, backgroundColor: '#fff', borderRadius: 10, borderWidth: 3, borderColor: '#000' },
  verifyCode: { color: '#f6c800', fontSize: 12, fontFamily: FONT_FAMILY_POPPINS_BOLD, letterSpacing: 6, marginBottom: 4 },
  countdownText: { color: '#666', fontSize: 9, fontFamily: FONT_FAMILY_POPPINS },
  countdownWarn: { color: '#f6c800', fontFamily: FONT_FAMILY_POPPINS_BOLD },
  errText: { color: '#ff4d57', fontSize: 11, fontFamily: FONT_FAMILY_POPPINS_BOLD, marginTop: 8, textAlign: 'center' },
  devGear: { position: 'absolute', bottom: 10, right: 10, width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
  devGearFocus: { backgroundColor: '#f6c800' },
  devGearText: { color: '#444', fontSize: 16 },
  btnSecondary: { backgroundColor: 'transparent', borderRadius: 12, borderWidth: 1, borderColor: '#333', paddingVertical: 6, paddingHorizontal: 20, alignSelf: 'stretch', alignItems: 'center', marginTop: 4 },
  btnSecondaryFocus: { borderColor: '#f6c800' },
  btnSecondaryText: { color: '#666', fontSize: 10, fontFamily: FONT_FAMILY_POPPINS, letterSpacing: 1 },
  input: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 10, marginBottom: 6, alignSelf: 'stretch', minHeight: 36, borderWidth: 1, borderColor: '#333', justifyContent: 'center' },
  inputText: { color: '#fff', fontSize: 12, fontFamily: FONT_FAMILY_POPPINS },
});

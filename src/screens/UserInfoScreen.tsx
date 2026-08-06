import React, { memo, useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';
import TFPressable from '../components/TFPressable';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import { useCore, useProfiles, useSetActiveProfile, useActiveProfile } from '../store/AppContext';
import { xtreamGetUserInfo, XtreamUserFullInfo } from '../services/xtreamApi';
import { loadXtreamCredentials } from '../services/storage';
import { getSessionToken } from '../services/liveProxy';
import { COLORS, FONT, SPACING, SCREEN_WIDTH } from '../constants';
import { useHardwareBack } from '../hooks/useHardwareBack';

interface UserInfoScreenProps { onBack: () => void; onLogout?: () => void; }

const CARD_W = Math.min(530, SCREEN_WIDTH - 60);

function CardBg() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#060810', '#0c0f20', '#151430']}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="uidots" x="0" y="0" width={10} height={10} patternUnits="userSpaceOnUse">
            <Circle cx={5} cy={5} r={2} fill="#2a2550" opacity={0.35} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#uidots)" />
      </Svg>
    </View>
  );
}

export default function UserInfoScreen({ onBack, onLogout }: UserInfoScreenProps) {
  const { state: { user } } = useCore();
  const profiles = useProfiles();
  const activeProfile = useActiveProfile();
  const setActiveProfile = useSetActiveProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<XtreamUserFullInfo | null>(null);

  const sessionToken = useMemo(() => {
    try { return getSessionToken(); } catch { return null; }
  }, []);

  useHardwareBack(onBack, [onBack]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const creds = await loadXtreamCredentials();
        if (!creds) { setError('Nincs bejelentkezve.'); setLoading(false); return; }
        const data = await xtreamGetUserInfo(creds.username, creds.password);
        if (!c) setInfo(data);
      } catch (e: unknown) {
        if (!c) setError(e instanceof Error ? e.message : 'Hiba');
      }
      if (!c) setLoading(false);
    })();
    return () => { c = true; };
  }, []);

  const formatDate = (raw: string) => {
    if (!raw) return '\u2014';
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      return new Date(n < 1e10 ? n * 1000 : n).toLocaleDateString('hu-HU');
    }
    return raw;
  };

  const getSubStatus = (): { label: string; bg: string; text: string; border: string } => {
    if (!info?.exp_date) return { label: 'INAKTÍV', bg: COLORS.statusRed, text: COLORS.statusRedText, border: COLORS.statusRedBorder };
    const exp = /^\d+$/.test(info.exp_date) ? (Number(info.exp_date) < 1e10 ? Number(info.exp_date) * 1000 : Number(info.exp_date)) : Date.parse(info.exp_date);
    if (isNaN(exp)) return { label: 'INAKTÍV', bg: COLORS.statusRed, text: COLORS.statusRedText, border: COLORS.statusRedBorder };
    const daysLeft = (exp - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 0) return { label: 'LEJÁRT', bg: COLORS.statusRed, text: COLORS.statusRedText, border: COLORS.statusRedBorder };
    if (daysLeft < 7) return { label: 'HAMAROSAN LEJÁR', bg: '#e65100', text: '#ffe0b2', border: '#ef6c00' };
    return { label: 'AKTÍV', bg: COLORS.statusGreen, text: '#a5d6a7', border: '#2e7d32' };
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.yellow} /></View>;
  if (error) return (
    <View style={s.center}>
      <Text style={s.errText}>{error}</Text>
      <TFPressable style={s.backBtn} focusedStyle={s.backBtnFoc} onPress={onBack} accessibilityLabel="Vissza">
        <Text style={s.backBtnText}>{'\u2190'} Vissza</Text>
      </TFPressable>
    </View>
  );

  const status = getSubStatus();
  const nick = user.nickname || info?.username || '\u2014';
  const expiry = formatDate(info?.exp_date || '');
  const sessionShort = sessionToken ? sessionToken.slice(0, 12) + '\u2026' : '\u2014';

  return (
    <View style={s.root}>
      <CardBg />
      <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
        <RuggedBorder color={COLORS.cyan} wobbleFactor={0.7}>
          <View style={[s.card, { width: CARD_W, position: 'relative', overflow: 'visible' }]}>
            <Text style={s.title}>FIÓK</Text>
            <Text style={s.subtitle}>SZEMÉLYES ADATOK & ELŐFIZETÉS</Text>
            <View style={s.divider} />

            <View style={s.columns}>
              <View style={s.column}>
                <Text style={s.sectionHeader}>ADATAID</Text>
                <View style={s.sectionDivider} />
                <Row label="E-mail" value={user.email || info?.username || '\u2014'} />
                <Row label="Becenév" value={nick} />
                <Row label="Felhaszn." value={(info?.username || '\u2014') + (info?.password ? ' \u2022\u2022\u2022\u2022\u2022' : '')} mono />
                <View style={s.sectionDivider} />
                <Row label="Session" value={sessionShort} />
                <Row label="Session aktív" value="24 óra" />
              </View>

              <View style={s.column}>
                <Text style={s.sectionHeader}>ELŐFIZETÉS</Text>
                <View style={s.sectionDivider} />
                <Row label="Csomag" value={'\u2014'} />
                <View style={s.row}>
                  <Text style={s.label}>Státusz</Text>
                  <View style={[s.badge, { backgroundColor: status.bg, borderColor: status.border }]}>
                    <Text style={[s.badgeText, { color: status.text }]}>{status.label}</Text>
                  </View>
                </View>
                <Row label="Lejárat" value={expiry} />
                <Row label="Regisztráció" value={formatDate(info?.created_at || '')} />
                <Row label="Aktív kapcs." value={info?.active_cons || '0'} />
                <Row label="Max kapcs." value={info?.max_connections || '0'} />
              </View>
            </View>

            <View style={s.divider} />

            {profiles.length > 1 && (
              <>
                <Text style={[s.sectionHeader, { marginBottom: 4 }]}>PROFILOK</Text>
                <View style={s.sectionDivider} />
                <View style={s.profileRow}>
                  {profiles.map(p => {
                    const isActive = activeProfile?.id === p.id;
                    return (
                      <TFPressable
                        key={p.id}
                        style={[s.profileChip, isActive && s.profileChipActive]}
                        focusedStyle={s.profileChipFocus}
                        onPress={() => setActiveProfile(p.id)}
                        accessibilityLabel={`${p.name} profil`}
                        accessibilityRole="button"
                      >
                        <View style={[s.miniAvatar, { backgroundColor: p.color || COLORS.yellow }]}>
                          <Text style={s.miniAvatarText}>{p.avatar || (p.name || 'P')[0]}</Text>
                        </View>
                        <Text style={[s.profileChipName, isActive && s.profileChipNameActive]} numberOfLines={1}>{p.name}</Text>
                        {isActive && <Text style={s.check}>{'\u2713'}</Text>}
                      </TFPressable>
                    );
                  })}
                </View>
              </>
            )}

            {onLogout && (
              <>
                <View style={[s.divider, { marginBottom: 4 }]} />
                <TFPressable
                  style={s.logoutBtn}
                  focusedStyle={s.logoutBtnFoc}
                  onPress={onLogout}
                  accessibilityLabel="Kijelentkezés"
                  accessibilityRole="button"
                >
                  <Text style={s.logoutBtnText}>KIJELENTKEZÉS</Text>
                </TFPressable>
              </>
            )}

            <SoundEffect text="AKTÍV!" textColor={COLORS.yellow} bgColor={COLORS.red} top={-8} right={-18} rotate={15} fontSize={14} />
            <SoundEffect text="BYE!" textColor={COLORS.red} bgColor={COLORS.yellow} bottom={-16} left={-14} rotate={-10} fontSize={14} />
          </View>
        </RuggedBorder>
      </ScrollView>
    </View>
  );
}

const Row = memo(function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, mono && s.valueMono]} numberOfLines={1}>{value}</Text>
    </View>
  );
});

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 20 },
  scroll: { paddingVertical: 24, paddingHorizontal: SPACING.md, alignItems: 'center' },
  card: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(10,10,20,0.92)',
    borderRadius: 8,
    overflow: 'visible',
  },
  title: { color: COLORS.yellow, fontSize: 22, fontFamily: 'Bangers-Regular', letterSpacing: 3, textShadowColor: COLORS.black, textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
  subtitle: { color: '#555', fontSize: 8, fontFamily: 'Poppins-Bold', letterSpacing: 3, textTransform: 'uppercase', marginTop: 1 },
  divider: { height: 2, backgroundColor: '#1a1a1a', alignSelf: 'stretch', marginVertical: 5 },
  columns: { flexDirection: 'row', gap: 20 },
  column: { flex: 1 },
  sectionHeader: { color: '#555', fontSize: 8, fontFamily: 'Poppins-Bold', letterSpacing: 2, textTransform: 'uppercase' },
  sectionDivider: { height: 1, backgroundColor: '#1a1a1a', alignSelf: 'stretch', marginBottom: 3, marginTop: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  label: { color: '#777', fontSize: 10, fontFamily: 'Poppins-Regular' },
  value: { color: COLORS.text, fontSize: 8, fontFamily: 'Poppins-Bold', textAlign: 'right', maxWidth: '55%' },
  valueMono: { fontSize: 8, fontFamily: 'monospace', backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 8, fontFamily: 'Poppins-Bold', letterSpacing: 0.5 },
  errText: { color: COLORS.red, fontSize: 11, fontFamily: 'Poppins-Bold', marginBottom: 6 },
  backBtn: { backgroundColor: '#222', borderRadius: 10, borderWidth: 2, borderColor: COLORS.black, paddingVertical: 4, paddingHorizontal: 12 },
  backBtnFoc: { backgroundColor: COLORS.yellow },
  backBtnText: { color: COLORS.text, fontSize: 11, fontFamily: 'Poppins-Bold' },
  profileRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  profileChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#1a1a1a', borderRadius: 8, borderWidth: 1, borderColor: 'transparent', paddingVertical: 3, paddingHorizontal: 5 },
  profileChipActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.black },
  profileChipFocus: { borderColor: COLORS.cyan },
  miniAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.black },
  miniAvatarText: { color: COLORS.black, fontSize: 9, fontFamily: 'Bangers-Regular' },
  profileChipName: { color: COLORS.text, fontSize: 9, fontFamily: 'Poppins-Bold' },
  profileChipNameActive: { color: COLORS.black },
  check: { color: COLORS.statusGreen, fontSize: 11, fontWeight: '800' },
  logoutBtn: { backgroundColor: COLORS.statusRed, borderRadius: 10, borderWidth: 2, borderColor: COLORS.black, paddingVertical: 6, paddingHorizontal: 6, alignSelf: 'center', alignItems: 'center' },
  logoutBtnFoc: { backgroundColor: '#ff4d57' },
  logoutBtnText: { color: COLORS.text, fontSize: 10, fontFamily: 'Poppins-Bold', letterSpacing: 1 },
});

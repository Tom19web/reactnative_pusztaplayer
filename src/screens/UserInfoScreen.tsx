import React, { memo, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, BackHandler, Dimensions } from 'react-native';
import TFPressable from '../components/TFPressable';
import PopArtCard from '../components/PopArtCard';
import { useCore, useProfiles, useSetActiveProfile, useActiveProfile } from '../store/AppContext';
import { xtreamGetUserInfo, XtreamUserFullInfo } from '../services/xtreamApi';
import { loadXtreamCredentials } from '../services/storage';

interface UserInfoScreenProps { onBack: () => void; onLogout?: () => void; }

export default function UserInfoScreen({ onBack, onLogout }: UserInfoScreenProps) {
  const { state: { user } } = useCore();
  const profiles = useProfiles();
  const activeProfile = useActiveProfile();
  const setActiveProfile = useSetActiveProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<XtreamUserFullInfo | null>(null);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => h.remove();
  }, [onBack]);

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
    if (!info?.exp_date) return { label: 'INAKTÍV', bg: '#b71c1c', text: '#ef9a9a', border: '#c62828' };
    const exp = /^\d+$/.test(info.exp_date) ? (Number(info.exp_date) < 1e10 ? Number(info.exp_date) * 1000 : Number(info.exp_date)) : Date.parse(info.exp_date);
    if (isNaN(exp)) return { label: 'INAKTÍV', bg: '#b71c1c', text: '#ef9a9a', border: '#c62828' };
    const daysLeft = (exp - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 0) return { label: 'LEJÁRT', bg: '#b71c1c', text: '#ef9a9a', border: '#c62828' };
    if (daysLeft < 7) return { label: 'HAMAROSAN LEJÁR', bg: '#e65100', text: '#ffe0b2', border: '#ef6c00' };
    return { label: 'AKTÍV', bg: '#1b5e20', text: '#a5d6a7', border: '#2e7d32' };
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#f6c800" /></View>;
  if (error) return <View style={s.center}><Text style={s.errText}>{error}</Text><TFPressable style={s.backBtn} focusedStyle={s.backBtnFoc} onPress={onBack} accessibilityLabel="Vissza"><Text style={s.backBtnText}>{'\u2190'} Vissza</Text></TFPressable></View>;

  const status = getSubStatus();
  const nick = user.nickname || info?.username || '\u2014';
  const subPackage = '\u2014'; // Xtream API does not expose package name
  const expiry = formatDate(info?.exp_date || '');

  return (
    <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
      <PopArtCard shadowOffset={5} borderRadius={11} borderWidth={2} contentStyle={s.cardInner}>
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
          </View>

          <View style={s.column}>
            <Text style={s.sectionHeader}>ELŐFIZETÉS</Text>
            <View style={s.sectionDivider} />
            <Row label="Csomag" value={subPackage} />
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
                    <View style={[s.miniAvatar, { backgroundColor: p.color || '#ffcc00' }]}>
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
      </PopArtCard>
    </ScrollView>
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
  scroll: { paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' },
  cardInner: { width: Math.min(530, Dimensions.get('window').width - 60), paddingVertical: 8, paddingHorizontal: 20 },
  title: { color: '#f6c800', fontSize: 27, fontFamily: 'Bangers-Regular', letterSpacing: 3, textShadowColor: '#000', textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
  subtitle: { color: '#555', fontSize: 8, fontFamily: 'Poppins-Bold', letterSpacing: 3, textTransform: 'uppercase', marginTop: 1 },
  divider: { height: 2, backgroundColor: '#1a1a1a', alignSelf: 'stretch', marginVertical: 5 },
  columns: { flexDirection: 'row', gap: 20 },
  column: { flex: 1 },
  sectionHeader: { color: '#555', fontSize: 8, fontFamily: 'Poppins-Bold', letterSpacing: 2, textTransform: 'uppercase' },
  sectionDivider: { height: 1, backgroundColor: '#1a1a1a', alignSelf: 'stretch', marginBottom: 3, marginTop: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  label: { color: '#777', fontSize: 10, fontFamily: 'Poppins-Regular' },
  value: { color: '#fff', fontSize: 10, fontFamily: 'Poppins-Bold', textAlign: 'right', maxWidth: '55%' },
  valueMono: { fontSize: 9, fontFamily: 'monospace', backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 8, fontFamily: 'Poppins-Bold', letterSpacing: 0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', padding: 20 },
  errText: { color: '#ff4d57', fontSize: 11, fontFamily: 'Poppins-Bold', marginBottom: 6 },
  backBtn: { backgroundColor: '#222', borderRadius: 10, borderWidth: 2, borderColor: '#000', paddingVertical: 4, paddingHorizontal: 12 },
  backBtnFoc: { backgroundColor: '#f6c800' },
  backBtnText: { color: '#fff', fontSize: 11, fontFamily: 'Poppins-Bold' },
  profileRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  profileChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#1a1a1a', borderRadius: 8, borderWidth: 1, borderColor: 'transparent', paddingVertical: 3, paddingHorizontal: 5 },
  profileChipActive: { backgroundColor: '#f6c800', borderColor: '#000' },
  profileChipFocus: { borderColor: '#1fd6e8' },
  miniAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#000' },
  miniAvatarText: { color: '#000', fontSize: 9, fontFamily: 'Bangers-Regular' },
  profileChipName: { color: '#fff', fontSize: 9, fontFamily: 'Poppins-Bold' },
  profileChipNameActive: { color: '#000' },
  check: { color: '#1b5e20', fontSize: 11, fontWeight: '800' },
  logoutBtn: { backgroundColor: '#b71c1c', borderRadius: 10, borderWidth: 2, borderColor: '#000', paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'stretch', alignItems: 'center' },
  logoutBtnFoc: { backgroundColor: '#ff4d57' },
  logoutBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Poppins-Bold', letterSpacing: 1 },
});

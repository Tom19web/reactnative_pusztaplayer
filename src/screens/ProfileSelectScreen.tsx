import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, BackHandler, Dimensions, DeviceEventEmitter, ImageBackground } from 'react-native';
import TFPressable from '../components/TFPressable';
import PopArtCard from '../components/PopArtCard';
import { Profile, useCore, useProfiles, useActiveProfile, useSetActiveProfile, useSetProfiles } from '../store/AppContext';
import { deleteProfile as wpDeleteProfile, restoreProfile as wpRestoreProfile } from '../services/wordpressSync';

const COLORS_PRESET = ['#f6c800', '#1fd6e8', '#ff5b63', '#7c4dff'];
const AVATARS = ['\uD83D\uDE0E', '\uD83E\uDD8A', '\uD83D\uDC3A', '\uD83E\uDD85', '\uD83D\uDC0E', '\uD83D\uDD25', '\u2B50', '\uD83C\uDFAD', '\uD83D\uDC51', '\uD83D\uDC80', '\uD83E\uDD20', '\uD83E\uDDD9'];
const SZUPERHOS_NEVEK = [
  'PusztaPuma', 'TüskeTigris', 'HomokHéja', 'BetyárBölény', 'GulyásGriff',
  'CsárdaCápa', 'MénesMedve', 'DélibábDémon', 'SzilajSólyom', 'RónaRóka',
  'PusztaPárduc', 'BoglyaBajnok', 'GémesGólya', 'KunságKobra', 'TanyaTroll',
  'CsikósCiklon', 'BárányBáró', 'HortobágyHős', 'SzikesSzellem', 'NádasNindzsa',
];
const MAX_PROFILES = 3;

interface Props { onProfileSelected: () => void; }

export default function ProfileSelectScreen({ onProfileSelected }: Props) {
  const profiles = useProfiles() as Profile[];
  const activeProfile = useActiveProfile();
  const activeId = activeProfile?.id || '';
  const setActive = useSetActiveProfile();
  const setProfiles = useSetProfiles();
  const { state: { user } } = useCore();
  const [wizard, setWizard] = useState(false);
  const [wizStep, setWizStep] = useState(0);
  const [wizName, setWizName] = useState('');
  const [wizColor, setWizColor] = useState(COLORS_PRESET[0]);
  const [wizAvatar, setWizAvatar] = useState(AVATARS[0]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [focusedProfile, setFocusedProfile] = useState<string | null>(null);

  // Menu button -> delete focused profile
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onHWKeyEvent', (ev: { eventType: string; eventKeyAction: number }) => {
      if (ev.eventType === 'menu' && ev.eventKeyAction === 0 && focusedProfile && !wizard && !confirmDelete) {
        setDeleteTarget(focusedProfile);
        setConfirmDelete(true);
      }
    });
    return () => sub.remove();
  }, [focusedProfile, wizard, confirmDelete]);

  // Back button handler — wraps mutable deps in ref to keep listener stable
  const wizardRef = useRef(wizard);
  const confirmDeleteRef = useRef(confirmDelete);
  wizardRef.current = wizard;
  confirmDeleteRef.current = confirmDelete;
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (wizardRef.current) { resetWizard(); return true; }
      if (confirmDeleteRef.current) { setConfirmDelete(false); setDeleteTarget(null); return true; }
      return false;
    });
    return () => handler.remove();
  }, []);

  const resetWizard = () => { setWizard(false); setWizStep(0); setWizName(''); setWizColor(COLORS_PRESET[0]); setWizAvatar(AVATARS[0]); };
  const genRandomName = () => setWizName(SZUPERHOS_NEVEK[Math.floor(Math.random() * SZUPERHOS_NEVEK.length)]);

  const handleSelect = (id: string) => { setActive(id); onProfileSelected(); };

  const handleCreate = () => {
    const name = wizName.trim() || 'Új profil';
    const id = 'prof_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newProfile: Profile = {
      id, name, color: wizColor, avatar: wizAvatar,
      preferences: { live: [], movies: [], series: [] },
      favorites: [], watch_later: [], watch_progress: [],
    };
    const updated = [...(profiles || []), newProfile];
    setProfiles(updated);
    setActive(id);
    resetWizard();
    onProfileSelected();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const updated = (profiles || []).map(p =>
      p.id === deleteTarget ? { ...p, deleted: true, deletedAt: Date.now() } : p
    );
    setProfiles(updated);
    await wpDeleteProfile(user.apiKey, deleteTarget);
    setDeleting(false);
    setConfirmDelete(false);
    setDeleteTarget(null);
  };

  const handleRestore = async (id: string) => {
    const updated = (profiles || []).map(p =>
      p.id === id ? { ...p, deleted: false, deletedAt: undefined } : p
    );
    setProfiles(updated);
    await wpRestoreProfile(user.apiKey, id);
  };

  // Wizard
  if (wizard) {
    return (
      <ImageBackground source={require('../../assets/splash-bg.png')} style={s.root} resizeMode="cover">
        <PopArtCard shadowOffset={10} borderRadius={22} borderWidth={4} contentStyle={s.cardWizard}>
          <Text style={s.title}>ÚJ PROFIL</Text>
          <Text style={s.subtitle}>3 LÉPÉS A SZEMÉLYRE SZABÁSIG</Text>
          <View style={s.divider} />

          {/* Step dots */}
          <View style={s.dotsRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[s.dot, i < wizStep ? s.dotDone : i === wizStep ? s.dotActive : s.dotPending]} />
            ))}
          </View>

          {wizStep === 0 && (
            <>
              <Text style={s.stepLabel}>ADD NEVET A PROFILODNAK</Text>
              <TextInput style={s.input} placeholder="pl. Batman, PusztaPuma..." placeholderTextColor="#555" value={wizName} onChangeText={setWizName} accessibilityLabel="Profil név" />
              <TFPressable style={s.btnDice} focusedStyle={s.btnDiceFocus} onPress={genRandomName} accessibilityLabel="Véletlen név" accessibilityRole="button">
                <Text style={s.btnDiceText}>{'\uD83C\uDFB2'} VÉLETLEN NÉV</Text>
              </TFPressable>
            </>
          )}
          {wizStep === 1 && (
            <>
              <Text style={s.stepLabel}>VÁLASSZ SZÍNT</Text>
              <View style={s.colorRow}>
                {COLORS_PRESET.map(c => (
                  <TFPressable key={c} style={[s.colorBtn, { backgroundColor: c }, wizColor === c && s.colorBtnActive]} focusedStyle={s.colorBtnActive} onPress={() => setWizColor(c)} accessibilityLabel={`Szín: ${c}`} accessibilityRole="button" />
                ))}
              </View>
            </>
          )}
          {wizStep === 2 && (
            <>
              <Text style={s.stepLabel}>VÁLASSZ AVATÁRT</Text>
              <View style={s.avatarGrid}>
                {AVATARS.map(a => (
                  <TFPressable key={a} style={[s.avatarBtn, wizAvatar === a && s.avatarBtnActive]} focusedStyle={s.avatarBtnFocus} onPress={() => setWizAvatar(a)} accessibilityLabel={`Avatár: ${a}`} accessibilityRole="button">
                    <Text style={s.avatarText}>{a}</Text>
                  </TFPressable>
                ))}
              </View>
            </>
          )}

          <View style={s.wizActions}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {wizStep > 0 && (
                <TFPressable style={s.btnSecondary} focusedStyle={s.btnSecondaryFocus} onPress={() => setWizStep(s => s - 1)} accessibilityLabel="Vissza"><Text style={s.btnSecondaryText}>{'\u2190'} VISSZA</Text></TFPressable>
              )}
              {wizStep < 2 ? (
                <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={() => setWizStep(s => s + 1)} accessibilityLabel="Tovább"><Text style={s.btnPrimaryText}>TOVÁBB {'\u2192'}</Text></TFPressable>
              ) : (
                <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={handleCreate} accessibilityLabel="Létrehozás"><Text style={s.btnPrimaryText}>LÉTREHOZÁS {'\u2728'}</Text></TFPressable>
              )}
            </View>
          </View>
        </PopArtCard>
      </ImageBackground>
    );
  }

  // Grid
  return (
    <ImageBackground source={require('../../assets/splash-bg.png')} style={s.root} resizeMode="cover">
      <View style={s.gridHeader}>
        <Text style={s.title}>PROFILOK</Text>
        <Text style={s.subtitle}>KIVEL NÉZNÉD MA A PUSZTAPLAYERT?</Text>
      </View>

      {confirmDelete && (
        <View style={s.confirmBar}>
          <Text style={s.confirmText}>BIZTOSAN TÖRLÖD EZT A PROFILT?</Text>
          <View style={s.confirmBtns}>
            <TFPressable style={s.confirmNo} focusedStyle={s.confirmNoFocus} onPress={() => { setConfirmDelete(false); setDeleteTarget(null); }} accessibilityLabel="Mégse"><Text style={s.confirmNoText}>MÉGSE</Text></TFPressable>
            <TFPressable style={s.confirmYes} focusedStyle={s.confirmYesFocus} onPress={handleDeleteConfirm} accessibilityLabel="Törlés" disabled={deleting}><Text style={s.confirmYesText}>{deleting ? '...' : 'TÖRLÉS'}</Text></TFPressable>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={s.gridScroll} nestedScrollEnabled>
        {(() => { const activeProfs = profiles.filter(p => !p.deleted); return activeProfs.length === 0 ? (
          <PopArtCard shadowOffset={8} borderRadius={18} borderWidth={3} contentStyle={s.emptyCard}>
            <Text style={s.emptyTitle}>Még nincs profilod.</Text>
            <Text style={s.emptySub}>Hozz létre egyet!</Text>
            <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={() => setWizard(true)} accessibilityLabel="Profil létrehozása" accessibilityRole="button">
              <Text style={s.btnPrimaryText}>PROFIL LÉTREHOZÁSA</Text>
            </TFPressable>
          </PopArtCard>
        ) : (
          <View style={s.profileGrid}>
            {activeProfs.map(p => {
              const isActive = activeId === p.id;
              const isFocused = focusedProfile === p.id;
              return (
                <TFPressable
                  key={p.id}
                  style={[s.profileCardOuter, isFocused && s.profileCardFocusWrap]}
                  focusedStyle={{}}
                  onPress={() => handleSelect(p.id)}
                  onFocus={() => setFocusedProfile(p.id)}
                  onBlur={() => setFocusedProfile(null)}
                  accessibilityLabel={`${p.name} profil${isActive ? ', aktív' : ''}`}
                  accessibilityRole="button"
                >
                  <PopArtCard shadowOffset={6} borderRadius={16} borderWidth={3} focused={isFocused && !isActive} contentStyle={[s.profileCard, isActive && s.profileCardActive]}>
                    <Text style={s.profileAvatar}>{p.avatar || '\uD83D\uDE0E'}</Text>
                    <Text style={s.profileName}>{p.name}</Text>
                    {isActive && <Text style={s.activeTag}>{'\u2726'} AKTÍV</Text>}
                  </PopArtCard>
                </TFPressable>
              );
            })}
            {activeProfs.length < MAX_PROFILES && (
              <TFPressable style={s.addCard} focusedStyle={s.addCardFocus} onPress={() => setWizard(true)} accessibilityLabel="Új profil létrehozása" accessibilityRole="button">
                <Text style={s.addText}>+</Text>
              </TFPressable>
            )}
          </View>
        ); })() }
        {(() => { const deletedProfs = profiles.filter(p => p.deleted); return deletedProfs.length > 0 ? (
          <View style={{ marginTop: 24, width: '100%', maxWidth: 600 }}>
            <Text style={{ color: '#555', fontSize: 12, fontFamily: 'Poppins-Bold', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, textAlign: 'center' }}>Törölt profilok</Text>
            <View style={s.profileGrid}>
              {deletedProfs.map(p => (
                <TFPressable
                  key={p.id}
                  style={[s.restoreCardWrap]}
                  focusedStyle={s.restoreCardFocus}
                  onPress={() => handleRestore(p.id)}
                  accessibilityLabel={`${p.name} visszaállítása`}
                  accessibilityRole="button"
                >
                  <PopArtCard shadowOffset={4} borderRadius={12} borderWidth={2} contentStyle={s.restoreCard}>
                    <Text style={{ fontSize: 36, opacity: 0.3, marginBottom: 4 }}>{p.avatar || '\uD83D\uDE0E'}</Text>
                    <Text style={{ color: '#555', fontSize: 11, fontFamily: 'Poppins-Bold', textAlign: 'center' }}>{p.name}</Text>
                    <Text style={{ color: '#1fd6e8', fontSize: 8, fontFamily: 'Poppins-Bold', marginTop: 4, textTransform: 'uppercase' }}>Visszaállítás</Text>
                  </PopArtCard>
                </TFPressable>
              ))}
            </View>
          </View>
        ) : null; })() }
      </ScrollView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', padding: 20 },
  gridHeader: { alignItems: 'center', marginBottom: 16 },
  title: { color: '#f6c800', fontSize: 42, fontFamily: 'Bangers-Regular', letterSpacing: 3, textShadowColor: '#000', textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
  subtitle: { color: '#555', fontSize: 10, fontFamily: 'Poppins-Bold', letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 },
  divider: { height: 2, backgroundColor: '#1a1a1a', alignSelf: 'stretch', marginVertical: 14 },

  confirmBar: { backgroundColor: '#b71c1c', borderRadius: 12, borderWidth: 3, borderColor: '#000', paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, alignSelf: 'stretch' },
  confirmText: { color: '#fff', fontSize: 15, fontFamily: 'Poppins-Bold', flex: 1 },
  confirmBtns: { flexDirection: 'row', gap: 8 },
  confirmNo: { backgroundColor: '#222', borderRadius: 10, borderWidth: 3, borderColor: '#000', paddingVertical: 8, paddingHorizontal: 16 },
  confirmNoFocus: { backgroundColor: '#444' },
  confirmNoText: { color: '#fff', fontSize: 13, fontFamily: 'Poppins-Bold' },
  confirmYes: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 3, borderColor: '#000', paddingVertical: 8, paddingHorizontal: 16 },
  confirmYesFocus: { backgroundColor: '#f6c800' },
  confirmYesText: { color: '#000', fontSize: 13, fontFamily: 'Poppins-Bold' },

  gridScroll: { alignItems: 'center', paddingBottom: 40, paddingTop: 8 },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, maxWidth: 600 },
  profileCard: { width: 170, minHeight: 130, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center' },
  profileCardActive: { borderColor: '#f6c800' },
  profileCardOuter: {},
  profileCardFocusWrap: { transform: [{ translateY: -4 }] },
  profileAvatar: { fontSize: 52, marginBottom: 8 },
  profileName: { color: '#fff', fontSize: 15, fontFamily: 'Poppins-Bold', textAlign: 'center', marginBottom: 6 },
  activeTag: { color: '#f6c800', fontSize: 10, fontFamily: 'Poppins-Bold', letterSpacing: 1, textTransform: 'uppercase' },
  addCard: { width: 170, minHeight: 130, borderRadius: 16, borderWidth: 3, borderColor: '#222', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addCardFocus: { borderColor: '#ffcc00', borderStyle: 'solid' as 'solid', transform: [{ translateY: -4 }] },
  addText: { color: '#333', fontSize: 44, fontFamily: 'Bangers-Regular' },
  emptyCard: { width: Math.min(400, Dimensions.get('window').width - 120), paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center' },
  emptyTitle: { color: '#fff', fontSize: 18, fontFamily: 'Poppins-Bold', textAlign: 'center' },
  emptySub: { color: '#777', fontSize: 14, fontFamily: 'Poppins-Regular', marginBottom: 24, marginTop: 6 },

  cardWizard: { width: Math.min(440, Dimensions.get('window').width - 120), paddingVertical: 24, paddingHorizontal: 28, alignItems: 'center' },
  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotDone: { backgroundColor: '#1fd6e8' },
  dotActive: { backgroundColor: '#f6c800', shadowColor: '#f6c800', shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 1, elevation: 8 },
  dotPending: { backgroundColor: '#333' },
  stepLabel: { color: '#888', fontSize: 12, fontFamily: 'Poppins-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  input: { alignSelf: 'stretch', backgroundColor: '#0d0d0d', borderRadius: 10, borderWidth: 3, borderColor: '#1a1a1a', paddingVertical: 14, paddingHorizontal: 16, color: '#fff', fontSize: 16, fontFamily: 'Poppins-Regular', marginBottom: 12 },
  btnDice: { alignSelf: 'stretch', backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  btnDiceFocus: { backgroundColor: '#333' },
  btnDiceText: { color: '#999', fontSize: 13, fontFamily: 'Poppins-Bold' },
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  colorBtn: { width: 68, height: 68, borderRadius: 14, borderWidth: 3, borderColor: 'transparent' },
  colorBtnActive: { borderColor: '#fff', transform: [{ scale: 1.1 }] },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 8 },
  avatarBtn: { width: 56, height: 56, borderRadius: 12, borderWidth: 2, borderColor: '#222', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  avatarBtnActive: { borderColor: '#f6c800', backgroundColor: 'rgba(246,200,0,0.12)' },
  avatarBtnFocus: { borderColor: '#1fd6e8' },
  avatarText: { fontSize: 36 },

  wizActions: { flexDirection: 'row', justifyContent: 'center', alignSelf: 'stretch', marginTop: 16 },
  btnPrimary: { backgroundColor: '#f6c800', borderRadius: 12, borderWidth: 3, borderColor: '#000', paddingVertical: 10, paddingHorizontal: 24, alignItems: 'center' },
  btnPrimaryFocus: { backgroundColor: '#1fd6e8' },
  btnPrimaryText: { color: '#000', fontSize: 14, fontFamily: 'Poppins-Bold', letterSpacing: 1, textTransform: 'uppercase' },
  btnSecondary: { backgroundColor: '#222', borderRadius: 12, borderWidth: 3, borderColor: '#000', paddingVertical: 10, paddingHorizontal: 24, alignItems: 'center' },
  btnSecondaryFocus: { backgroundColor: '#444' },
  btnSecondaryText: { color: '#fff', fontSize: 14, fontFamily: 'Poppins-Bold', letterSpacing: 1 },
  restoreCardWrap: { margin: 4 },
  restoreCardFocus: { transform: [{ translateY: -2 }] },
  restoreCard: { width: 140, minHeight: 90, paddingVertical: 16, paddingHorizontal: 14, alignItems: 'center', opacity: 0.7 },
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, BackHandler, Dimensions, DeviceEventEmitter, ImageBackground, Animated, Modal } from 'react-native';
import TFPressable from '../components/TFPressable';
import PopArtCard from '../components/PopArtCard';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import { Profile, useCore, useProfiles, useActiveProfile, useSetActiveProfile, useSetProfiles } from '../store/AppContext';
import { deleteProfile as wpDeleteProfile, restoreProfile as wpRestoreProfile } from '../services/wordpressSync';
import { COLORS, FONT, SPACING } from '../constants';
import ExitDialog from '../components/ExitDialog';

const COLORS_PRESET = ['#f6c800', '#1fd6e8', '#ff5b63', '#7c4dff'];
const AVATARS = ['\uD83D\uDE0E', '\uD83E\uDD8A', '\uD83D\uDC3A', '\uD83E\uDD85', '\uD83D\uDC0E', '\uD83D\uDD25', '\u2B50', '\uD83C\uDFAD', '\uD83D\uDC51', '\uD83D\uDC80', '\uD83E\uDD20', '\uD83E\uDDD9'];
const SZUPERHOS_NEVEK = [
  'PusztaPuma', 'TüskeTigris', 'HomokHéja', 'BetyárBölény', 'GulyásGriff',
  'CsárdaCápa', 'MénesMedve', 'DélibábDémon', 'SzilajSólyom', 'RónaRóka',
  'PusztaPárduc', 'BoglyaBajnok', 'GémesGólya', 'KunságKobra', 'TanyaTroll',
  'CsikósCiklon', 'BárányBáró', 'HortobágyHős', 'SzikesSzellem', 'NádasNindzsa',
];
const MAX_PROFILES = 3;
const DELETED_GRACE_DAYS = 30;
const SCREEN_W = Dimensions.get('window').width;

interface Props { onProfileSelected: () => void; }

export default function ProfileSelectScreen({ onProfileSelected }: Props) {
  const profiles = useProfiles() as Profile[];
  const activeProfile = useActiveProfile();
  const [showExit, setShowExit] = useState(false);
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

  // Wizard step transition
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const prevStep = useRef(0);

  const animateStep = useCallback((nextStep: number) => {
    if (nextStep === prevStep.current) return;
    Animated.sequence([
      Animated.timing(stepOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(stepOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    prevStep.current = nextStep;
  }, [stepOpacity]);

  const goToStep = useCallback((s: number) => {
    setWizStep(s);
    animateStep(s);
  }, [animateStep]);

  // Card entrance animation refs
  const cardAnims = useRef<Record<string, Animated.Value>>({}).current;
  const getCardAnim = (id: string) => {
    if (!cardAnims[id]) {
      cardAnims[id] = new Animated.Value(0);
    }
    return cardAnims[id];
  };
  const [cardsReady, setCardsReady] = useState(false);
  useEffect(() => {
    if (!cardsReady && profiles.length > 0) {
      setCardsReady(true);
      const anims = Object.entries(cardAnims);
      if (anims.length === 0) return;
      Animated.stagger(80, anims.map(([, anim], i) =>
        Animated.spring(anim, { toValue: 1, friction: 7, tension: 60, delay: i * 60, useNativeDriver: true })
      )).start();
    }
  }, [profiles.length, cardsReady, cardAnims]);

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

  // Back button handler
  const wizardRef = useRef(wizard);
  const confirmDeleteRef = useRef(confirmDelete);
  wizardRef.current = wizard;
  confirmDeleteRef.current = confirmDelete;
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (wizardRef.current) { resetWizard(); return true; }
      if (confirmDeleteRef.current) { setConfirmDelete(false); setDeleteTarget(null); return true; }
      setShowExit(true);
      return true;
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
    try {
      await wpDeleteProfile(user.apiKey, deleteTarget);
      const updated = (profiles || []).map(p =>
        p.id === deleteTarget ? { ...p, deleted: true, deletedAt: Date.now() } : p
      );
      setProfiles(updated);
    } catch {}
    setDeleting(false);
    setConfirmDelete(false);
    setDeleteTarget(null);
  };

  const handleRestore = async (id: string) => {
    try {
      await wpRestoreProfile(user.apiKey, id);
      const updated = (profiles || []).map(p =>
        p.id === id ? { ...p, deleted: false, deletedAt: undefined } : p
      );
      setProfiles(updated);
    } catch {}
  };

  // ─── Wizard ──────────────────────────────────────
  if (wizard) {
    return (
      <ImageBackground source={require('../../assets/splash-bg.png')} style={s.root} resizeMode="cover">
        <SoundEffect text="NEW!" textColor={COLORS.yellow} bgColor={COLORS.red} top={10} right={-8} rotate={18} fontSize={16} />
        <PopArtCard shadowOffset={10} borderRadius={22} borderWidth={4} contentStyle={s.cardWizard}>
          <Text style={s.title}>ÚJ PROFIL</Text>
          <Text style={s.subtitle}>3 LÉPÉS A SZEMÉLYRE SZABÁSIG</Text>
          <View style={s.divider} />

          <View style={s.dotsRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[s.dot, i < wizStep ? s.dotDone : i === wizStep ? s.dotActive : s.dotPending]} />
            ))}
          </View>

          <Animated.View style={{ opacity: stepOpacity, alignSelf: 'stretch', alignItems: 'center' }}>
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
          </Animated.View>

          <View style={s.wizActions}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {wizStep > 0 && (
                <TFPressable style={s.btnSecondary} focusedStyle={s.btnSecondaryFocus} onPress={() => goToStep(wizStep - 1)} accessibilityLabel="Vissza"><Text style={s.btnSecondaryText}>{'\u2190'} VISSZA</Text></TFPressable>
              )}
              {wizStep < 2 ? (
                <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={() => goToStep(wizStep + 1)} accessibilityLabel="Tovább"><Text style={s.btnPrimaryText}>TOVÁBB {'\u2192'}</Text></TFPressable>
              ) : (
                <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={handleCreate} accessibilityLabel="Létrehozás"><Text style={s.btnPrimaryText}>LÉTREHOZÁS {'\u2728'}</Text></TFPressable>
              )}
            </View>
          </View>
        </PopArtCard>
      </ImageBackground>
    );
  }

  // ─── Grid ──────────────────────────────────────
  const activeProfs = profiles.filter(p => !p.deleted);
  const deletedProfs = profiles.filter(p => p.deleted);
  const countdownFor = (p: Profile): string => {
    if (!p.deletedAt) return '';
    const left = DELETED_GRACE_DAYS - Math.floor((Date.now() - p.deletedAt) / (1000 * 60 * 60 * 24));
    if (left <= 0) return 'végleg törölve';
    return `${left} nap`;
  };

  return (
    <ImageBackground source={require('../../assets/splash-bg.png')} style={s.root} resizeMode="cover">
      <SoundEffect text="HEY!" textColor={COLORS.yellow} bgColor={COLORS.red} top={-2} left={SCREEN_W * 0.12} rotate={-8} fontSize={14} />
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
        {activeProfs.length === 0 ? (
          <PopArtCard shadowOffset={8} borderRadius={18} borderWidth={3} contentStyle={s.emptyCard}>
            <Text style={s.emptyTitle}>Még nincs profilod.</Text>
            <Text style={s.emptySub}>Hozz létre egyet!</Text>
            <TFPressable style={s.btnPrimary} focusedStyle={s.btnPrimaryFocus} onPress={() => setWizard(true)} accessibilityLabel="Profil létrehozása" accessibilityRole="button">
              <Text style={s.btnPrimaryText}>PROFIL LÉTREHOZÁSA</Text>
            </TFPressable>
          </PopArtCard>
        ) : (
          <View style={s.profileGrid}>
            {activeProfs.map((p, idx) => {
              const isActive = activeId === p.id;
              const isFocused = focusedProfile === p.id;
              const anim = getCardAnim(p.id);
              return (
                <Animated.View
                  key={p.id}
                  style={{
                    opacity: anim,
                    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
                  }}
                >
                  <TFPressable
                    style={[s.profileCardOuter, isFocused && s.profileCardFocusWrap]}
                    focusedStyle={{}}
                    onPress={() => handleSelect(p.id)}
                    onFocus={() => setFocusedProfile(p.id)}
                    onBlur={() => setFocusedProfile(null)}
                    accessibilityLabel={`${p.name} profil${isActive ? ', aktív' : ''}`}
                    accessibilityRole="button"
                  >
                    <RuggedBorder color={COLORS.cyan} wobbleFactor={0.5}>
                      <View style={[s.profileCard, isActive && s.profileCardActive]}>
                        <Text style={s.profileAvatar}>{p.avatar || '\uD83D\uDE0E'}</Text>
                        <Text style={s.profileName}>{p.name}</Text>
                        {isActive && <Text style={s.activeTag}>{'\u2726'} AKTÍV</Text>}
                      </View>
                    </RuggedBorder>
                  </TFPressable>
                </Animated.View>
              );
            })}
            {activeProfs.length < MAX_PROFILES && (
              <TFPressable style={s.addCard} focusedStyle={s.addCardFocus} onPress={() => setWizard(true)} accessibilityLabel="Új profil létrehozása" accessibilityRole="button">
                <RuggedBorder color={COLORS.cyan} wobbleFactor={0.5}>
                  <View style={s.addCardInner}>
                    <Text style={s.addText}>+</Text>
                  </View>
                </RuggedBorder>
              </TFPressable>
            )}
          </View>
        )}
        {deletedProfs.length > 0 && (
          <View style={{ marginTop: 28, width: '100%', maxWidth: 600 }}>
            <SoundEffect text="RIP" textColor={COLORS.yellow} bgColor={COLORS.red} top={-12} left={-6} rotate={-15} fontSize={12} />
            <Text style={{ color: COLORS.muted, fontSize: 12, fontFamily: 'Poppins-Bold', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14, textAlign: 'center' }}>Törölt profilok</Text>
            <View style={s.profileGrid}>
              {deletedProfs.map(p => {
                const anim = getCardAnim(p.id);
                const days = countdownFor(p);
                return (
                  <Animated.View
                    key={p.id}
                    style={{
                      opacity: anim,
                      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                    }}
                  >
                    <TFPressable
                      style={[s.restoreCardWrap]}
                      focusedStyle={s.restoreCardFocus}
                      onPress={() => handleRestore(p.id)}
                      accessibilityLabel={`${p.name} visszaállítása`}
                      accessibilityRole="button"
                    >
                      <PopArtCard shadowOffset={4} borderRadius={12} borderWidth={2} contentStyle={s.restoreCard}>
                        <Text style={{ fontSize: 32, opacity: 0.3, marginBottom: 2 }}>{p.avatar || '\uD83D\uDE0E'}</Text>
                        <Text style={{ color: COLORS.muted, fontSize: 12, fontFamily: 'Poppins-Bold', textAlign: 'center' }}>{p.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                          <Text style={{ fontSize: 10 }}>{'\u23F3'}</Text>
                          <Text style={{ color: COLORS.cyan, fontSize: 8, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>{days}</Text>
                        </View>
                        <Text style={{ color: COLORS.cyan, fontSize: 8, fontFamily: 'Poppins-Bold', marginTop: 2, textTransform: 'uppercase' }}>Visszaállítás</Text>
                      </PopArtCard>
                    </TFPressable>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
      <Modal visible={showExit} transparent animationType="fade" onRequestClose={() => setShowExit(false)}>
        <ExitDialog onDismiss={() => setShowExit(false)} />
      </Modal>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', padding: 20 },
  gridHeader: { alignItems: 'center', marginBottom: 16 },
  title: { color: COLORS.yellow, fontSize: 24, fontFamily: 'Bangers-Regular', letterSpacing: 3, textShadowColor: COLORS.black, textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
  subtitle: { color: COLORS.muted, fontSize: 10, fontFamily: 'Poppins-Bold', letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 },
  divider: { height: 2, backgroundColor: '#1a1a1a', alignSelf: 'stretch', marginVertical: 14 },

  confirmBar: { backgroundColor: COLORS.red, borderRadius: 12, borderWidth: 3, borderColor: COLORS.black, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, alignSelf: 'stretch' },
  confirmText: { color: COLORS.text, fontSize: 12, fontFamily: 'Poppins-Bold', flex: 1 },
  confirmBtns: { flexDirection: 'row', gap: 8 },
  confirmNo: { backgroundColor: '#222', borderRadius: 10, borderWidth: 3, borderColor: COLORS.black, paddingVertical: 8, paddingHorizontal: 16 },
  confirmNoFocus: { backgroundColor: '#444' },
  confirmNoText: { color: COLORS.text, fontSize: 12, fontFamily: 'Poppins-Bold' },
  confirmYes: { backgroundColor: COLORS.text, borderRadius: 10, borderWidth: 3, borderColor: COLORS.black, paddingVertical: 8, paddingHorizontal: 16 },
  confirmYesFocus: { backgroundColor: COLORS.yellow },
  confirmYesText: { color: COLORS.black, fontSize: 12, fontFamily: 'Poppins-Bold' },

  gridScroll: { alignItems: 'center', paddingBottom: 40, paddingTop: 8 },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, maxWidth: 600 },
  profileCard: { width: 150, minHeight: 120, padding: 8, alignItems: 'center', backgroundColor: 'rgba(10,10,20,0.92)', borderRadius: 8, overflow: 'visible' },
  profileCardActive: { backgroundColor: 'rgba(0,255,255,0.06)' },
  profileCardOuter: {},
  profileCardFocusWrap: { transform: [{ translateY: -4 }] },
  profileAvatar: { fontSize: 40, marginBottom: 6 },
  profileName: { color: COLORS.text, fontSize: 12, fontFamily: 'Poppins-Bold', textAlign: 'center', marginBottom: 4 },
  activeTag: { color: COLORS.yellow, fontSize: 9, fontFamily: 'Poppins-Bold', letterSpacing: 1, textTransform: 'uppercase' },
  addCard: { width: 150, minHeight: 120 },
  addCardFocus: { transform: [{ translateY: -4 }] },
  addCardInner: { width: 150, minHeight: 120, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  addText: { color: COLORS.muted, fontSize: 44, fontFamily: 'Bangers-Regular' },
  emptyCard: { width: Math.min(400, SCREEN_W - 120), paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center' },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontFamily: 'Poppins-Bold', textAlign: 'center' },
  emptySub: { color: COLORS.muted, fontSize: 14, fontFamily: 'Poppins-Regular', marginBottom: 24, marginTop: 6 },

  cardWizard: { width: Math.min(440, SCREEN_W - 120), paddingVertical: 24, paddingHorizontal: 28, alignItems: 'center' },
  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotDone: { backgroundColor: COLORS.cyan },
  dotActive: { backgroundColor: COLORS.yellow, shadowColor: COLORS.yellow, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 1, elevation: 8 },
  dotPending: { backgroundColor: '#333' },
  stepLabel: { color: COLORS.muted, fontSize: 12, fontFamily: 'Poppins-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  input: { alignSelf: 'stretch', backgroundColor: '#0d0d0d', borderRadius: 10, borderWidth: 3, borderColor: '#1a1a1a', paddingVertical: 12, paddingHorizontal: 16, color: COLORS.text, fontSize: 14, fontFamily: 'Poppins-Regular', marginBottom: 12 },
  btnDice: { alignSelf: 'stretch', backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  btnDiceFocus: { backgroundColor: '#333' },
  btnDiceText: { color: '#999', fontSize: 13, fontFamily: 'Poppins-Bold' },
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  colorBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 3, borderColor: 'transparent' },
  colorBtnActive: { borderColor: COLORS.text, transform: [{ scale: 1.15 }] },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 8 },
  avatarBtn: { width: 48, height: 48, borderRadius: 10, borderWidth: 2, borderColor: '#222', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  avatarBtnActive: { borderColor: COLORS.yellow, backgroundColor: 'rgba(246,200,0,0.12)' },
  avatarBtnFocus: { borderColor: COLORS.cyan },
  avatarText: { fontSize: 30 },

  wizActions: { flexDirection: 'row', justifyContent: 'center', alignSelf: 'stretch', marginTop: 16 },
  btnPrimary: { backgroundColor: COLORS.yellow, borderRadius: 12, borderWidth: 3, borderColor: COLORS.black, paddingVertical: 10, paddingHorizontal: 24, alignItems: 'center' },
  btnPrimaryFocus: { backgroundColor: COLORS.cyan },
  btnPrimaryText: { color: COLORS.black, fontSize: 14, fontFamily: 'Poppins-Bold', letterSpacing: 1, textTransform: 'uppercase' },
  btnSecondary: { backgroundColor: '#222', borderRadius: 12, borderWidth: 3, borderColor: COLORS.black, paddingVertical: 10, paddingHorizontal: 24, alignItems: 'center' },
  btnSecondaryFocus: { backgroundColor: '#444' },
  btnSecondaryText: { color: COLORS.text, fontSize: 14, fontFamily: 'Poppins-Bold', letterSpacing: 1 },
  restoreCardWrap: { margin: 4 },
  restoreCardFocus: { transform: [{ translateY: -2 }] },
  restoreCard: { width: 150, minHeight: 120, paddingVertical: 16, paddingHorizontal: 14, alignItems: 'center', opacity: 0.7 },
});

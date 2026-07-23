import { useState } from 'react';
import { View, Text, Image, StyleSheet, Platform, Dimensions, ScrollView } from 'react-native';
import TFPressable from './TFPressable';
import RuggedBorder from './RuggedBorder';
import SoundEffect from './SoundEffect';
import SidebarBg from './SidebarBg';
import PanelBg from './PanelBg';
import ComicStarburst from './ComicStarburst';
import { COLORS, FONT, SPACING, SIZES, NAV_ITEMS, USER_STATUS_LOGGED_IN } from '../constants';
import { useCore } from '../store/AppContext';

const APP_VERSION = '0.7.0';
let isTV = false;
let isTablet = false;
let deviceLabel = 'Fire TV';
try {
  isTV = Platform.isTV;
  const { width: winW, height: winH } = Dimensions.get('window');
  isTablet = Math.min(winW, winH) >= 600;
  deviceLabel = Platform.OS === 'windows' ? (isTV ? 'Xbox' : 'Windows') : isTV ? 'Fire TV' : isTablet ? 'Android Tablet' : 'Android Mobile';
} catch {}
const isTouch = !isTV;

interface SidebarProps {
  activeRoute: string;
  onNavigate: (route: string) => void;
  onLogin?: () => void;
  onLogout?: () => void;
  onSwitchProfile?: () => void;
  onUserInfo?: () => void;
  onSync?: () => void;
  syncing?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  liveFormat: 'ts' | 'm3u8';
  onToggleLiveFormat: () => void;
}

const RADIUS = 8;

export default function Sidebar({ activeRoute, onNavigate, onLogin, onLogout, onSwitchProfile, onUserInfo, onSync, syncing, onRefresh, refreshing, liveFormat, onToggleLiveFormat }: SidebarProps) {
  const { state: { user, playlist } } = useCore();
  const hasCreds = user.status === USER_STATUS_LOGGED_IN;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const liveCount = playlist?.liveChannels?.length ?? 0;
  const movieCount = playlist?.movies?.length ?? 0;
  const seriesCount = playlist?.series?.length ?? 0;

  return (
    <View style={styles.container} testID="sidebar-container">
      <SidebarBg />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Brand header */}
      <RuggedBorder color={COLORS.cyan} wobbleFactor={1.0} style={{ marginBottom: 8 }}>
      <View style={styles.sidebarBrand} testID="sidebar-brand">
        <View style={styles.sidebarLogo}>
          <Image
            source={require('../../assets/pp-logo.png')}
            style={styles.sidebarLogoImg}
            resizeMode="cover"
            accessibilityLabel="PusztaPlayer logo"
            testID="sidebar-logo"
          />
        </View>
        <View style={styles.sidebarBrandText}>
          <View style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -100 }, { translateY: -100 }, { scaleX: 1.32 }, { scaleY: 0.63 }], zIndex: 0 }}>
            <ComicStarburst size={200} pointsCount={12} fillColor={COLORS.yellow} borderColor="#FF6600" borderWidth={4} shadowOffset={4} />
          </View>
          <Text style={styles.sidebarBrandName} numberOfLines={1} adjustsFontSizeToFit testID="sidebar-brand-name">
            pusztaplayer{' '}
          </Text>
          <Text style={styles.sidebarVersion} testID="sidebar-version">v{APP_VERSION} &middot; {deviceLabel}</Text>
        </View>
      </View>
      <SoundEffect text="POW!" textColor={COLORS.yellow} bgColor={COLORS.red} top={-27} right={-21} rotate={30} />
      </RuggedBorder>

      {/* Stats panel (logged in) */}
      {hasCreds && (
        <RuggedBorder color={COLORS.cyan} wobbleFactor={1.0} style={{ marginBottom: 8 }}>
        <View style={styles.sidebarStats} testID="sidebar-stats">
          <PanelBg />
          <View style={styles.sidebarStatsGrid}>
            <View style={styles.sidebarStatsCol}>
              <Text style={styles.sidebarStatsNum}>{'\uD83D\uDCE1'} {liveCount}</Text>
              <Text style={styles.sidebarStatsLabel}>Live TV</Text>
            </View>
            <View style={styles.sidebarStatsCol}>
              <Text style={styles.sidebarStatsNum}>{'\uD83C\uDFAC'} {movieCount}</Text>
              <Text style={styles.sidebarStatsLabel}>Filmek</Text>
            </View>
            <View style={styles.sidebarStatsCol}>
              <Text style={styles.sidebarStatsNum}>{'\uD83D\uDCFA'} {seriesCount}</Text>
              <Text style={styles.sidebarStatsLabel}>Sorozatok</Text>
            </View>
          </View>
      </View>
      </RuggedBorder>
      )}

      {/* CTA (not logged in) */}
      {!hasCreds && (
        <View style={styles.sidebarCta} testID="sidebar-cta">
          <Text style={styles.sidebarCtaText}>Pörögj rá a nézésre!</Text>
        </View>
      )}

      {/* Status panel */}
      <RuggedBorder color={COLORS.cyan} wobbleFactor={1.0} style={{ marginBottom: 8 }}>
      <TFPressable
        style={styles.sidebarStatusPanel}
        focusedStyle={styles.sidebarStatusPanelFocused}
        onPress={onUserInfo}
        testID="sidebar-status"
        accessibilityLabel="Felhasználói információk"
        accessibilityRole="button"
      >
        <PanelBg />
        <Text style={styles.sidebarStatusName}>{user.name || 'Vendég'}</Text>
        <Text style={[styles.sidebarStatusDot, hasCreds && styles.sidebarStatusDotOnline]}>
          {hasCreds ? '\u25CF online' : '\u25CF offline'}
        </Text>
      </TFPressable>
      </RuggedBorder>

      {/* Nav items */}
      <RuggedBorder color={COLORS.cyan} wobbleFactor={1.0} style={{ marginBottom: 8 }}>
      <View style={styles.sidebarNavContainer}>
        <PanelBg />
        {NAV_ITEMS.map(item => {
          const isActive = activeRoute === item.key;
          return (
            <TFPressable
              key={item.key}
              style={[styles.sidebarNavButtons, isActive && styles.sidebarNavButtonsActive]}
              focusedStyle={styles.sidebarNavButtonsFocused}
              onPress={() => onNavigate(item.key)}
              hasTVPreferredFocus={activeRoute === 'Home' && item.key === 'Home'}
              testID={`nav-${item.key.toLowerCase()}`}
              accessibilityLabel={`${item.label} oldal megnyitása`}
              accessibilityRole="button"
            >
              <item.Icon size={21} color={isActive ? '#ffcc00' : '#888'} />
              <Text style={[styles.sidebarNavLabel, isActive && styles.sidebarNavLabelActive]}>{item.label}</Text>
            </TFPressable>
          );
        })}
      </View>
      <SoundEffect text="GO!" textColor="#FF6600" bgColor="#39FF14" top={140} right={-8} rotate={10} fontSize={26} />
      </RuggedBorder>

      {/* Bottom panel */}
      <RuggedBorder color={COLORS.cyan} wobbleFactor={1.0} style={{ marginBottom: 8 }}>
      <View style={styles.sidebarBottom}>
        <PanelBg />
        {hasCreds && (
          <>
            <TFPressable
              style={[styles.sidebarNavButtons, settingsOpen && styles.sidebarNavButtonsActive]}
              focusedStyle={styles.sidebarNavButtonsFocused}
              onPress={() => setSettingsOpen(s => !s)}
              testID="nav-settings"
              accessibilityLabel="Beállítások"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 17, color: settingsOpen ? '#ffcc00' : '#888' }}>{'\u2699'}</Text>
              <Text style={[styles.sidebarNavLabel, settingsOpen && styles.sidebarNavLabelActive]}>Beállítások</Text>
            </TFPressable>
            {settingsOpen && (
              <View style={styles.settingsPopup}>
                {onSwitchProfile && (
                  <TFPressable style={styles.settingsItem} focusedStyle={styles.settingsItemFocus} onPress={() => { setSettingsOpen(false); onSwitchProfile(); }} hasTVPreferredFocus>
                    <Text style={{ fontSize: 15, color: '#888' }}>{'\uD83D\uDC64'}</Text>
                    <Text style={styles.settingsLabel}>Profilok</Text>
                  </TFPressable>
                )}
                {onRefresh && (
                  <TFPressable style={styles.settingsItem} focusedStyle={styles.settingsItemFocus} onPress={() => { setSettingsOpen(false); onRefresh(); }}>
                    <Text style={{ fontSize: 15, color: '#888' }}>{refreshing ? '\u23F3' : '\uD83D\uDD04'}</Text>
                    <Text style={styles.settingsLabel}>{refreshing ? 'Töltés...' : 'Frissítés'}</Text>
                  </TFPressable>
                )}
                {onSync && (
                  <TFPressable style={styles.settingsItem} focusedStyle={styles.settingsItemFocus} onPress={() => { setSettingsOpen(false); onSync(); }}>
                    <Text style={{ fontSize: 15, color: '#888' }}>{syncing ? '\u23F3' : '\uD83D\uDD04'}</Text>
                    <Text style={styles.settingsLabel}>{syncing ? 'Szinkron...' : 'Szinkron'}</Text>
                  </TFPressable>
                )}
                <TFPressable style={styles.settingsItem} focusedStyle={styles.settingsItemFocus} onPress={onToggleLiveFormat}>
                  <Text style={{ fontSize: 15, color: '#888' }}>{'\uD83D\uDCE1'}</Text>
                  <Text style={styles.settingsLabel}>Live: {liveFormat.toUpperCase()}</Text>
                </TFPressable>
              </View>
            )}
          </>
        )}
        <TFPressable
          style={styles.sidebarNavButtons}
          focusedStyle={styles.sidebarNavButtonsFocused}
          onPress={hasCreds ? onLogout : onLogin}
          testID="nav-login"
          accessibilityLabel={hasCreds ? 'Kijelentkezés' : 'Bejelentkezés'}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 17, color: '#888' }}>{hasCreds ? '\uD83D\uDEAA' : '\uD83D\uDD11'}</Text>
          <Text style={styles.sidebarNavLabel}>{hasCreds ? 'Kijelentkezés' : 'Belépés'}</Text>
        </TFPressable>
      </View>
      <SoundEffect text="BOOM" textColor={COLORS.yellow} bgColor={COLORS.red} bottom={-20} right={-9} rotate={-20} />
      <SoundEffect text="CRACK" textColor={COLORS.red} bgColor="#008888" bottom={-30} left={-19} rotate={0} />
      </RuggedBorder>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZES.sidebarWidth,
    paddingHorizontal: 5,
    paddingTop: 4,
    overflow: 'visible',
  },
  scroll: {
    flex: 1,
    overflow: 'visible',
  },
  scrollContent: {
    paddingLeft: 14,
    paddingRight: 18,
    paddingTop: 8,
    paddingBottom: 22,
  },
  sidebarBrand: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
    marginBottom: 0,
    paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3,
    backgroundColor: '#ffcc00',
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  sidebarLogo: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: COLORS.yellow,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  sidebarLogoImg: {
    width: '100%',
    height: '100%',
    borderRadius: 3,
  },
  sidebarBrandText: {
    flex: 1,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  sidebarBrandName: {
    fontSize: 22,
    color: '#000080',
    fontFamily: 'Bangers-Regular',
    letterSpacing: 1,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3.5,
  },
  sidebarVersion: {
    fontSize: 9,
    color: '#000000',
    fontFamily: 'CreativeBlockBB',
    textAlign: 'center',
  },
  sidebarStats: {
    position: 'relative',
    marginBottom: 0,
    paddingHorizontal: 9, paddingVertical: 7,
    borderRadius: RADIUS,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  sidebarStatsGrid: {
    flexDirection: 'row',
  },
  sidebarStatsCol: {
    flex: 1,
    alignItems: 'center',
  },
  sidebarStatsNum: {
    fontSize: 10,
    fontFamily: 'CreativeBlockBB',
    color: COLORS.text,
  },
  sidebarStatsLabel: {
    fontSize: 7,
    color: COLORS.muted,
    fontFamily: 'CreativeBlockBB',
    marginTop: 3,
  },
  sidebarStatusPanel: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    paddingHorizontal: 9, paddingVertical: 9,
    borderRadius: RADIUS,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  sidebarStatusPanelFocused: {},
  sidebarStatusName: {
    fontSize: 9,
    color: COLORS.text,
    fontFamily: 'CreativeBlockBB',
  },
  sidebarStatusDot: {
    fontSize: 9,
    color: COLORS.red,
  },
  sidebarStatusDotOnline: {
    color: COLORS.success,
  },
  sidebarCta: {
    marginBottom: 0,
    padding: 9,
    backgroundColor: COLORS.yellow,
    borderRadius: RADIUS,
  },
  sidebarCtaText: {
    color: COLORS.black,
    textAlign: 'center',
    fontFamily: 'Bangers-Regular',
    fontSize: 12,
  },
  sidebarNavContainer: {
    position: 'relative',
    marginBottom: 0,
    borderRadius: RADIUS,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    padding: 5,
  },
  sidebarNavButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 5,
    paddingHorizontal: 24,
  },
  sidebarNavButtonsActive: {
    backgroundColor: 'rgba(255,204,0,0.1)',
  },
  sidebarNavButtonsFocused: {
    backgroundColor: 'rgba(255,204,0,0.15)',
  },
  sidebarNavLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: '007Toontime',
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1.5,
  },
  sidebarNavLabelActive: {
    color: '#ffffff',
  },
  sidebarBottom: {
    position: 'relative',
    borderRadius: RADIUS,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    padding: 3,
  },
  settingsPopup: {
    borderTopWidth: 1,
    borderTopColor: COLORS.cyan,
    marginTop: 2,
    paddingTop: 2,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
    paddingHorizontal: 20,
  },
  settingsItemFocus: {
    backgroundColor: 'rgba(255,204,0,0.15)',
  },
  settingsLabel: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: '007Toontime',
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1.5,
  },
});

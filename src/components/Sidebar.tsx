import { useState } from 'react';
import { View, Text, Image, StyleSheet, Platform, Dimensions } from 'react-native';
import TFPressable from './TFPressable';
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
      {/* Brand header */}
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
          <Text style={styles.sidebarBrandName} numberOfLines={1} adjustsFontSizeToFit testID="sidebar-brand-name">
            pusztaplayer
          </Text>
          <Text style={styles.sidebarVersion} testID="sidebar-version">v{APP_VERSION} &middot; {deviceLabel}</Text>
        </View>
      </View>

      {/* Stats panel (logged in) */}
      {hasCreds && (
        <View style={styles.sidebarStats} testID="sidebar-stats">
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
      )}

      {/* CTA (not logged in) */}
      {!hasCreds && (
        <View style={styles.sidebarCta} testID="sidebar-cta">
          <Text style={styles.sidebarCtaText}>Pörögj rá a nézésre!</Text>
        </View>
      )}

      {/* Status panel */}
      <TFPressable
        style={styles.sidebarStatusPanel}
        focusedStyle={styles.sidebarStatusPanelFocused}
        onPress={onUserInfo}
        testID="sidebar-status"
        accessibilityLabel="Felhasználói információk"
        accessibilityRole="button"
      >
        <Text style={styles.sidebarStatusName}>{user.name || 'Vendég'}</Text>
        <Text style={[styles.sidebarStatusDot, hasCreds && styles.sidebarStatusDotOnline]}>
          {hasCreds ? '\u25CF online' : '\u25CF offline'}
        </Text>
      </TFPressable>

      {/* Nav items */}
      <View style={styles.sidebarNavContainer}>
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

      {/* Bottom panel */}
      <View style={styles.sidebarBottom}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZES.sidebarWidth,
    backgroundColor: COLORS.bg2,
    paddingHorizontal: 15,
    paddingTop: 8,
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 9,
    marginBottom: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: COLORS.panel,
    borderRadius: RADIUS,
    borderWidth: 2,
    borderColor: COLORS.cyan,
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
  },
  sidebarBrandName: {
    fontSize: 24,
    color: COLORS.brandPink,
    fontFamily: 'Bangers-Regular',
    letterSpacing: 1,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
  },
  sidebarVersion: {
    fontSize: 9,
    color: COLORS.muted,
    fontFamily: 'Poppins-Regular',
    textAlign: 'center',
  },
  sidebarStats: {
    marginBottom: 6,
    paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 2,
    borderColor: COLORS.cyan,
    borderRadius: RADIUS,
    backgroundColor: COLORS.panel,
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
    fontWeight: '700',
    color: COLORS.text,
  },
  sidebarStatsLabel: {
    fontSize: 7,
    color: COLORS.muted,
    marginTop: 3,
  },
  sidebarStatusPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 9, paddingVertical: 7,
    borderWidth: 2,
    borderColor: COLORS.cyan,
    borderRadius: RADIUS,
    backgroundColor: COLORS.panel,
  },
  sidebarStatusPanelFocused: {
    borderColor: COLORS.yellow,
  },
  sidebarStatusName: {
    fontSize: 9,
    color: COLORS.text,
    fontFamily: 'Poppins-Regular',
  },
  sidebarStatusDot: {
    fontSize: 9,
    color: COLORS.red,
  },
  sidebarStatusDotOnline: {
    color: COLORS.success,
  },
  sidebarCta: {
    marginBottom: 9,
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
    marginBottom: 9,
    borderWidth: 2,
    borderColor: COLORS.cyan,
    borderRadius: RADIUS,
    backgroundColor: COLORS.panel,
    padding: 3,
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
    color: COLORS.muted,
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    fontWeight: '800',
  },
  sidebarNavLabelActive: {
    color: COLORS.yellow,
  },
  sidebarBottom: {
    marginBottom: 18,
    borderWidth: 2,
    borderColor: COLORS.cyan,
    borderRadius: RADIUS,
    backgroundColor: COLORS.panel,
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
    color: COLORS.muted,
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
  },
});

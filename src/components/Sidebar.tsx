import { View, Text, Image, StyleSheet, Platform, Dimensions } from 'react-native';
import TFPressable from './TFPressable';
import {  COLORS, FONT, SPACING, SIZES, NAV_ITEMS, USER_STATUS_LOGGED_IN , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';
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
}

const RADIUS = 8;

export default function Sidebar({ activeRoute, onNavigate, onLogin, onLogout, onSwitchProfile, onUserInfo, onSync, syncing, onRefresh, refreshing }: SidebarProps) {
  const { state: { user, playlist } } = useCore();
  const hasCreds = user.status === USER_STATUS_LOGGED_IN;
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
        {hasCreds && onSwitchProfile && (
          <TFPressable
            style={styles.sidebarNavButtons}
            focusedStyle={styles.sidebarNavButtonsFocused}
            onPress={onSwitchProfile}
            testID="nav-profiles"
            accessibilityLabel="Profilok kezelése"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 17, color: '#888' }}>{'\uD83D\uDC64'}</Text>
            <Text style={styles.sidebarNavLabel}>Profilok</Text>
          </TFPressable>
        )}
        {hasCreds && onRefresh && (
          <TFPressable
            style={styles.sidebarNavButtons}
            focusedStyle={styles.sidebarNavButtonsFocused}
            onPress={onRefresh}
            testID="nav-refresh"
            accessibilityLabel="Csatornalista újratöltése"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 17, color: '#888' }}>{refreshing ? '\u23F3' : '\uD83D\uDD04'}</Text>
            <Text style={styles.sidebarNavLabel}>{refreshing ? 'Töltés...' : 'Frissítés'}</Text>
          </TFPressable>
        )}
        {hasCreds && onSync && (
          <TFPressable
            style={styles.sidebarNavButtons}
            focusedStyle={styles.sidebarNavButtonsFocused}
            onPress={onSync}
            testID="nav-sync"
            accessibilityLabel="Adatok szinkronizálása"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 17, color: '#888' }}>{syncing ? '\u23F3' : '\uD83D\uDD04'}</Text>
            <Text style={styles.sidebarNavLabel}>{syncing ? 'Szinkron...' : 'Szinkron'}</Text>
          </TFPressable>
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
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: COLORS.panel,
    borderRadius: RADIUS,
    borderWidth: 2,
    borderColor: COLORS.cyan,
  },
  sidebarLogo: {
    width: 108,
    height: 108,
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
    fontSize: 44,
    color: COLORS.brandPink,
    fontFamily: FONT_FAMILY_BANGERS,
    letterSpacing: 1,
    lineHeight: 46,
    textAlign: 'center',
  },
  sidebarVersion: {
    fontSize: 16,
    color: COLORS.muted,
    fontFamily: FONT_FAMILY_POPPINS,
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
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  sidebarStatsLabel: {
    fontSize: 13,
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
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONT_FAMILY_POPPINS,
  },
  sidebarStatusDot: {
    fontSize: 16,
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
    fontFamily: FONT_FAMILY_BANGERS,
    fontSize: 22,
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
    fontSize: 22,
    fontFamily: FONT_FAMILY_POPPINS,
    fontWeight: '600',
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
});

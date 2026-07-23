import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import DotBackground from '../components/DotBackground';
import RuggedLine from '../components/RuggedLine';
import MainBg from '../components/MainBg';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import LiveScreen from '../screens/LiveScreen';
import MoviesScreen from '../screens/MoviesScreen';
import SeriesScreen from '../screens/SeriesScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import PlayerScreen from '../screens/PlayerScreen';
import UserInfoScreen from '../screens/UserInfoScreen';
import ProfileSelectScreen from '../screens/ProfileSelectScreen';
import WatchLaterScreen from '../screens/WatchLaterScreen';
import EpgScreen from '../screens/EpgScreen';
import RadioScreen from '../screens/RadioScreen';
import { useCore, useAppDispatch, useSetSearch, useSetProfiles, useProfiles, useActiveProfile, useSetActiveProfile } from '../store/AppContext';
import { clearImportedPlaylist, refreshPlaylist as refreshPl } from '../services/playlistService';
import { flush as syncFlush, fetchProfiles, setProfilesVersion } from '../services/wordpressSync';
import { clearXtreamCredentials } from '../services/storage';
import { COLORS, SIZES, USER_STATUS_LOGGED_IN, DEFAULT_PLAYER_CONTENT_ID, useLiveFormat } from '../constants';
import { useChannelNavigation } from '../hooks/useChannelNavigation';
import type { RouteName } from '../types';

export default function AppNavigator() {
  const [currentRoute, setCurrentRoute] = useState<RouteName>('Home');
  const [playerContentId, setPlayerContentId] = useState<string>(DEFAULT_PLAYER_CONTENT_ID);
  const [prevRoute, setPrevRoute] = useState<RouteName>('Home');
  const { state: { user, searchTerm, playlist } } = useCore();
  const dispatch = useAppDispatch();
  const setSearch = useSetSearch();
  const profiles = useProfiles();
  const activeProfile = useActiveProfile();
  const [showProfileSelect, setShowProfileSelect] = useState(true);
  const setActive = useSetActiveProfile();
  const setProfiles = useSetProfiles();
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [liveFormat, setLiveFormat] = useLiveFormat();
  const hasUser = user.status === USER_STATUS_LOGGED_IN;

  const toggleLiveFormat = useCallback(async () => {
    await setLiveFormat(liveFormat === 'ts' ? 'm3u8' : 'ts');
    setRefreshing(true);
    const pl = await refreshPl();
    if (pl) dispatch({ type: 'SET_PLAYLIST', payload: pl });
    setRefreshing(false);
  }, [liveFormat, setLiveFormat, dispatch]);

  // Screen transition: cross-fade on route change
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const prevRouteRef = useRef(currentRoute);
  useEffect(() => {
    if (prevRouteRef.current === currentRoute) return;
    prevRouteRef.current = currentRoute;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [currentRoute, fadeAnim]);

  useEffect(() => {
    if (!hasUser || !user.apiKey) return;
    let cancelled = false;
    (async () => {
      try {
        const { profiles: fetched, version } = await fetchProfiles(user.apiKey);
        setProfilesVersion(version);
        if (!cancelled && fetched.length > 0) {
          setProfiles(fetched.map(p => ({
            ...p,
            avatar: p.avatar || '\uD83E\uDDD1',
            preferences: p.preferences || { live: [], movies: [], series: [] },
          })));
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [hasUser, user.apiKey]);

  const needsProfileSelect = useMemo(() => {
    if (currentRoute === 'Login' || currentRoute === 'Player') return false;
    if (!user.status.includes('bejelentkezve')) return false;
    if (!showProfileSelect) return false;
    // Ha van aktív, nem törölt profil → nem kell választó
    if (activeProfile && !activeProfile.deleted) return false;
    return true;
  }, [activeProfile, showProfileSelect, user.status, currentRoute]);

  const navigate = useCallback((route: string, params?: { id?: string }) => {
    if (route === 'player') {
      setPlayerContentId(params?.id || DEFAULT_PLAYER_CONTENT_ID);
      setPrevRoute(currentRoute);
      setCurrentRoute('Player');
    } else {
      setCurrentRoute(route as RouteName);
    }
  }, [currentRoute]);

  const playContent = useCallback((key: string) => {
    setPlayerContentId(key);
    if (currentRoute !== 'Player') setPrevRoute(currentRoute);
    setCurrentRoute('Player');
  }, [currentRoute]);

  const handleBack = useCallback(() => setCurrentRoute(prevRoute), [prevRoute]);

  const handleLoginSuccess = useCallback(() => setCurrentRoute('Home'), []);

  const handleLogout = useCallback(async () => {
    await syncFlush();
    await clearImportedPlaylist();
    await clearXtreamCredentials();
    dispatch({ type: 'CLEAR_PLAYLIST' });
    dispatch({ type: 'SET_USER', payload: { name: 'PusztaPlayer fiók', status: 'nincs aktív session' } });
    setShowProfileSelect(true);
    setCurrentRoute('Home');
  }, [dispatch]);

  const handleSync = useCallback(async () => {
    if (!user.apiKey) return;
    setSyncing(true);
    await syncFlush();
    try {
      const { profiles: fetched, version } = await fetchProfiles(user.apiKey);
      setProfilesVersion(version);
      if (fetched.length > 0) {
        setProfiles(fetched.map(p => ({
          ...p,
          avatar: p.avatar || '\uD83E\uDDD1',
          preferences: p.preferences || { live: [], movies: [], series: [] },
        })));
      }
    } catch { /* silent */ }
    setSyncing(false);
  }, [user.apiKey, setProfiles]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const pl = await refreshPl();
    if (pl) dispatch({ type: 'SET_PLAYLIST', payload: pl });
    setRefreshing(false);
  }, [dispatch]);

  const handleSwitchProfile = useCallback(() => {
    setActive('');
    setShowProfileSelect(true);
  }, [setActive]);

  const { width: screenW } = useWindowDimensions();
  const contentWidth = screenW - SIZES.sidebarWidth - 32;
  const { prev, next } = useChannelNavigation(playlist?.liveChannels || [], playerContentId, playContent);

  const renderScreen = () => {
    switch (currentRoute) {
      case 'Login':
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
      case 'Live':
        return <LiveScreen onPlayContent={playContent} onBack={() => setCurrentRoute('Home')} />;
      case 'Movies':
        return <MoviesScreen onPlayContent={playContent} onBack={() => setCurrentRoute('Home')} />;
      case 'Series':
        return <SeriesScreen onPlayContent={playContent} onBack={() => setCurrentRoute('Home')} />;
      case 'EPG':
        return <EpgScreen onPlayContent={playContent} onBack={() => setCurrentRoute('Home')} />;
      case 'Radio':
        return <RadioScreen onPlayContent={playContent} onBack={() => setCurrentRoute('Home')} />;
      case 'Favorites':
        return <FavoritesScreen onPlayContent={playContent} onBack={() => setCurrentRoute('Home')} />;
      case 'WatchLater':
        return <WatchLaterScreen onPlayContent={playContent} onBack={() => setCurrentRoute('Home')} />;
      case 'Player': {
        return (
          <PlayerScreen
            contentId={playerContentId}
            onBack={handleBack}
            onPrevChannel={prev.key ? () => playContent(prev.key!) : undefined}
            onNextChannel={next.key ? () => playContent(next.key!) : undefined}
            onPlayContent={playContent}
            prevChanName={prev.name}
            nextChanName={next.name}
          />
        );
      }
      case 'UserInfo':
        return <UserInfoScreen onBack={() => setCurrentRoute('Home')} onLogout={handleLogout} />;
      default:
        return <HomeScreen onNavigate={navigate} onPlayContent={playContent} />;
    }
  };

  if (needsProfileSelect) {
    return (
      <View style={styles.fullScreen}>
        <ProfileSelectScreen onProfileSelected={() => setShowProfileSelect(false)} />
      </View>
    );
  }

  if (currentRoute === 'Player' || currentRoute === 'Login' || !hasUser) {
    return (
      <View style={styles.fullScreen}>
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          {renderScreen()}
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.layout}>
      <DotBackground />
      <Sidebar
        activeRoute={currentRoute}
        onNavigate={navigate}
        onLogin={() => setCurrentRoute('Login')}
        onLogout={handleLogout}
        onSwitchProfile={handleSwitchProfile}
        onUserInfo={() => setCurrentRoute('UserInfo')}
        onSync={handleSync}
        syncing={syncing}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        liveFormat={liveFormat}
        onToggleLiveFormat={toggleLiveFormat}
      />
      <RuggedLine direction="vertical" color={COLORS.black} strokeWidth={3} />
      <View style={styles.content}>
        <MainBg />
        <Topbar
          searchTerm={searchTerm}
          onSearchChange={setSearch}
          contentWidth={contentWidth}
          onPlayContent={playContent}
          onUserInfo={() => setCurrentRoute('UserInfo')}
        />
        <RuggedLine direction="horizontal" color={COLORS.black} strokeWidth={3} />
        {renderScreen()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: COLORS.bg },
  layout: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.bg },
  content: { flex: 1, backgroundColor: 'transparent', position: 'relative' },
});

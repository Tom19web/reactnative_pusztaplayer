import { createContext, useContext, useReducer, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { PlaylistData, Favorite, HistoryItem, WatchLaterItem } from '../types';
import { DEFAULT_PROFILE_NAME } from '../constants';
import {
  Profile, AppState, initialState, AppAction, appReducer,
  createDefaultProfile, getActiveProfile,
} from './reducer';

// Windows: @react-native-async-storage may not have native module
let AsyncStorage: any;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default
    || require('@react-native-async-storage/async-storage');
} catch {
  const store: Record<string, string> = {};
  AsyncStorage = {
    getItem: (k: string) => Promise.resolve(store[k] ?? null),
    setItem: (k: string, v: string) => { store[k] = v; return Promise.resolve(); },
    removeItem: (k: string) => { delete store[k]; return Promise.resolve(); },
  };
}
import { AppState as RNAppState } from 'react-native';
import { saveProfiles as wpSync, flush as wpFlush } from '../services/wordpressSync';

// ─── Split contexts for performance ───────────────────

export type CoreState = Readonly<{
  user: AppState['user'];
  playlist: AppState['playlist'];
  searchTerm: AppState['searchTerm'];
  isLoading: AppState['isLoading'];
  profiles: AppState['profiles'];
  activeProfileId: AppState['activeProfileId'];
  backgroundAudio: AppState['backgroundAudio'];
}>;

const CoreContext = createContext<{ state: CoreState; dispatch: React.Dispatch<AppAction> } | undefined>(undefined);
const FavoritesContext = createContext<Favorite[]>([]);
const HistoryContext = createContext<HistoryItem[]>([]);

// â”€â”€â”€ AsyncStorage profile cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PROFILES_CACHE_KEY = 'pusztaplay_profiles_v2';
const RADIO_CACHE_KEY = 'pusztaplay_last_radio';

async function loadProfilesFromCache(): Promise<Profile[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveProfilesToCache(profiles: Profile[]): Promise<void> {
  try { await AsyncStorage.setItem(PROFILES_CACHE_KEY, JSON.stringify(profiles)); } catch {}
}

// â”€â”€â”€ Provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const loadedRef = useRef(false);
  const cacheTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted profiles on mount (with migration from old keys)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let profiles = await loadProfilesFromCache();
        // Migration: load old favorites/history into a default profile
        if (profiles.length === 0) {
          const [rawFav, rawHist] = await Promise.all([
            AsyncStorage.getItem('pusztaplay_favorites'),
            AsyncStorage.getItem('pusztaplay_watch_history'),
          ]);
          const oldFavs: Favorite[] = rawFav ? JSON.parse(rawFav) : [];
          const oldHist: HistoryItem[] = rawHist ? JSON.parse(rawHist) : [];
          if (oldFavs.length > 0 || oldHist.length > 0) {
            let name = DEFAULT_PROFILE_NAME;
            try {
              const rawCreds = await AsyncStorage.getItem('pusztaplay_xtream_user');
              const creds = rawCreds ? JSON.parse(rawCreds) : null;
              if (creds?.username) name = creds.username;
            } catch {}
            const p = createDefaultProfile(name);
            p.favorites = oldFavs;
            p.watch_progress = oldHist;
            profiles = [p];
          }
        }
        if (!cancelled && profiles.length > 0) {
          // Normalize: add missing radio fields for old profiles
          profiles = profiles.map(p => ({
            ...p,
            radio_recents: p.radio_recents || [],
            radio_plays: p.radio_plays || {},
          }));
          dispatch({ type: 'SET_PROFILES', payload: profiles });
        }
      } catch {}
        if (!cancelled) {
          dispatch({ type: 'SET_LOADING', payload: false });
          loadedRef.current = true;
          // Load last radio station from cache
          try {
            const rawRadio = await AsyncStorage.getItem(RADIO_CACHE_KEY);
            if (rawRadio) {
              const radio = JSON.parse(rawRadio);
              if (radio?.streamUrl) {
                dispatch({ type: 'SET_BACKGROUND_AUDIO', payload: { ...radio, isPlaying: false } });
              }
            }
          } catch {}
        }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist profiles to AsyncStorage (cache fallback, debounced)
  useEffect(() => {
    if (!loadedRef.current) return;
    if (cacheTimer.current) clearTimeout(cacheTimer.current);
    cacheTimer.current = setTimeout(() => {
      cacheTimer.current = null;
      saveProfilesToCache(state.profiles);
    }, 2000);
    return () => {
      if (cacheTimer.current) {
        clearTimeout(cacheTimer.current);
        saveProfilesToCache(state.profiles);
      }
    };
  }, [state.profiles]);

  // WordPress sync (debounced)
  useEffect(() => {
    if (loadedRef.current && state.user.apiKey && state.user.apiKey.length > 0) {
      const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
      wpSync(state.user.apiKey, state.profiles, activeProfile?.watch_progress);
    }
  }, [state.profiles, state.user.apiKey, state.activeProfileId]);

  // Flush WordPress sync on unmount
  useEffect(() => () => { wpFlush(); }, []);

  // Save last radio to AsyncStorage
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      if (state.backgroundAudio) {
        AsyncStorage.setItem(RADIO_CACHE_KEY, JSON.stringify(state.backgroundAudio));
      } else {
        AsyncStorage.removeItem(RADIO_CACHE_KEY);
      }
    } catch {}
  }, [state.backgroundAudio]);

  // Flush pending WordPress sync when app goes to background
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state: string) => {
      if (state === 'background' || state === 'inactive') wpFlush();
    });
    return () => sub.remove();
  }, []);

  // Derived values
  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);

  const coreValue = useMemo(() => ({
    state: {
      user: state.user, playlist: state.playlist, searchTerm: state.searchTerm,
      isLoading: state.isLoading, profiles: state.profiles, activeProfileId: state.activeProfileId,
      backgroundAudio: state.backgroundAudio,
    },
    dispatch,
  }), [state.user, state.playlist, state.searchTerm, state.isLoading, state.profiles, state.activeProfileId, state.backgroundAudio, dispatch]);

  return (
    <CoreContext.Provider value={coreValue}>
      <FavoritesContext.Provider value={activeProfile?.favorites || []}>
        <HistoryContext.Provider value={activeProfile?.watch_progress || []}>
          {children}
        </HistoryContext.Provider>
      </FavoritesContext.Provider>
    </CoreContext.Provider>
  );
}

// â”€â”€â”€ Hooks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useCore() {
  const ctx = useContext(CoreContext);
  if (!ctx) throw new Error('useCore must be used within AppProvider');
  return ctx;
}

export function useFavorites(): Favorite[] {
  return useContext(FavoritesContext);
}

export function useHistory(): HistoryItem[] {
  return useContext(HistoryContext);
}

export function useAppDispatch() {
  const ctx = useContext(CoreContext);
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider');
  return ctx.dispatch;
}

// â”€â”€â”€ Action hooks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useSetUser() {
  const d = useAppDispatch();
  return useCallback(
    (name: string, status: string, email = '', nickname = '', phone = '', apiKey = '') =>
      d({ type: 'SET_USER', payload: { name, status, email, nickname, phone, apiKey } }),
    [d],
  );
}

export function useSetPlaylist() {
  const d = useAppDispatch();
  return useCallback((pl: PlaylistData | null) => d({ type: 'SET_PLAYLIST', payload: pl }), [d]);
}

export function useToggleFavorite() {
  const d = useAppDispatch();
  return useCallback((item: Favorite) => d({ type: 'TOGGLE_FAVORITE', payload: item }), [d]);
}

export function useAddHistory() {
  const d = useAppDispatch();
  return useCallback((item: HistoryItem) => d({ type: 'ADD_HISTORY', payload: item }), [d]);
}

export function useToggleWatchLater() {
  const d = useAppDispatch();
  return useCallback((item: { key: string; title: string; type: string; group: string; logo: string }) =>
    d({ type: 'TOGGLE_WATCH_LATER', payload: item }), [d]);
}

export function useWatchLater(): WatchLaterItem[] {
  const active = useActiveProfile();
  return active?.watch_later || [];
}

export function useSetSearch() {
  const d = useAppDispatch();
  return useCallback((term: string) => d({ type: 'SET_SEARCH', payload: term }), [d]);
}

export function useClearHistory() {
  const d = useAppDispatch();
  return useCallback(() => d({ type: 'CLEAR_HISTORY' }), [d]);
}

export function useSetProfiles() {
  const d = useAppDispatch();
  return useCallback((profiles: Profile[]) => d({ type: 'SET_PROFILES', payload: profiles }), [d]);
}

export function useSetActiveProfile() {
  const d = useAppDispatch();
  return useCallback((id: string) => d({ type: 'SET_ACTIVE_PROFILE', payload: id }), [d]);
}

export function useActiveProfile(): Profile | undefined {
  const core = useCore();
  return core.state.profiles.find(p => p.id === core.state.activeProfileId);
}

export function useProfiles(): Profile[] {
  const core = useCore();
  return core.state.profiles || [];
}

export function useBackgroundAudio() {
  const core = useCore();
  const d = useAppDispatch();
  return {
    audio: core.state.backgroundAudio,
    isPlaying: core.state.backgroundAudio?.isPlaying === true,
    start: (info: { stationName: string; stationLogo: string; streamUrl: string; streamType: string }) =>
      d({ type: 'START_BACKGROUND_AUDIO', payload: { ...info, isPlaying: true } }),
    stop: () => d({ type: 'STOP_BACKGROUND_AUDIO' }),
    clear: () => d({ type: 'CLEAR_BACKGROUND_AUDIO' }),
  };
}

export function useRadioRecents(): [string[], (keys: string[]) => void] {
  const profile = useActiveProfile();
  const d = useAppDispatch();
  return [
    profile?.radio_recents || [],
    useCallback((keys: string[]) => d({ type: 'SET_RADIO_RECENTS', payload: keys }), [d]),
  ];
}

export function useRadioPlays(): [Record<string, number>, (key: string) => void] {
  const profile = useActiveProfile();
  const d = useAppDispatch();
  return [
    profile?.radio_plays || {},
    useCallback((key: string) => d({ type: 'INCREMENT_RADIO_PLAY', payload: key }), [d]),
  ];
}

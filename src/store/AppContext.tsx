import { createContext, useContext, useReducer, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { PlaylistData, Favorite, HistoryItem, WatchLaterItem } from '../types';
import { DEFAULT_PROFILE_NAME } from '../constants';

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

// â”€â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface Profile {
  id: string;
  name: string;
  color: string;
  avatar: string;
  preferences: { live: string[]; movies: string[]; series: string[] };
  favorites: Favorite[];
  watch_later: WatchLaterItem[];
  watch_progress: HistoryItem[];
  deleted?: boolean;
  deletedAt?: number;
}

interface AppState {
  user: { name: string; status: string; email: string; nickname: string; phone: string; apiKey: string };
  playlist: PlaylistData | null;
  favorites: Favorite[];
  watchHistory: HistoryItem[];
  profiles: Profile[];
  activeProfileId: string;
  isLoading: boolean;
  searchTerm: string;
}

const initialState: AppState = {
  user: { name: 'PusztaPlayer fiĂłk', status: 'nincs aktĂ­v session', email: '', nickname: '', phone: '', apiKey: '' },
  playlist: null,
  favorites: [],
  watchHistory: [],
  profiles: [],
  activeProfileId: '',
  isLoading: true,
  searchTerm: '',
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _idCounter = 0;
function generateId(): string {
  return 'prof_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + (_idCounter++).toString(36);
}

function createDefaultProfile(name: string, color = '#ffcc00', avatar = 'đź§‘'): Profile {
  return { id: generateId(), name, color, avatar, preferences: { live: [], movies: [], series: [] }, favorites: [], watch_later: [], watch_progress: [] };
}

function getActiveProfile(state: AppState): Profile | undefined {
  return state.profiles.find(p => p.id === state.activeProfileId);
}

function ensureActiveProfile(state: AppState): AppState {
  if (state.profiles.find(p => p.id === state.activeProfileId)) return state;
  if (state.profiles.length > 0) {
    return { ...state, activeProfileId: state.profiles[0].id };
  }
  const name = state.user.nickname || state.user.email || state.user.name || DEFAULT_PROFILE_NAME;
  const p = createDefaultProfile(name);
  return { ...state, profiles: [p], activeProfileId: p.id };
}

function updateActiveProfile(state: AppState, updater: (p: Profile) => Profile): AppState {
  state = ensureActiveProfile(state);
  const idx = state.profiles.findIndex(p => p.id === state.activeProfileId);
  if (idx === -1) return state;
  const updated = [...state.profiles];
  updated[idx] = updater({ ...updated[idx] });
  return { ...state, profiles: updated };
}

// â”€â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AppAction =
  | { type: 'SET_USER'; payload: { name: string; status: string; email?: string; nickname?: string; phone?: string; apiKey?: string } }
  | { type: 'SET_PLAYLIST'; payload: PlaylistData | null }
  | { type: 'CLEAR_PLAYLIST' }
  | { type: 'TOGGLE_FAVORITE'; payload: Favorite }
  | { type: 'ADD_HISTORY'; payload: HistoryItem }
  | { type: 'TOGGLE_WATCH_LATER'; payload: { key: string; title: string; type: string; group: string; logo: string } }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_PROFILES'; payload: Profile[] }
  | { type: 'SET_ACTIVE_PROFILE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SEARCH'; payload: string };

// â”€â”€â”€ Reducer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: {
        name: action.payload.name,
        status: action.payload.status,
        email: action.payload.email !== undefined ? action.payload.email : state.user.email,
        nickname: action.payload.nickname !== undefined ? action.payload.nickname : state.user.nickname,
        phone: action.payload.phone !== undefined ? action.payload.phone : state.user.phone,
        apiKey: action.payload.apiKey !== undefined ? action.payload.apiKey : state.user.apiKey,
      }};
    case 'SET_PLAYLIST':   return { ...state, playlist: action.payload };
    case 'CLEAR_PLAYLIST': return { ...state, playlist: null, profiles: [], activeProfileId: '', user: { ...state.user, apiKey: '' } };
    case 'TOGGLE_FAVORITE': {
      state = ensureActiveProfile(state);
      const profile = getActiveProfile(state);
      if (!profile) return state;
      const item = action.payload;
      const idx = profile.favorites.findIndex(f => f.key === item.key);
      const newFavs = idx !== -1
        ? profile.favorites.filter(f => f.key !== item.key)
        : [{ ...item, savedAt: Date.now() }, ...profile.favorites];
      return updateActiveProfile(state, p => ({ ...p, favorites: newFavs }));
    }
    case 'ADD_HISTORY': {
      state = ensureActiveProfile(state);
      const profile = getActiveProfile(state);
      if (!profile) return state;
      const item = action.payload;
      const filtered = profile.watch_progress.filter(h => h.key !== item.key);
      const updated = [{ ...item, addedAt: Date.now() }, ...filtered].slice(0, 50);
      return updateActiveProfile(state, p => ({ ...p, watch_progress: updated }));
    }
    case 'TOGGLE_WATCH_LATER': {
      state = ensureActiveProfile(state);
      const profile = getActiveProfile(state);
      if (!profile) return state;
      const item = action.payload;
      const idx = profile.watch_later.findIndex(w => w.key === item.key);
      const newList = idx !== -1
        ? profile.watch_later.filter(w => w.key !== item.key)
        : [{ ...item, addedAt: Date.now() }, ...profile.watch_later];
      return updateActiveProfile(state, p => ({ ...p, watch_later: newList }));
    }
    case 'CLEAR_HISTORY': {
      state = ensureActiveProfile(state);
      return updateActiveProfile(state, p => ({ ...p, watch_progress: [] }));
    }
    case 'SET_PROFILES': return { ...state, profiles: action.payload };
    case 'SET_ACTIVE_PROFILE': return { ...state, activeProfileId: action.payload };
    case 'SET_LOADING':   return { ...state, isLoading: action.payload };
    case 'SET_SEARCH':    return { ...state, searchTerm: action.payload };
    default:              return state;
  }
}

// â”€â”€â”€ Split contexts for performance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type CoreState = Readonly<{
  user: AppState['user'];
  playlist: AppState['playlist'];
  searchTerm: AppState['searchTerm'];
  isLoading: AppState['isLoading'];
  profiles: AppState['profiles'];
  activeProfileId: AppState['activeProfileId'];
}>;

const CoreContext = createContext<{ state: CoreState; dispatch: React.Dispatch<AppAction> } | undefined>(undefined);
const FavoritesContext = createContext<Favorite[]>([]);
const HistoryContext = createContext<HistoryItem[]>([]);

// â”€â”€â”€ AsyncStorage profile cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PROFILES_CACHE_KEY = 'pusztaplay_profiles_v2';

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
          dispatch({ type: 'SET_PROFILES', payload: profiles });
        }
      } catch {}
      if (!cancelled) {
        dispatch({ type: 'SET_LOADING', payload: false });
        loadedRef.current = true;
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
    return () => { wpFlush(); };
  }, [state.profiles, state.user.apiKey, state.activeProfileId]);

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
    },
    dispatch,
  }), [state.user, state.playlist, state.searchTerm, state.isLoading, state.profiles, state.activeProfileId, dispatch]);

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

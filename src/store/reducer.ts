import { PlaylistData, Favorite, HistoryItem, WatchLaterItem } from '../types';
import { DEFAULT_PROFILE_NAME } from '../constants';

// ─── State ─────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  color: string;
  avatar: string;
  preferences: { live: string[]; movies: string[]; series: string[] };
  favorites: Favorite[];
  watch_later: WatchLaterItem[];
  watch_progress: HistoryItem[];
  radio_recents: string[];
  radio_plays: Record<string, number>;
  deleted?: boolean;
  deletedAt?: number;
}

export interface AppState {
  user: { name: string; status: string; email: string; nickname: string; phone: string; apiKey: string };
  playlist: PlaylistData | null;
  favorites: Favorite[];
  watchHistory: HistoryItem[];
  profiles: Profile[];
  activeProfileId: string;
  isLoading: boolean;
  searchTerm: string;
  backgroundAudio: { stationName: string; stationLogo: string; streamUrl: string; streamType: string; isPlaying: boolean } | null;
}

export const initialState: AppState = {
  user: { name: 'PusztaPlayer fiók', status: 'nincs aktív session', email: '', nickname: '', phone: '', apiKey: '' },
  playlist: null,
  favorites: [],
  watchHistory: [],
  profiles: [],
  activeProfileId: '',
  isLoading: true,
  searchTerm: '',
  backgroundAudio: null,
};

// ─── Helpers ───────────────────────────────────────

let _idCounter = 0;
export function generateId(): string {
  return 'prof_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + (_idCounter++).toString(36);
}

export function createDefaultProfile(name: string, color = '#ffcc00', avatar = '🧑'): Profile {
  return { id: generateId(), name, color, avatar, preferences: { live: [], movies: [], series: [] }, favorites: [], watch_later: [], watch_progress: [], radio_recents: [], radio_plays: {} };
}

export function getActiveProfile(state: AppState): Profile | undefined {
  return state.profiles.find(p => p.id === state.activeProfileId);
}

export function ensureActiveProfile(state: AppState): AppState {
  if (state.profiles.find(p => p.id === state.activeProfileId)) return state;
  if (state.profiles.length > 0) {
    return { ...state, activeProfileId: state.profiles[0].id };
  }
  const name = state.user.nickname || state.user.email || state.user.name || DEFAULT_PROFILE_NAME;
  const p = createDefaultProfile(name);
  return { ...state, profiles: [p], activeProfileId: p.id };
}

export function updateActiveProfile(state: AppState, updater: (p: Profile) => Profile): AppState {
  state = ensureActiveProfile(state);
  const idx = state.profiles.findIndex(p => p.id === state.activeProfileId);
  if (idx === -1) return state;
  const updated = [...state.profiles];
  updated[idx] = updater({ ...updated[idx] });
  return { ...state, profiles: updated };
}

// ─── Actions ──────────────────────────────────────

export type AppAction =
  | { type: 'SET_USER'; payload: { name: string; status: string; email?: string; nickname?: string; phone?: string; apiKey?: string } }
  | { type: 'SET_PLAYLIST'; payload: PlaylistData | null }
  | { type: 'CLEAR_PLAYLIST' }
  | { type: 'TOGGLE_FAVORITE'; payload: Favorite }
  | { type: 'ADD_HISTORY'; payload: HistoryItem }
  | { type: 'TOGGLE_WATCH_LATER'; payload: { key: string; title: string; type: string; group: string; logo: string } }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_RADIO_RECENTS'; payload: string[] }
  | { type: 'SET_RADIO_PLAYS'; payload: Record<string, number> }
  | { type: 'INCREMENT_RADIO_PLAY'; payload: string }
  | { type: 'SET_PROFILES'; payload: Profile[] }
  | { type: 'SET_ACTIVE_PROFILE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'START_BACKGROUND_AUDIO'; payload: { stationName: string; stationLogo: string; streamUrl: string; streamType: string; isPlaying: boolean } }
  | { type: 'STOP_BACKGROUND_AUDIO' }
  | { type: 'CLEAR_BACKGROUND_AUDIO' }
  | { type: 'SET_BACKGROUND_AUDIO'; payload: { stationName: string; stationLogo: string; streamUrl: string; streamType: string; isPlaying: boolean } | null };

// ─── Reducer ──────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
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
    case 'SET_RADIO_RECENTS': {
      return updateActiveProfile(state, p => ({ ...p, radio_recents: (action.payload || []).slice(0, 5) }));
    }
    case 'SET_RADIO_PLAYS': {
      return updateActiveProfile(state, p => ({ ...p, radio_plays: action.payload }));
    }
    case 'INCREMENT_RADIO_PLAY': {
      return updateActiveProfile(state, p => ({
        ...p,
        radio_plays: { ...(p.radio_plays || {}), [action.payload]: ((p.radio_plays || {})[action.payload] || 0) + 1 },
      }));
    }
    case 'SET_PROFILES': return { ...state, profiles: action.payload };
    case 'SET_ACTIVE_PROFILE': return { ...state, activeProfileId: action.payload };
    case 'SET_LOADING':   return { ...state, isLoading: action.payload };
    case 'SET_SEARCH':    return { ...state, searchTerm: action.payload };
    case 'START_BACKGROUND_AUDIO': return { ...state, backgroundAudio: action.payload };
    case 'STOP_BACKGROUND_AUDIO': return state.backgroundAudio ? { ...state, backgroundAudio: { ...state.backgroundAudio, isPlaying: false } } : state;
    case 'CLEAR_BACKGROUND_AUDIO': return { ...state, backgroundAudio: null };
    case 'SET_BACKGROUND_AUDIO': return { ...state, backgroundAudio: action.payload };
    default:              return state;
  }
}

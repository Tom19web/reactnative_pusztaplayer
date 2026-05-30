// ─── Navigációs route-ok ────────────────────────────
export type RouteName = 'Login' | 'Home' | 'Live' | 'Movies' | 'Series' | 'EPG' | 'Favorites' | 'WatchLater' | 'Player' | 'UserInfo';

// ─── Live TV csatorna ─────────────────────────────────
export interface Channel {
  key: string;
  streamId: number;
  title: string;
  group: string;
  logo: string;
  status: string;
  epg: EpgEntry[];
  type: 'live';
  streamUrl: string;
  /** Quality variants (SD/HD/FHD) merged from duplicate logo channels */
  qualityVariants?: { label: string; streamId: number; streamUrl: string; key: string }[];
  /** Raw API response fields for debugging */
  raw?: Record<string, unknown>;
}

// ─── Film (VOD) ──────────────────────────────────────
export interface Movie {
  key: string;
  streamId: number;
  title: string;
  group: string;
  logo: string;
  status: string;
  type: 'movie';
  streamUrl: string;
  genre: string;
  year: string;
}

// ─── Sorozat ─────────────────────────────────────────
export interface Series {
  key: string;
  seriesId: number;
  title: string;
  group: string;
  logo: string;
  status: string;
  type: 'series';
  streamUrl: string | null;
  genre: string;
  year: string;
}

// ─── Epizód ──────────────────────────────────────────
export interface Episode {
  key: string;
  title: string;
  streamUrl: string;
  type: 'episode';
  seriesId: number;
  seasonNum: string;
  group: string;
  logo?: string;
  id?: number;
  episode_num?: number;
}

// ─── Teljes playlist (Xtream API-ból) ──────────────
export interface PlaylistData {
  liveChannels: Channel[];
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  groups: string[];
  movieGroups: string[];
  seriesGroups: string[];
  userInfo: UserInfo | null;
  xtreamUser: string;
}

// ─── Xtream user info ────────────────────────────────
export interface UserInfo {
  username: string;
  password: string;
  auth?: number;
  exp_date?: string;
  is_trial?: string;
  active_cons?: string;
  created_at?: string;
  max_connections?: string;
  allowed_output_formats?: string[];
}

// ─── Kedvenc ─────────────────────────────────────────
export interface Favorite {
  key: string;
  title: string;
  type: 'live' | 'movie' | 'series' | 'episode';
  group: string;
  logo: string;
  streamUrl: string;
  seriesId: string;
  streamId?: string;
  savedAt?: number;
}

// ─── Watch history elem ──────────────────────────────
export interface HistoryItem {
  key: string;
  title: string;
  type: string;
  group: string;
  logo: string;
  streamUrl: string;
  position: number;
  duration: number;
  addedAt?: number;
  episodeKey?: string;
  seriesId?: number;
}

// ─── Watch later elem ──────────────────────────────
export interface WatchLaterItem {
  key: string;
  title: string;
  type: string;
  group: string;
  logo: string;
  addedAt?: number;
}

// ─── Player session ──────────────────────────────────
export interface PlayerSession {
  contentId: string;
  title: string;
  streamType: string;
  token: string;
  streamUrl: string;
  isLive: boolean;
}

// ─── EPG bejegyzés ───────────────────────────────────
export interface EpgEntry {
  time: string;
  endTime: string;
  title: string;
  description: string;
}

export interface EpgProgram {
  id: string;
  channelId: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  startTimestamp: number;
  endTimestamp: number;
}

// ─── Xtream login eredmény ───────────────────────────
export interface LoginResult {
  userInfo: UserInfo;
  liveChannels: Channel[];
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  groups: string[];
  movieGroups: string[];
  seriesGroups: string[];
  xtreamUser: string;
}

// ─── QR auth ─────────────────────────────────────────
export interface QrRequestResult {
  code: string;
  authUrl: string;
  expiresIn: number;
}

export interface QrPollResult {
  status: 'pending' | 'authenticated' | 'expired';
  xtream_user?: string;
  xtream_pass?: string;
  user_email?: string;
  nickname?: string;
  phone?: string;
  api_key?: string;
  package?: string;
  sub_end?: string;
}

// ─── Player meta (lejátszott tartalom metaadatai) ──
export interface PlayerMeta {
  title?: string;
  type?: string;
  seriesId?: number;
  streamId?: number;
  streamUrl?: string;
  group?: string;
  logo?: string;
}

// ─── Xtream API raw response típusok ─────────────────
export interface XtreamLiveStream {
  stream_id: number;
  name: string;
  stream_icon: string;
  category_id: string;
  category_name: string;
}

export interface XtreamVodStream {
  stream_id: number;
  name: string;
  stream_icon: string;
  category_id: string;
  category_name: string;
  container_extension: string;
  genre: string;
  year: string;
  releasedate: string;
}

export interface XtreamSeriesItem {
  series_id: number;
  name: string;
  cover: string;
  stream_icon: string;
  category_id: string;
  category_name: string;
  genre: string;
  year: string;
  releaseDate: string;
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
}

export interface XtreamVodInfo {
  info: {
    name: string;
    year: string;
    genre: string;
    director: string;
    cast: string;
    plot: string;
    cover_big: string;
    rating: string;
    releasedate?: string;
    movie_image?: string;
  };
  movie_data: Record<string, unknown>;
}

export interface XtreamSeriesInfo {
  info: {
    name: string;
    year: string;
    releaseDate: string;
    genre: string;
    director: string;
    cast: string;
    plot: string;
    cover: string;
    rating: string;
    backdrop_path?: string[];
  };
  episodes: Record<string, XtreamEpisode[]>;
}

export interface XtreamEpisode {
  id: number;
  episode_num: number;
  title: string;
  container_extension: string;
  info?: {
    movie_image?: string;
  };
}

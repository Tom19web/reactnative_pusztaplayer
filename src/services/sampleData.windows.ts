// Windows: embedded sample data for UI testing (no network available on RNW 0.84)

import type { PlaylistData, LoginResult } from '../types';

export const DEMO_USER = { username: 'kertesznora', password: 'Kertesznora.kn' };

export function createSamplePlaylist(): PlaylistData {
  return {
    xtreamUser: DEMO_USER.username,
    liveChannels: [
      { key: 'live-1', streamId: 1, title: 'Hírcsatorna HD', group: 'Magyar', logo: '', status: 'Élő · Magyar', epg: [], epgId: 0, type: 'live', streamUrl: '' },
      { key: 'live-2', streamId: 2, title: 'Sport 1', group: 'Magyar', logo: '', status: 'Élő · Magyar', epg: [], epgId: 0, type: 'live', streamUrl: '' },
      { key: 'live-3', streamId: 3, title: 'Film+', group: 'Magyar', logo: '', status: 'Élő · Magyar', epg: [], epgId: 0, type: 'live', streamUrl: '' },
      { key: 'live-4', streamId: 4, title: 'Discovery Channel', group: 'Angol', logo: '', status: 'Élő · Angol', epg: [], epgId: 0, type: 'live', streamUrl: '' },
      { key: 'live-5', streamId: 5, title: 'National Geographic', group: 'Angol', logo: '', status: 'Élő · Angol', epg: [], epgId: 0, type: 'live', streamUrl: '' },
      { key: 'live-6', streamId: 6, title: 'Cartoon Network', group: 'Gyerek', logo: '', status: 'Élő · Gyerek', epg: [], epgId: 0, type: 'live', streamUrl: '' },
    ],
    movieChannels: [
      { key: 'vod-1', streamId: 101, title: 'Új film 2024', group: 'Akció', logo: '', status: 'Akció', type: 'movie', streamUrl: '', genre: 'Akció', year: '2024' },
      { key: 'vod-2', streamId: 102, title: 'Vígjáték', group: 'Vígjáték', logo: '', status: 'Vígjáték', type: 'movie', streamUrl: '', genre: 'Vígjáték', year: '2023' },
    ],
    seriesChannels: [
      { key: 'series-1', seriesId: 201, title: 'Trónok harca', group: 'Sorozat', logo: '', status: 'Sorozat', type: 'series', streamUrl: null, genre: 'Fantasy', year: '2011' },
      { key: 'series-2', seriesId: 202, title: 'Breaking Bad', group: 'Sorozat', logo: '', status: 'Sorozat', type: 'series', streamUrl: null, genre: 'Dráma', year: '2008' },
    ],
    groups: ['Összes csatorna', 'Magyar', 'Angol', 'Gyerek'],
    movieGroups: ['Összes film', 'Akció', 'Vígjáték'],
    seriesGroups: ['Összes sorozat', 'Sorozat'],
    liveEpg: {},
    liveCategories: [],
    movieCategories: [],
    seriesCategories: [],
  };
}

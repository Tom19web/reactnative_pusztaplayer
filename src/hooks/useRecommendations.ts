import { useMemo } from 'react';
import { HistoryItem, Favorite, PlaylistData, Movie, Series } from '../types';
import { genresToMoods, getAllMoods } from '../constants/moods';

function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function moodFromGenre(genre: string | undefined): string | null {
  if (!genre || genre.trim() === '') return null;
  const moods = genresToMoods(genre);
  return moods.length > 0 ? moods[0] : null;
}

function topMoodFromItems(
  items: { genre?: string; group?: string }[],
): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const mood = moodFromGenre(item.genre) || moodFromGenre(item.group);
    if (mood) counts.set(mood, (counts.get(mood) || 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = '';
  let bestCount = 0;
  for (const [m, c] of counts) {
    if (c > bestCount) { bestCount = c; best = m; }
  }
  return best;
}

function filterByMood(media: (Movie | Series)[], mood: string, excludeKeys: Set<string>): (Movie | Series)[] {
  return media.filter(m => {
    if (excludeKeys.has(m.key)) return false;
    const moods = genresToMoods(m.genre);
    return moods.includes(mood);
  });
}

export function useRecommended(
  history: HistoryItem[],
  playlist: PlaylistData | null,
  favorites: Favorite[],
): { items: (Movie | Series)[]; title: string; source: string } {
  return useMemo(() => {
    if (!playlist) return { items: [], title: '', source: '' };
    const allMedia = [...(playlist.movies || []), ...(playlist.series || [])];
    if (allMedia.length === 0) return { items: [], title: '', source: '' };
    const excludeKeys = new Set(history.map(h => h.key));

    // 1. History-based
    const hMood = topMoodFromItems(history);
    if (hMood) {
      const items = filterByMood(allMedia, hMood, excludeKeys);
      if (items.length >= 4) {
        return { items: sample(items, 10), title: `Neked ajánljuk — ${hMood}`, source: 'history' };
      }
    }

    // 2. Favorites-based
    const fMood = topMoodFromItems(favorites);
    if (fMood) {
      const items = filterByMood(allMedia, fMood, excludeKeys);
      if (items.length >= 4) {
        return { items: sample(items, 10), title: 'Kedvenceid alapján', source: 'favorites' };
      }
    }

    // 3. Playlist popular mood
    const pMood = topMoodFromItems(allMedia);
    if (pMood) {
      const items = filterByMood(allMedia, pMood, excludeKeys);
      if (items.length >= 4) {
        return { items: sample(items, 10), title: `Fedezd fel — ${pMood}`, source: 'popular' };
      }
    }

    // Last resort: random
    const remaining = allMedia.filter(m => !excludeKeys.has(m.key));
    return { items: sample(remaining, 10), title: 'Fedezd fel', source: 'random' };
  }, [history, playlist, favorites]);
}

export function usePopular(
  totalProfiles: number,
  playlist: PlaylistData | null,
  allHistory: HistoryItem[],
  allFavorites: Favorite[],
): { items: (Movie | Series)[] } {
  return useMemo(() => {
    if (!playlist) return { items: [] };
    const allMedia = [...(playlist.movies || []), ...(playlist.series || [])];
    if (allMedia.length === 0) return { items: [] };

    // Multi-profile: top by combined popularity
    if (totalProfiles >= 2 && (allHistory.length > 0 || allFavorites.length > 0)) {
      const counts = new Map<string, number>();
      for (const h of allHistory) counts.set(h.key, (counts.get(h.key) || 0) + 3);
      for (const f of allFavorites) counts.set(f.key, (counts.get(f.key) || 0) + 1);
      const sorted = allMedia
        .filter(m => counts.has(m.key))
        .sort((a, b) => (counts.get(b.key) || 0) - (counts.get(a.key) || 0));
      if (sorted.length >= 4) return { items: sorted.slice(0, 10) };
    }

    // Fallback: top group
    const groups = new Map<string, number>();
    for (const m of allMedia) {
      const g = m.group || '';
      groups.set(g, (groups.get(g) || 0) + 1);
    }
    let topGroup = '';
    let topCount = 0;
    for (const [g, c] of groups) {
      if (c > topCount) { topCount = c; topGroup = g; }
    }
    const groupItems = allMedia.filter(m => (m.group || '') === topGroup);
    return { items: sample(groupItems, 10) };
  }, [totalProfiles, playlist, allHistory, allFavorites]);
}

let AsyncStorage: any;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default || require('@react-native-async-storage/async-storage'); } catch { AsyncStorage = null; }

const RADIO_PLAYS_KEY = 'pusztaplay_radio_plays';
const RADIO_RECENTS_KEY = 'pusztaplay_radio_recents';

export async function getRadioPlayCounts(): Promise<Record<string, number>> {
  try {
    if (!AsyncStorage) return {};
    const raw = await AsyncStorage.getItem(RADIO_PLAYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function incrementRadioPlay(key: string): Promise<void> {
  try {
    if (!AsyncStorage) return;
    const counts = await getRadioPlayCounts();
    counts[key] = (counts[key] || 0) + 1;
    await AsyncStorage.setItem(RADIO_PLAYS_KEY, JSON.stringify(counts));
  } catch {}
}

export async function loadRadioRecents(): Promise<string[]> {
  try {
    if (!AsyncStorage) return [];
    const raw = await AsyncStorage.getItem(RADIO_RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveRadioRecents(keys: string[]): Promise<void> {
  try {
    if (!AsyncStorage) return;
    // Keep only last 5
    await AsyncStorage.setItem(RADIO_RECENTS_KEY, JSON.stringify(keys.slice(0, 5)));
  } catch {}
}

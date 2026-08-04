import { loadXtreamCredentials } from './storage';
import { registerSession } from './liveProxy';
let AsyncStorage: any;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default
    || require('@react-native-async-storage/async-storage');
} catch { AsyncStorage = null; }

const SESSION_REFRESH_KEY = 'pusztaplay_last_session_refresh';
const REFRESH_INTERVAL = 12 * 3600 * 1000; // 12 óra

export async function maybeRefreshSession(): Promise<void> {
  if (!AsyncStorage) return;
  try {
    const raw = await AsyncStorage.getItem(SESSION_REFRESH_KEY);
    const now = Date.now();
    if (raw && now - parseInt(raw, 10) < REFRESH_INTERVAL) return;
  } catch {}
  try {
    const creds = await loadXtreamCredentials();
    if (!creds) return;
    await registerSession(creds.username, creds.password);
    await AsyncStorage.setItem(SESSION_REFRESH_KEY, String(Date.now()));
  } catch {}
}

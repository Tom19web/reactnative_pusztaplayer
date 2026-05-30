import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import { STORAGE_KEYS } from '../constants';

function warn(op: string, e: unknown) {
  if (__DEV__) console.warn(`[storage] ${op} failed:`, e instanceof Error ? e.message : String(e));
}

// ─── Xtream credentials (EncryptedStorage + AsyncStorage fallback) ───
let credsCache: { username: string; password: string; email?: string; nickname?: string; phone?: string; apiKey?: string } | null = null;
let credsLoaded = false;

async function getStore() {
  try {
    await EncryptedStorage.getItem('_ping');
    return EncryptedStorage;
  } catch {
    return AsyncStorage;
  }
}

export async function saveXtreamCredentials(username: string, password: string, extra: { email?: string; nickname?: string; phone?: string; apiKey?: string } = {}): Promise<void> {
  try {
    const store = await getStore();
    await store.setItem(STORAGE_KEYS.XTREAM_CREDS, JSON.stringify({ username, password, ...extra }));
    credsCache = { username, password, ...extra };
    credsLoaded = true;
  } catch (e) {
    warn('saveXtreamCredentials', e);
  }
}

export async function loadXtreamCredentials(): Promise<{ username: string; password: string; email?: string; nickname?: string; phone?: string; apiKey?: string } | null> {
  if (credsLoaded) return credsCache;
  try {
    let store = await getStore();
    let raw = await store.getItem(STORAGE_KEYS.XTREAM_CREDS);
    // Migrate from plain AsyncStorage to EncryptedStorage
    if (!raw && store === EncryptedStorage) {
      const oldRaw = await AsyncStorage.getItem(STORAGE_KEYS.XTREAM_CREDS);
      if (oldRaw) {
        await EncryptedStorage.setItem(STORAGE_KEYS.XTREAM_CREDS, oldRaw);
        await AsyncStorage.removeItem(STORAGE_KEYS.XTREAM_CREDS);
        raw = oldRaw;
      }
    }
    credsCache = raw ? JSON.parse(raw) : null;
    credsLoaded = true;
    return credsCache;
  } catch (e) {
    warn('loadXtreamCredentials', e);
    return null;
  }
}

export function clearCredentialCache(): void {
  credsLoaded = false;
  credsCache = null;
}

export async function clearXtreamCredentials(): Promise<void> {
  try {
    const store = await getStore();
    await store.removeItem(STORAGE_KEYS.XTREAM_CREDS);
    credsCache = null;
  } catch (e) {
    warn('clearXtreamCredentials', e);
  }
}

/**
 * Windows storage adapter.
 *
 * DROP-IN REPLACEMENT for src/services/storage.ts on Windows.
 *
 * Differences from original:
 * - Uses Windows Credential Manager (via native module) for encrypted storage
 * - Falls back to AsyncStorage when native module is not built
 * - Same API surface as original: saveXtreamCredentials, loadXtreamCredentials,
 *   clearXtreamCredentials, clearCredentialCache
 *
 * TODO: Build the WindowsCredentialManager native module (C++/C#)
 *       to enable real encrypted storage on Windows.
 */

import { Platform } from 'react-native';
import { STORAGE_KEYS } from '../constants';

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

function warn(op: string, e: unknown) {
  console.warn(`[storage] ${op} failed:`, e instanceof Error ? e.message : String(e));
}

let credsCache: { username: string; password: string; email?: string; nickname?: string; phone?: string; apiKey?: string } | null = null;
let credsLoaded = false;

let windowsSecureModule: {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
} | null = null;

function getWindowsSecureStore() {
  if (windowsSecureModule !== undefined) return windowsSecureModule;
  if (Platform.OS !== 'windows') return null;

  try {
    windowsSecureModule = require('react-native').NativeModules
      .WindowsCredentialManager as typeof windowsSecureModule;
  } catch {
    windowsSecureModule = null;
  }
  return windowsSecureModule || null;
}

async function getStore() {
  const secure = getWindowsSecureStore();
  if (secure) return secure;
  return AsyncStorage;
}

export async function saveXtreamCredentials(
  username: string,
  password: string,
  extra: { email?: string; nickname?: string; phone?: string; apiKey?: string } = {},
): Promise<void> {
  try {
    const store = await getStore();
    await store.setItem(STORAGE_KEYS.XTREAM_CREDS, JSON.stringify({ username, password, ...extra }));
    credsCache = { username, password, ...extra };
    credsLoaded = true;
  } catch (e) {
    warn('saveXtreamCredentials', e);
  }
}

export async function loadXtreamCredentials(): Promise<{
  username: string;
  password: string;
  email?: string;
  nickname?: string;
  phone?: string;
  apiKey?: string;
} | null> {
  if (credsLoaded) return credsCache;
  try {
    const store = await getStore();
    const raw = await store.getItem(STORAGE_KEYS.XTREAM_CREDS);
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

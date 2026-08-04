/**
 * Rádió recensek és lejátszás számlálók.
 * Az adatok a Profile-ban tárolódnak (pusztaplay_profiles_v2), így
 * a WordPress sync automatikusan szinkronizálja őket.
 */
let _dispatch: any = null;

export function setRadioStorageDispatch(d: any) {
  _dispatch = d;
}

export async function getRadioPlayCounts(): Promise<Record<string, number>> {
  return {};
}

export async function incrementRadioPlay(key: string): Promise<void> {
  if (_dispatch) _dispatch({ type: 'INCREMENT_RADIO_PLAY', payload: key });
}

export async function loadRadioRecents(): Promise<string[]> {
  return [];
}

export async function saveRadioRecents(keys: string[]): Promise<void> {
  if (_dispatch) _dispatch({ type: 'SET_RADIO_RECENTS', payload: keys.slice(0, 5) });
}

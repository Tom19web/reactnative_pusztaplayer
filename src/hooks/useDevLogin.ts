import { useState, useCallback } from 'react';
import { USER_AGENT, QR_API_BASE, USER_STATUS_LOGGED_IN } from '../constants';
import { xtreamLogin } from '../services/playlistService';
import { saveXtreamCredentials } from '../services/storage';
import { useSetUser, useSetPlaylist } from '../store/AppContext';

export function useDevLogin() {
  const setUser = useSetUser();
  const setPlaylist = useSetPlaylist();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${QR_API_BASE}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setError(data.error || 'HibĂˇs email vagy jelszĂł.');
        setLoading(false);
        return false;
      }
      if (!data.xtream_user || !data.xtream_pass) {
        setError('Nincs Xtream fiĂłk tĂˇrsĂ­tva ehhez a felhasznĂˇlĂłhoz.');
        setLoading(false);
        return false;
      }
      const { xtream_user: xtreamUser, xtream_pass: xtreamPass, email: em, nickname, phone, api_key: apiKey } = data;
      const playlist = await xtreamLogin(xtreamUser, xtreamPass);
      setUser(xtreamUser, USER_STATUS_LOGGED_IN, em || '', nickname || '', phone || '', apiKey || '');
      saveXtreamCredentials(xtreamUser, xtreamPass, { email: em, nickname, phone, apiKey });
      setPlaylist(playlist);
      setLoading(false);
      return true;
    } catch (e: unknown) {
      setError('HĂˇlĂłzati hiba: ' + (e instanceof Error ? e.message : 'ismeretlen'));
      setLoading(false);
      return false;
    }
  }, [setUser, setPlaylist]);

  const reset = useCallback(() => { setLoading(false); setError(''); }, []);

  return { loading, error, login, reset };
}

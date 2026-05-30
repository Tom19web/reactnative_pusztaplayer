import { QR_API_BASE, QR_POLL_INTERVAL, QR_POLL_TIMEOUT } from '../constants';
import { QrRequestResult, QrPollResult } from '../types';
import { fetchWithTimeout } from './fetchWithTimeout';

let pollingTimer: ReturnType<typeof setTimeout> | null = null;

export async function requestQRCode(): Promise<QrRequestResult> {
  const res = await fetchWithTimeout(`${QR_API_BASE}/qr-request`, { method: 'POST' }, 15000);
  if (!res.ok) throw new Error('QR kód igénylés sikertelen');
  const data = await res.json();
  return { code: data.code, authUrl: data.auth_url, expiresIn: data.expires_in };
}

export function pollQRCode(
  code: string,
  onResult: (result: { xtreamUser: string; xtreamPass: string; userEmail?: string; nickname?: string; phone?: string; apiKey?: string; package?: string; subEnd?: string }) => void,
  onError: (error: string) => void,
): void {
  let attempts = 0;
  const maxAttempts = Math.ceil(QR_POLL_TIMEOUT / QR_POLL_INTERVAL);

  function poll() {
    if (pollingTimer === null) return;
    attempts++;
    fetchWithTimeout(`${QR_API_BASE}/qr-poll?code=${encodeURIComponent(code)}`, {}, 10000)
      .then(r => r.json())
      .then((data: QrPollResult) => {
        if (data.status === 'authenticated') {
          stopPolling();
          onResult({
            xtreamUser: data.xtream_user || '',
            xtreamPass: data.xtream_pass || '',
            userEmail: data.user_email || '',
            nickname: data.nickname || '',
            phone: data.phone || '',
            apiKey: data.api_key || '',
            package: data.package,
            subEnd: data.sub_end,
          });
        } else if (data.status === 'expired') {
          stopPolling();
          onError('A kód lejárt. Kérj újat.');
        } else if (attempts >= maxAttempts) {
          stopPolling();
          onError('Időtúllépés. A kód érvényessége 5 perc.');
        } else {
          pollingTimer = setTimeout(poll, QR_POLL_INTERVAL);
        }
      })
      .catch((err: Error) => {
        stopPolling();
        onError('Hálózati hiba: ' + err.message);
      });
  }

  pollingTimer = setTimeout(poll, QR_POLL_INTERVAL);
}

export function stopPolling(): void {
  if (pollingTimer !== null) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

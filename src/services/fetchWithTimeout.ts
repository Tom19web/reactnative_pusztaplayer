import { Platform } from 'react-native';

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  if (Platform.OS === 'windows') {
    try {
      const { winHttpFetch } = await import('../stubs/WinHttpModule.windows');
      const method = options.method || 'GET';
      const reqBody = options.body ? String(options.body) : '';
      const resp = await winHttpFetch(url, method, reqBody);
      return {
        ok: resp.status >= 200 && resp.status < 300,
        status: resp.status,
        statusText: '',
        headers: new Headers(),
        url,
        async json() { return JSON.parse(resp.body); },
        async text() { return resp.body; },
      } as Response;
    } catch {}
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

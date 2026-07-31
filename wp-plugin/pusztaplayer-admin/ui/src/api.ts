const BASE = (window as any).PPADMIN_CONFIG?.apiBase || '/wp-json/pusztaplayer/v1';
const NONCE = (window as any).PPADMIN_CONFIG?.nonce || '';

export async function apiGet(path: string, params?: Record<string, string>): Promise<any> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${BASE}/${path}${qs}`, {
    headers: { 'X-WP-Nonce': NONCE },
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

export async function apiPost(path: string, body?: any): Promise<any> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': NONCE },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

export async function apiDelete(path: string): Promise<any> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'DELETE',
    headers: { 'X-WP-Nonce': NONCE },
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

export function streamImportLog(taskId: string, onLine: (line: string) => void, onDone: (exitCode: string) => void): EventSource {
  const src = new EventSource(`${BASE}/admin/import/stream/${taskId}`);
  src.addEventListener('done', (e: any) => {
    try {
      const data = JSON.parse(e.data);
      onDone(data.exit_code || '0');
    } catch { onDone('0'); }
    src.close();
  });
  src.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.line) onLine(d.line);
    } catch { onLine(e.data); }
  };
  src.onerror = () => src.close();
  return src;
}

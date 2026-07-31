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

export async function pollImportLog(taskId: string, onLines: (lines: string[]) => void): Promise<void> {
  let done = false;
  while (!done) {
    try {
      const res = await fetch(`${BASE}/admin/import/stream/${taskId}`);
      if (!res.ok) break;
      const data = await res.json();
      if (data.lines) onLines(data.lines);
      if (data.status === 'done') done = true;
    } catch {
      break;
    }
    if (!done) await new Promise(r => setTimeout(r, 1000));
  }
}

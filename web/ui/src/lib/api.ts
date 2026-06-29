// Token-aware client. The dashboard server (src/server/dashboard.ts) binds
// 127.0.0.1 and guards every /api/* route with a nanoid token, accepted either
// as `?t=…` (how the CLI auto-opens the page) or a Bearer header. We read it
// once from the URL and send it both ways so it survives client-side routing.

import type {
  CallSummary, CallRecord, ScorecardEnvelope, ConfigSummary,
  KeyStatus, PhoneStatus, ConfigEdit, ImproveEvent,
} from './types';

export const token = new URLSearchParams(location.search).get('t') ?? '';

function withToken(path: string): string {
  if (!token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}t=${encodeURIComponent(token)}`;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withToken(path), {
    ...init,
    headers: authHeaders(init?.headers as Record<string, string>),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  token,
  calls: (limit = 50) => req<CallSummary[]>(`/api/calls?limit=${limit}`),
  call: (id: string) => req<CallRecord>(`/api/calls/${encodeURIComponent(id)}`),
  scorecard: () => req<ScorecardEnvelope>('/api/scorecard'),
  config: () => req<ConfigSummary>('/api/config'),
  saveConfig: (edits: ConfigEdit[]) =>
    req<{ ok: boolean; backupPath?: string; error?: string }>('/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edits }),
    }),
  keys: () => req<KeyStatus[]>('/api/keys-status'),
  phoneStatus: () => req<PhoneStatus>('/api/phone/status'),
};

/**
 * POST /api/improve is SSE over POST (EventSource can't POST), so we stream the
 * response body and parse `data: …\n\n` frames by hand. Calls onEvent for each
 * stage. Returns an abort handle.
 */
export function runImprove(
  body: { mode?: 'gated' | 'unguarded'; apply?: boolean },
  onEvent: (ev: ImproveEvent) => void,
): { abort: () => void } {
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch(withToken('/api/improve'), {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.body) throw new Error('no stream');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        try { onEvent(JSON.parse(line.slice(5).trim()) as ImproveEvent); } catch { /* skip */ }
      }
    }
  })().catch((e) => {
    if ((e as Error).name !== 'AbortError') onEvent({ stage: 'decided', result: { applied: false, reason: String(e), mode: 'gated', patch: { rationale: '', edits: {}, targetDimensions: [] } } });
  });
  return { abort: () => ctrl.abort() };
}

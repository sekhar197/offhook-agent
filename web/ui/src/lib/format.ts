import type { CallOutcome } from './types';

export function ms(n?: number): string {
  if (n == null) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(n < 10000 ? 2 : 1)}s`;
}

export function dur(n?: number): string {
  if (n == null) return '—';
  const s = Math.round(n / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function ago(iso?: string): string {
  if (!iso) return '—';
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function clockTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const outcomeTone: Record<CallOutcome, 'ok' | 'iris' | 'warn' | 'bad' | 'dim'> = {
  completed: 'ok',
  transferred: 'iris',
  caller_hangup: 'warn',
  max_turns: 'warn',
  error: 'bad',
  unknown: 'dim',
};

export function outcomeLabel(o: CallOutcome): string {
  return o.replace(/_/g, ' ');
}

export function pct(n?: number): string {
  if (n == null) return '—';
  return `${Math.round((n <= 1 ? n * 100 : n))}%`;
}

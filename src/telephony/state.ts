/**
 * Local telephony state — offhook-agent has no database, so the provisioned infra IDs
 * (number, trunk, LiveKit trunk/dispatch) live in a gitignored .offhook-agent/
 * telephony.json next to the agent. Kept separate from agent.yaml on purpose:
 * these are infra facts, not agent behavior, and must not pollute the file the
 * self-improve loop edits.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TelephonyState } from './types.js';

export const DEFAULT_STATE_PATH = '.offhook-agent/telephony.json';

export function loadTelephonyState(path: string = DEFAULT_STATE_PATH): TelephonyState | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')) as TelephonyState; } catch { return null; }
}

export function writeTelephonyState(state: TelephonyState, path: string = DEFAULT_STATE_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/** Merge a partial update into the saved state (stamping updatedAt). */
export function mergeTelephonyState(
  patch: Partial<TelephonyState> & { provider: TelephonyState['provider'] },
  path: string = DEFAULT_STATE_PATH,
  now: () => number = Date.now,
): TelephonyState {
  const current = loadTelephonyState(path);
  const next: TelephonyState = { ...(current ?? {}), ...patch, updatedAt: new Date(now()).toISOString() };
  writeTelephonyState(next, path);
  return next;
}

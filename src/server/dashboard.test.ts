import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { getConfigSummary, getKeysStatus, getScorecard, extractToken } from './dashboard.js';

function tmpConfig(extra = ''): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'offhook-dash-'));
  const path = join(dir, 'agent.yaml');
  writeFileSync(path, `agent:\n  id: test-biz\n  businessName: Test Biz\nknowledge:\n  vocabulary:\n    aliases:\n      cleening: Teeth Cleaning\n${extra}`);
  return { dir, path };
}

describe('dashboard data functions', () => {
  it('getConfigSummary returns sanitized config (no raw yaml/keys)', () => {
    const { dir, path } = tmpConfig();
    try {
      const s = getConfigSummary(path);
      expect(s.agent.id).toBe('test-biz');
      expect(s.aliasCount).toBe(1);
      expect(s.observability.sink).toBe('jsonl');
      expect(s.tools.delivery).toBe('console');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('getKeysStatus reports SET/MISSING and never the value', () => {
    const { dir, path } = tmpConfig();
    try {
      const env = { OPENAI_API_KEY: 'sk-supersecret-value' } as NodeJS.ProcessEnv;
      // getKeysStatus reads process.env by default; pass our env explicitly.
      const status = getKeysStatus(path, env);
      const llm = status.find(s => s.purpose.startsWith('LLM'));
      expect(llm?.set).toBe(true);
      const livekit = status.find(s => s.envVar === 'LIVEKIT_API_KEY');
      expect(livekit?.set).toBe(false);
      expect(livekit?.optional).toBe(true);
      // the secret value must never appear anywhere in the output
      expect(JSON.stringify(status)).not.toContain('sk-supersecret-value');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('getScorecard reports unavailable when no run has happened', () => {
    const { dir } = tmpConfig();
    try {
      expect(getScorecard(join(dir, 'improve'))).toEqual({ available: false });
      mkdirSync(join(dir, 'improve'));
      writeFileSync(join(dir, 'improve', 'scorecard.latest.json'), JSON.stringify({ overallPassRate: 0.9 }));
      const s = getScorecard(join(dir, 'improve'));
      expect(s.available).toBe(true);
      expect((s.scorecard as { overallPassRate: number }).overallPassRate).toBe(0.9);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('extractToken reads ?t= and Bearer header', () => {
    expect(extractToken({ headers: {}, url: '/api/calls?t=abc' } as unknown as IncomingMessage)).toBe('abc');
    expect(extractToken({ headers: { authorization: 'Bearer xyz' }, url: '/api/calls' } as unknown as IncomingMessage)).toBe('xyz');
    expect(extractToken({ headers: {}, url: '/api/calls' } as unknown as IncomingMessage)).toBeUndefined();
  });
});

/**
 * Secrets must never reach the dashboard surface. The dashboard is the one place
 * offhook exposes config + key status over HTTP, so a single leaked secret value
 * there is fatal for an "enterprise-friendly / self-hosted" project. This sweeps
 * sentinel secrets for EVERY provider through both read projections and asserts
 * none of the values ever appear in the serialized output (only set/missing).
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfigSummary, getKeysStatus } from '../server/dashboard.js';

const SENTINELS: Record<string, string> = {
  OPENAI_API_KEY: 'sk-LEAK-openai-3f9a',
  DEEPGRAM_API_KEY: 'LEAK-deepgram-7c21',
  CARTESIA_API_KEY: 'LEAK-cartesia-aa01',
  TWILIO_ACCOUNT_SID: 'AC-LEAK-sid-9999',
  TWILIO_AUTH_TOKEN: 'LEAK-twilio-token-beef',
  TELNYX_API_KEY: 'KEY-LEAK-telnyx-1234',
  RESEND_API_KEY: 're_LEAK_resend_5678',
  LIVEKIT_API_KEY: 'LEAK-lk-key-abcd',
  LIVEKIT_API_SECRET: 'LEAK-lk-secret-dcba',
};

function tmpConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'offhook-secret-'));
  const path = join(dir, 'agent.yaml');
  // Minimal valid config; the schema fills the rest with defaults.
  writeFileSync(path, `agent:\n  id: leak-test\n  businessName: Leak Test\nknowledge:\n  vocabulary:\n    aliases:\n      cleening: Teeth Cleaning\n`);
  return path;
}

describe('no secret value ever reaches the dashboard surface', () => {
  const env = { ...SENTINELS } as NodeJS.ProcessEnv;
  const configPath = tmpConfig();

  it('getKeysStatus reports set/missing but never the value (all providers)', () => {
    const status = getKeysStatus(configPath, env);
    const serialized = JSON.stringify(status);
    for (const value of Object.values(SENTINELS)) {
      expect(serialized, `leaked ${value}`).not.toContain(value);
    }
  });

  it('getConfigSummary never embeds a secret value', () => {
    const serialized = JSON.stringify(getConfigSummary(configPath));
    for (const value of Object.values(SENTINELS)) {
      expect(serialized, `leaked ${value}`).not.toContain(value);
    }
  });
});

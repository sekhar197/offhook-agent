import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTelephonyState, writeTelephonyState, mergeTelephonyState } from './state.js';

describe('telephony state', () => {
  it('returns null when no state exists', () => {
    expect(loadTelephonyState('/no/such/.offhook-agent/telephony.json')).toBeNull();
  });

  it('writes (creating .offhook-agent/) and reads back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'offhook-agent-tel-'));
    const path = join(dir, '.offhook-agent', 'telephony.json');
    try {
      writeTelephonyState({ provider: 'twilio', phoneNumber: '+15551234567' }, path);
      expect(existsSync(path)).toBe(true);
      expect(loadTelephonyState(path)?.phoneNumber).toBe('+15551234567');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('merge accumulates across provision → connect, stamping updatedAt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'offhook-agent-tel-'));
    const path = join(dir, '.offhook-agent', 'telephony.json');
    try {
      mergeTelephonyState({ provider: 'twilio', phoneNumber: '+15551234567', trunkSid: 'TR1' }, path, () => 1718000000000);
      const s = mergeTelephonyState({ provider: 'twilio', livekitTrunkId: 'ST1', livekitDispatchRuleId: 'SDR1' }, path, () => 1718000100000);
      expect(s.phoneNumber).toBe('+15551234567'); // preserved from first merge
      expect(s.trunkSid).toBe('TR1');
      expect(s.livekitTrunkId).toBe('ST1');
      expect(s.updatedAt).toBe(new Date(1718000100000).toISOString());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TelephonyClient } from './types.js';
import type { SipApi } from './livekit.js';
import { loadTelephonyState, writeTelephonyState } from './state.js';
import { provisionNumber, connectNumber, releaseNumber, useExistingNumber } from './orchestrate.js';

function fakeClient(over: Partial<TelephonyClient> = {}): { client: TelephonyClient; calls: string[] } {
  const calls: string[] = [];
  const client: TelephonyClient = {
    provider: 'twilio',
    async listAvailableNumbers() { calls.push('list'); return [{ phoneNumber: '+15551234567' }]; },
    async purchaseNumber(n) { calls.push(`buy:${n}`); return { phoneNumberSid: 'PN1' }; },
    async findOwnedNumber(n) { calls.push(`find:${n}`); return n === '+15559998888' ? { phoneNumberSid: 'PNexisting' } : null; },
    async createSipTrunk() { calls.push('trunk'); return { trunkSid: 'TR1' }; },
    async attachNumberToTrunk(p, t) { calls.push(`attach:${p}:${t}`); },
    async releaseNumber(p) { calls.push(`release:${p}`); },
    async deleteTrunk(t) { calls.push(`delTrunk:${t}`); },
    ...over,
  };
  return { client, calls };
}

function fakeSip(): { sip: SipApi; calls: string[] } {
  const calls: string[] = [];
  const sip: SipApi = {
    async createSipInboundTrunk() { calls.push('inbound'); return { sipTrunkId: 'ST1' }; },
    async createSipDispatchRule() { calls.push('dispatch'); return { sipDispatchRuleId: 'SDR1' }; },
    async deleteSipTrunk(id) { calls.push(`delST:${id}`); return {}; },
    async deleteSipDispatchRule(id) { calls.push(`delSDR:${id}`); return {}; },
  };
  return { sip, calls };
}

function tmpState(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'offhook-orch-'));
  return { dir, path: join(dir, '.offhook', 'telephony.json') };
}

describe('provisionNumber', () => {
  it('buys → trunks → attaches → saves state', async () => {
    const { dir, path } = tmpState();
    const { client, calls } = fakeClient();
    try {
      const state = await provisionNumber({ client, livekitSipUri: 'sip:lk', agentId: 'clinic', statePath: path, now: () => 1 });
      expect(calls).toEqual(['list', 'buy:+15551234567', 'trunk', 'attach:PN1:TR1']);
      expect(state).toMatchObject({ provider: 'twilio', phoneNumber: '+15551234567', phoneNumberSid: 'PN1', trunkSid: 'TR1' });
      expect(loadTelephonyState(path)?.phoneNumber).toBe('+15551234567');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('throws when no numbers are available', async () => {
    const { dir, path } = tmpState();
    const { client } = fakeClient({ async listAvailableNumbers() { return []; } });
    try {
      await expect(provisionNumber({ client, livekitSipUri: 'sip:lk', agentId: 'x', statePath: path })).rejects.toThrow(/No numbers/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('useExistingNumber (bring your own)', () => {
  it('uses an owned number: finds it, trunks, attaches, saves — no purchase', async () => {
    const { dir, path } = tmpState();
    const { client, calls } = fakeClient();
    try {
      const state = await useExistingNumber({ client, livekitSipUri: 'sip:lk', agentId: 'clinic', number: '+15559998888', statePath: path, now: () => 1 });
      expect(calls).toEqual(['find:+15559998888', 'trunk', 'attach:PNexisting:TR1']); // no 'buy'
      expect(state).toMatchObject({ phoneNumber: '+15559998888', phoneNumberSid: 'PNexisting', trunkSid: 'TR1' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('errors if the account does not own the number', async () => {
    const { dir, path } = tmpState();
    const { client } = fakeClient();
    try {
      await expect(useExistingNumber({ client, livekitSipUri: 'sip:lk', agentId: 'x', number: '+15550000000', statePath: path })).rejects.toThrow(/don't own/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('connectNumber', () => {
  it('requires a provisioned number first', async () => {
    const { dir, path } = tmpState();
    const { sip } = fakeSip();
    try {
      await expect(connectNumber({ sip, agentId: 'x', agentName: 'offhook', statePath: path })).rejects.toThrow(/provision/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('creates the LiveKit trunk + dispatch and saves the ids', async () => {
    const { dir, path } = tmpState();
    const { sip, calls } = fakeSip();
    try {
      writeTelephonyState({ provider: 'twilio', phoneNumber: '+15551234567', phoneNumberSid: 'PN1', trunkSid: 'TR1' }, path);
      const state = await connectNumber({ sip, agentId: 'clinic', agentName: 'offhook', statePath: path, now: () => 2 });
      expect(calls).toEqual(['inbound', 'dispatch']);
      expect(state).toMatchObject({ livekitTrunkId: 'ST1', livekitDispatchRuleId: 'SDR1', agentName: 'offhook' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('releaseNumber', () => {
  it('tears down LiveKit + provider and resets state', async () => {
    const { dir, path } = tmpState();
    const { client, calls: cc } = fakeClient();
    const { sip, calls: sc } = fakeSip();
    try {
      writeTelephonyState({ provider: 'twilio', phoneNumber: '+1', phoneNumberSid: 'PN1', trunkSid: 'TR1', livekitTrunkId: 'ST1', livekitDispatchRuleId: 'SDR1' }, path);
      await releaseNumber({ client, sip, statePath: path });
      expect(sc).toEqual(['delSDR:SDR1', 'delST:ST1']);
      expect(cc).toEqual(['release:PN1', 'delTrunk:TR1']);
      expect(loadTelephonyState(path)?.phoneNumber).toBeUndefined(); // reset
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

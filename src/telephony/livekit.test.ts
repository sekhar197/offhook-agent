import { describe, expect, it } from 'vitest';
import type { SipApi } from './livekit.js';
import { connectNumberToAgent, disconnectNumber } from './livekit.js';

interface Rec {
  inboundTrunk?: { numbers: string[]; ringingTimeout?: number };
  dispatchRule?: { trunkIds?: string[]; firstAgentName?: string };
  deleted: string[];
}

function fakeSip(): { sip: SipApi; rec: Rec } {
  const rec: Rec = { deleted: [] };
  const sip: SipApi = {
    async createSipInboundTrunk(_name, numbers, opts) {
      rec.inboundTrunk = { numbers, ...(opts?.ringingTimeout !== undefined ? { ringingTimeout: opts.ringingTimeout } : {}) };
      return { sipTrunkId: 'ST1' };
    },
    async createSipDispatchRule(_rule, opts) {
      const agents = (opts?.roomConfig as { agents?: Array<{ agentName: string }> } | undefined)?.agents;
      rec.dispatchRule = { ...(opts?.trunkIds ? { trunkIds: opts.trunkIds } : {}), ...(agents?.[0] ? { firstAgentName: agents[0].agentName } : {}) };
      return { sipDispatchRuleId: 'SDR1' };
    },
    async deleteSipTrunk(id) { rec.deleted.push(`trunk:${id}`); return {}; },
    async deleteSipDispatchRule(id) { rec.deleted.push(`rule:${id}`); return {}; },
  };
  return { sip, rec };
}

describe('connectNumberToAgent', () => {
  it('creates an inbound trunk with the 30s ringing timeout + a dispatch rule carrying the agentName', async () => {
    const { sip, rec } = fakeSip();
    const out = await connectNumberToAgent(sip, { number: '+15551234567', agentId: 'clinic', agentName: 'offhook' });

    expect(rec.inboundTrunk?.numbers).toEqual(['+15551234567']);
    expect(rec.inboundTrunk?.ringingTimeout).toBe(30);

    expect(rec.dispatchRule?.trunkIds).toEqual(['ST1']);
    expect(rec.dispatchRule?.firstAgentName).toBe('offhook');

    expect(out).toEqual({ livekitTrunkId: 'ST1', livekitDispatchRuleId: 'SDR1' });
  });
});

describe('disconnectNumber', () => {
  it('deletes the dispatch rule then the trunk', async () => {
    const { sip, rec } = fakeSip();
    await disconnectNumber(sip, { livekitTrunkId: 'ST1', livekitDispatchRuleId: 'SDR1' });
    expect(rec.deleted).toEqual(['rule:SDR1', 'trunk:ST1']);
  });
});

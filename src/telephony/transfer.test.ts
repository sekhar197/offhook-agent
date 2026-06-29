import { describe, expect, it } from 'vitest';
import { referTarget, transferCaller, type SipTransferApi } from './transfer.js';

describe('referTarget', () => {
  it('builds a carrier-agnostic tel: URI (not sip:@carrier, which LiveKit refuses to dial)', () => {
    expect(referTarget('+15559999999')).toBe('tel:+15559999999');
  });
  it('normalizes a number missing the +', () => {
    expect(referTarget('1 (555) 999-9999')).toBe('tel:+15559999999');
  });
});

describe('transferCaller', () => {
  it('REFERs the SIP participant to a tel: URI and plays a dial tone during the ring', async () => {
    const calls: Array<[string, string, string, unknown]> = [];
    const sip: SipTransferApi = { async transferSipParticipant(room, id, to, opts) { calls.push([room, id, to, opts]); } };
    await transferCaller({ sip, roomName: 'offhook-agent-clinic-abc', participantIdentity: 'sip_+15551112222', transferPhone: '+15559999999' });
    expect(calls).toEqual([['offhook-agent-clinic-abc', 'sip_+15551112222', 'tel:+15559999999', { playDialtone: true }]]);
  });
});

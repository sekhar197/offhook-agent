import { describe, expect, it } from 'vitest';
import { referTarget, transferCaller, type SipTransferApi } from './transfer.js';

describe('referTarget', () => {
  it('builds a SIP URI for the provider', () => {
    expect(referTarget('+15559999999')).toBe('sip:+15559999999@sip.twilio.com');
    expect(referTarget('+15559999999', 'telnyx')).toBe('sip:+15559999999@sip.telnyx.com');
  });
  it('normalizes a number missing the +', () => {
    expect(referTarget('1 (555) 999-9999')).toBe('sip:+15559999999@sip.twilio.com');
  });
});

describe('transferCaller', () => {
  it('REFERs the SIP participant to the human number', async () => {
    const calls: Array<[string, string, string]> = [];
    const sip: SipTransferApi = { async transferSipParticipant(room, id, to) { calls.push([room, id, to]); } };
    await transferCaller({ sip, roomName: 'offhook-clinic-abc', participantIdentity: 'sip_+15551112222', transferPhone: '+15559999999' });
    expect(calls).toEqual([['offhook-clinic-abc', 'sip_+15551112222', 'sip:+15559999999@sip.twilio.com']]);
  });
});

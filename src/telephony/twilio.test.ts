import { describe, expect, it } from 'vitest';
import { createTwilioClient } from './twilio.js';
import { TelephonyError } from './types.js';

const ENV = { TWILIO_ACCOUNT_SID: 'ACxxx', TWILIO_AUTH_TOKEN: 'secret' } as NodeJS.ProcessEnv;

interface Call { url: string; method: string; body?: string; }
function fakeTransport(routes: (url: string, method: string) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body });
    const r = routes(url, method);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('createTwilioClient', () => {
  it('throws clearly when credentials are missing', () => {
    expect(() => createTwilioClient({ env: {} as NodeJS.ProcessEnv })).toThrow(TelephonyError);
  });

  it('lists available numbers (basic auth, parsed)', async () => {
    const { impl, calls } = fakeTransport(() => ({ json: { available_phone_numbers: [{ phone_number: '+15551234567', locality: 'Newark' }] } }));
    const client = createTwilioClient({ env: ENV, fetchImpl: impl });
    const nums = await client.listAvailableNumbers({ areaCode: '973' });
    expect(nums).toEqual([{ phoneNumber: '+15551234567', locality: 'Newark' }]);
    expect(calls[0].url).toContain('/AvailablePhoneNumbers/US/Local.json?AreaCode=973');
  });

  it('purchases a number and returns its sid', async () => {
    const { impl, calls } = fakeTransport(() => ({ json: { sid: 'PN123' } }));
    const r = await createTwilioClient({ env: ENV, fetchImpl: impl }).purchaseNumber('+15551234567');
    expect(r.phoneNumberSid).toBe('PN123');
    expect(calls[0].method).toBe('POST');
    expect(new URLSearchParams(calls[0].body).get('PhoneNumber')).toBe('+15551234567');
  });

  it('creates a SIP trunk and points origination at the LiveKit SIP URI', async () => {
    const { impl, calls } = fakeTransport((url) => url.endsWith('/Trunks') ? { json: { sid: 'TR9' } } : { json: {} });
    const r = await createTwilioClient({ env: ENV, fetchImpl: impl }).createSipTrunk({ name: 'offhook-agent-my-agent', livekitSipUri: 'sip:abc.sip.livekit.cloud' });
    expect(r.trunkSid).toBe('TR9');
    const orig = calls.find(c => c.url.includes('/Trunks/TR9/OriginationUrls'));
    expect(orig).toBeDefined();
    expect(new URLSearchParams(orig!.body).get('SipUrl')).toBe('sip:abc.sip.livekit.cloud');
  });

  it('attaches a number to the trunk', async () => {
    const { impl, calls } = fakeTransport(() => ({ json: {} }));
    await createTwilioClient({ env: ENV, fetchImpl: impl }).attachNumberToTrunk('PN123', 'TR9');
    expect(calls[0].url).toContain('/IncomingPhoneNumbers/PN123.json');
    expect(new URLSearchParams(calls[0].body).get('TrunkSid')).toBe('TR9');
  });

  it('throws TelephonyError on a non-2xx (no silent failure)', async () => {
    const { impl } = fakeTransport(() => ({ status: 400, json: { message: 'bad' } }));
    await expect(createTwilioClient({ env: ENV, fetchImpl: impl }).purchaseNumber('+1')).rejects.toThrow(TelephonyError);
  });
});

import { describe, expect, it } from 'vitest';
import { createTelnyxClient } from './telnyx.js';
import { TelephonyError } from './types.js';

const ENV = { TELNYX_API_KEY: 'KEY123' } as NodeJS.ProcessEnv;

interface Call { url: string; method: string; auth?: string; body?: unknown; }
function fakeTransport(routes: (url: string, method: string) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, auth: init.headers?.Authorization, body: init.body ? JSON.parse(init.body) : undefined });
    const r = routes(url, method);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('createTelnyxClient', () => {
  it('throws when TELNYX_API_KEY is missing', () => {
    expect(() => createTelnyxClient({ env: {} as NodeJS.ProcessEnv })).toThrow(TelephonyError);
  });

  it('lists available numbers via the v2 filter API with a Bearer key', async () => {
    const { impl, calls } = fakeTransport(() => ({ json: { data: [{ phone_number: '+15551234567' }] } }));
    const nums = await createTelnyxClient({ env: ENV, fetchImpl: impl }).listAvailableNumbers({ areaCode: '973' });
    expect(nums).toEqual([{ phoneNumber: '+15551234567' }]);
    expect(calls[0].url).toContain('/v2/available_phone_numbers');
    expect(calls[0].url).toContain('filter[national_destination_code]=973');
    expect(calls[0].auth).toBe('Bearer KEY123');
  });

  it('orders a number and returns its id', async () => {
    const { impl, calls } = fakeTransport(() => ({ json: { data: { phone_numbers: [{ id: 'TNX-1' }] } } }));
    const r = await createTelnyxClient({ env: ENV, fetchImpl: impl }).purchaseNumber('+15551234567');
    expect(r.phoneNumberSid).toBe('TNX-1');
    expect(calls[0].url).toContain('/v2/number_orders');
    expect(calls[0].body).toEqual({ phone_numbers: [{ phone_number: '+15551234567' }] });
  });

  it('finds an owned number (or null)', async () => {
    const found = fakeTransport(() => ({ json: { data: [{ id: 'TNX-9' }] } }));
    expect(await createTelnyxClient({ env: ENV, fetchImpl: found.impl }).findOwnedNumber('+1')).toEqual({ phoneNumberSid: 'TNX-9' });
    const none = fakeTransport(() => ({ json: { data: [] } }));
    expect(await createTelnyxClient({ env: ENV, fetchImpl: none.impl }).findOwnedNumber('+1')).toBeNull();
  });

  it('creates an FQDN connection pointed at the LiveKit SIP host', async () => {
    const { impl, calls } = fakeTransport((url) => url.endsWith('/fqdn_connections') ? { json: { data: { id: 'CONN-1' } } } : { json: {} });
    const r = await createTelnyxClient({ env: ENV, fetchImpl: impl }).createSipTrunk({ name: 'offhook-clinic', livekitSipUri: 'sip:abc.sip.livekit.cloud' });
    expect(r.trunkSid).toBe('CONN-1');
    const fqdn = calls.find(c => c.url.endsWith('/fqdns'));
    expect(fqdn?.body).toMatchObject({ connection_id: 'CONN-1', fqdn: 'abc.sip.livekit.cloud' });
  });

  it('attaches a number by setting its connection_id', async () => {
    const { impl, calls } = fakeTransport(() => ({ json: {} }));
    await createTelnyxClient({ env: ENV, fetchImpl: impl }).attachNumberToTrunk('TNX-1', 'CONN-1');
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain('/v2/phone_numbers/TNX-1');
    expect(calls[0].body).toEqual({ connection_id: 'CONN-1' });
  });
});

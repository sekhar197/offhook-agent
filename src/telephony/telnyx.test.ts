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

  it('orders a number, then returns the /phone_numbers RESOURCE id (not the order id)', async () => {
    // The order POST returns a sub-number id (TNX-ORDER); the resource the agent
    // must PATCH lives under /phone_numbers with a DIFFERENT id (TNX-RESOURCE).
    const { impl, calls } = fakeTransport((url) =>
      url.includes('/number_orders') ? { json: { data: { phone_numbers: [{ id: 'TNX-ORDER' }] } } }
        : { json: { data: [{ id: 'TNX-RESOURCE' }] } });
    const r = await createTelnyxClient({ env: ENV, fetchImpl: impl, sleepImpl: async () => {} }).purchaseNumber('+15551234567');
    expect(r.phoneNumberSid).toBe('TNX-RESOURCE'); // resource id, usable for PATCH/DELETE
    expect(calls[0].url).toContain('/v2/number_orders');
    expect(calls[0].body).toEqual({ phone_numbers: [{ phone_number: '+15551234567' }] });
    expect(calls.some(c => c.url.includes('/v2/phone_numbers?filter[phone_number]='))).toBe(true);
  });

  it('purchaseNumber polls then fails clearly if the number never materializes', async () => {
    const { impl } = fakeTransport((url) =>
      url.includes('/number_orders') ? { json: { data: { phone_numbers: [{ id: 'TNX-ORDER' }] } } }
        : { json: { data: [] } }); // never appears
    await expect(
      createTelnyxClient({ env: ENV, fetchImpl: impl, sleepImpl: async () => {} }).purchaseNumber('+15551234567'),
    ).rejects.toThrow(/hasn't appeared|phone use/);
  });

  it('finds an owned number (or null)', async () => {
    const found = fakeTransport(() => ({ json: { data: [{ id: 'TNX-9' }] } }));
    expect(await createTelnyxClient({ env: ENV, fetchImpl: found.impl }).findOwnedNumber('+1')).toEqual({ phoneNumberSid: 'TNX-9' });
    const none = fakeTransport(() => ({ json: { data: [] } }));
    expect(await createTelnyxClient({ env: ENV, fetchImpl: none.impl }).findOwnedNumber('+1')).toBeNull();
  });

  it('creates a TLS connection + A-record FQDN on 5061 when none exists (LiveKit Cloud needs TLS, no SRV)', async () => {
    const { impl, calls } = fakeTransport((url, method) => {
      if (url.includes('/fqdn_connections') && method === 'GET') return { json: { data: [] } };
      if (url.includes('/fqdn_connections') && method === 'POST') return { json: { data: { id: 'CONN-1' } } };
      if (url.includes('/fqdns') && method === 'GET') return { json: { data: [] } };
      return { json: {} };
    });
    const r = await createTelnyxClient({ env: ENV, fetchImpl: impl }).createSipTrunk({ name: 'offhook-agent-clinic', livekitSipUri: 'sip:abc.sip.livekit.cloud' });
    expect(r.trunkSid).toBe('CONN-1');
    const conn = calls.find(c => c.url.endsWith('/fqdn_connections') && c.method === 'POST');
    expect(conn?.body).toMatchObject({ transport_protocol: 'TLS' });
    const fqdn = calls.find(c => c.url.endsWith('/fqdns') && c.method === 'POST');
    expect(fqdn?.body).toEqual({ connection_id: 'CONN-1', fqdn: 'abc.sip.livekit.cloud', port: 5061, dns_record_type: 'a' });
  });

  it('REUSES an existing TLS connection with a good A/5061 FQDN (no duplicate writes — free-tier safe)', async () => {
    const { impl, calls } = fakeTransport((url, method) => {
      if (url.includes('/fqdn_connections') && method === 'GET') return { json: { data: [{ id: 'CONN-OLD', connection_name: 'offhook-agent-clinic', transport_protocol: 'TLS' }] } };
      if (url.includes('/fqdns') && method === 'GET') return { json: { data: [{ id: 'F1', fqdn: 'abc.sip.livekit.cloud', dns_record_type: 'a', port: 5061 }] } };
      return { json: {} };
    });
    const r = await createTelnyxClient({ env: ENV, fetchImpl: impl }).createSipTrunk({ name: 'offhook-agent-clinic', livekitSipUri: 'sip:abc.sip.livekit.cloud' });
    expect(r.trunkSid).toBe('CONN-OLD');
    expect(calls.some(c => c.url.includes('/fqdn_connections') && c.method === 'POST')).toBe(false); // no duplicate connection
    expect(calls.some(c => c.method === 'PATCH')).toBe(false); // already TLS
    expect(calls.some(c => c.url.endsWith('/fqdns') && (c.method === 'POST' || c.method === 'DELETE'))).toBe(false); // FQDN already good
  });

  it('self-heals a stale UDP/A-5060 connection → PATCH to TLS, delete the stale record, add A/5061', async () => {
    const { impl, calls } = fakeTransport((url, method) => {
      if (url.includes('/fqdn_connections') && method === 'GET') return { json: { data: [{ id: 'CONN-OLD', connection_name: 'offhook-agent-clinic', transport_protocol: 'UDP' }] } };
      if (url.includes('/fqdns') && method === 'GET') return { json: { data: [{ id: 'F-OLD', fqdn: 'abc.sip.livekit.cloud', dns_record_type: 'a', port: 5060 }] } };
      return { json: {} };
    });
    await createTelnyxClient({ env: ENV, fetchImpl: impl }).createSipTrunk({ name: 'offhook-agent-clinic', livekitSipUri: 'sip:abc.sip.livekit.cloud' });
    expect(calls.find(c => c.method === 'PATCH')?.body).toMatchObject({ transport_protocol: 'TLS' }); // fixed transport
    expect(calls.some(c => c.method === 'DELETE' && c.url.includes('/fqdns/F-OLD'))).toBe(true); // dropped stale 5060 record
    expect(calls.find(c => c.url.endsWith('/fqdns') && c.method === 'POST')?.body).toMatchObject({ port: 5061, dns_record_type: 'a' }); // added A/5061
  });

  it('attaches a number by setting its connection_id', async () => {
    const { impl, calls } = fakeTransport(() => ({ json: {} }));
    await createTelnyxClient({ env: ENV, fetchImpl: impl }).attachNumberToTrunk('TNX-1', 'CONN-1');
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain('/v2/phone_numbers/TNX-1');
    expect(calls[0].body).toEqual({ connection_id: 'CONN-1' });
  });
});

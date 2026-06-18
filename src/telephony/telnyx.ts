/**
 * Telnyx telephony client — the "no lock-in" alternative to Twilio, same
 * TelephonyClient interface. Telnyx v2 REST is JSON + Bearer (vs Twilio's
 * form + Basic), and routes to LiveKit via an FQDN connection (vs an elastic
 * SIP trunk).
 *
 * Implemented to the Telnyx v2 API docs; the request SHAPES are unit-tested with
 * a fake transport, but VALIDATE on a live Telnyx account before relying on it
 * (we can't exercise the real API here). fetch + env are injectable.
 */
import { TelephonyError, type TelephonyClient } from './types.js';

interface TelnyxOpts {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  apiKeyEnv?: string;
}

/** Host portion of a `sip:host[:port]` URI, for the FQDN routing entry. */
function sipHost(livekitSipUri: string): string {
  return livekitSipUri.replace(/^sips?:/i, '').split(/[:;]/)[0]!;
}

export function createTelnyxClient(opts: TelnyxOpts = {}): TelephonyClient {
  const env = opts.env ?? process.env;
  const key = env[opts.apiKeyEnv ?? 'TELNYX_API_KEY'];
  if (!key) throw new TelephonyError('Telnyx credentials missing — set TELNYX_API_KEY.');

  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = 'https://api.telnyx.com/v2';

  async function call(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new TelephonyError(`Telnyx ${method} ${path} → HTTP ${res.status}`);
    const text = await res.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  return {
    provider: 'telnyx',

    async listAvailableNumbers({ areaCode, country = 'US' }) {
      const q = `?filter[country_code]=${country}&filter[features][]=voice${areaCode ? `&filter[national_destination_code]=${encodeURIComponent(areaCode)}` : ''}`;
      const j = await call(`/available_phone_numbers${q}`, 'GET');
      const data = (j.data as Array<{ phone_number: string }>) ?? [];
      return data.map(n => ({ phoneNumber: n.phone_number }));
    },

    async purchaseNumber(phoneNumber) {
      const j = await call('/number_orders', 'POST', { phone_numbers: [{ phone_number: phoneNumber }] });
      const order = (j.data as { phone_numbers?: Array<{ id: string }> }) ?? {};
      const id = order.phone_numbers?.[0]?.id;
      if (!id) throw new TelephonyError('Telnyx number order did not return a phone-number id.');
      return { phoneNumberSid: id };
    },

    async findOwnedNumber(phoneNumber) {
      const j = await call(`/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`, 'GET');
      const data = (j.data as Array<{ id: string }>) ?? [];
      return data[0] ? { phoneNumberSid: data[0].id } : null;
    },

    async createSipTrunk({ name, livekitSipUri }) {
      const conn = await call('/fqdn_connections', 'POST', { connection_name: name });
      const trunkSid = String((conn.data as { id: string }).id);
      // Point the connection at the LiveKit SIP host (inbound origination).
      await call('/fqdns', 'POST', { connection_id: trunkSid, fqdn: sipHost(livekitSipUri), port: 5060, dns_record_type: 'a' });
      return { trunkSid };
    },

    async attachNumberToTrunk(phoneNumberSid, trunkSid) {
      await call(`/phone_numbers/${phoneNumberSid}`, 'PATCH', { connection_id: trunkSid });
    },

    async releaseNumber(phoneNumberSid) {
      await call(`/phone_numbers/${phoneNumberSid}`, 'DELETE');
    },

    async deleteTrunk(trunkSid) {
      await call(`/fqdn_connections/${trunkSid}`, 'DELETE');
    },
  };
}

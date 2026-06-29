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
  /** Injectable for tests — defaults to a real timer. */
  sleepImpl?: (ms: number) => Promise<void>;
}

/** How long to wait for an ordered number to materialize as a /phone_numbers
 *  resource (the order is async; the resource id differs from the order id). */
const PROVISION_POLL_ATTEMPTS = 12;
const PROVISION_POLL_DELAY_MS = 1500;

/** LiveKit Cloud SIP accepts TLS (5061) and TCP (5060) but NOT UDP, and it
 *  publishes no SRV record — so route over TLS to an A-record on 5061. */
const LIVEKIT_SIP_TLS_PORT = 5061;

/** Host portion of a `sip:host[:port]` URI, for the FQDN routing entry. */
function sipHost(livekitSipUri: string): string {
  return livekitSipUri.replace(/^sips?:/i, '').split(/[:;]/)[0]!;
}

export function createTelnyxClient(opts: TelnyxOpts = {}): TelephonyClient {
  const env = opts.env ?? process.env;
  const key = env[opts.apiKeyEnv ?? 'TELNYX_API_KEY'];
  if (!key) throw new TelephonyError('Telnyx credentials missing — set TELNYX_API_KEY.');

  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleepImpl ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const base = 'https://api.telnyx.com/v2';

  async function call(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      // Surface Telnyx's actual reason (e.g. "Identity verification required",
      // "Insufficient funds") instead of a bare status — these are operator-facing
      // setup errors, so the detail is wanted. Telnyx errors: { errors: [{title,detail}] }.
      const raw = await res.text().catch(() => '');
      let reason = '';
      try {
        const errs = (JSON.parse(raw) as { errors?: Array<{ title?: string; detail?: string }> }).errors;
        if (errs?.length) reason = ' — ' + errs.map(e => [e.title, e.detail].filter(Boolean).join(': ')).filter(Boolean).join('; ');
      } catch { if (raw) reason = ` — ${raw.slice(0, 200)}`; }
      throw new TelephonyError(`Telnyx ${method} ${path} → HTTP ${res.status}${reason}`);
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  /** The /phone_numbers resource id for an owned number (the id PATCH/DELETE
   *  use), or null if it isn't in the account yet. Distinct from a number
   *  order's sub-number id. */
  async function ownedId(phoneNumber: string): Promise<string | null> {
    const j = await call(`/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`, 'GET');
    const data = (j.data as Array<{ id: string }>) ?? [];
    return data[0]?.id ?? null;
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
      // The order is async: its returned phone_numbers[].id is the ORDER's
      // sub-number id, NOT the /phone_numbers resource id that PATCH/DELETE use.
      // Place the order, then poll until the real resource exists and return ITS
      // id — otherwise attachNumberToTrunk PATCHes a non-existent id and 404s.
      const j = await call('/number_orders', 'POST', { phone_numbers: [{ phone_number: phoneNumber }] });
      const order = (j.data as { phone_numbers?: Array<{ id: string }> }) ?? {};
      if (!order.phone_numbers?.[0]?.id) throw new TelephonyError('Telnyx number order was not accepted.');
      for (let attempt = 0; ; attempt++) {
        const id = await ownedId(phoneNumber);
        if (id) return { phoneNumberSid: id };
        if (attempt >= PROVISION_POLL_ATTEMPTS - 1) break;
        await sleep(PROVISION_POLL_DELAY_MS);
      }
      throw new TelephonyError(`Telnyx ordered ${phoneNumber} but it hasn't appeared in your account yet. Wait ~30s, then run: offhook-agent phone use ${phoneNumber} --provider telnyx`);
    },

    async findOwnedNumber(phoneNumber) {
      const id = await ownedId(phoneNumber);
      return id ? { phoneNumberSid: id } : null;
    },

    async createSipTrunk({ name, livekitSipUri }) {
      const host = sipHost(livekitSipUri);
      // LiveKit Cloud SIP accepts TLS (5061) and TCP (5060) but NOT UDP, and
      // publishes no SRV record — plain UDP/5060 is silently dropped, so the
      // caller hears a busy tone. So the connection MUST be TLS and the FQDN an
      // A-record on 5061.
      //
      // Reuse an existing connection with this name (re-runs, and free tiers that
      // cap connections at 1, must not POST a duplicate → Telnyx 403). Otherwise
      // create one. Either way, force TLS + a single SRV FQDN, self-healing any
      // stale UDP/A wiring from older versions.
      const list = ((await call('/fqdn_connections', 'GET')).data as Array<{ id: string; connection_name?: string; transport_protocol?: string }>) ?? [];
      const match = list.find(c => c.connection_name === name) ?? (list.length === 1 ? list[0] : undefined);
      let trunkSid: string;
      if (match) {
        trunkSid = String(match.id);
        if (match.transport_protocol !== 'TLS') await call(`/fqdn_connections/${trunkSid}`, 'PATCH', { transport_protocol: 'TLS' });
      } else {
        const conn = await call('/fqdn_connections', 'POST', { connection_name: name, transport_protocol: 'TLS' });
        trunkSid = String((conn.data as { id: string }).id);
      }
      // Ensure exactly one FQDN: an A-record to the LiveKit host on the TLS port.
      // Drop any stale records (an old A/UDP-5060 or SRV entry) so TLS/5061 is the
      // only route.
      const fqdns = ((await call(`/fqdns?filter[connection_id]=${encodeURIComponent(trunkSid)}`, 'GET')).data as Array<{ id?: string; fqdn?: string; dns_record_type?: string; port?: number }>) ?? [];
      const goodFqdn = fqdns.find(f => f.fqdn === host && f.dns_record_type === 'a' && f.port === LIVEKIT_SIP_TLS_PORT);
      for (const f of fqdns) {
        if (f.id && f !== goodFqdn) await call(`/fqdns/${f.id}`, 'DELETE');
      }
      if (!goodFqdn) await call('/fqdns', 'POST', { connection_id: trunkSid, fqdn: host, port: LIVEKIT_SIP_TLS_PORT, dns_record_type: 'a' });
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

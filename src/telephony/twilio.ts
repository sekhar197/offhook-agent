/**
 * Twilio telephony client — original code over Twilio's REST API via fetch (no
 * `twilio` SDK, matching src/actions/delivery.ts). Buys a number, stands up an
 * Elastic SIP trunk, points its origination at the LiveKit SIP URI, and attaches
 * the number — so a PSTN call flows Twilio → LiveKit → the agent.
 *
 * fetch + env are injectable, so the whole client is unit-tested with a fake
 * transport and zero Twilio account.
 */
import { TelephonyError, type TelephonyClient } from './types.js';

interface TwilioOpts {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  accountSidEnv?: string;
  authTokenEnv?: string;
}

export function createTwilioClient(opts: TwilioOpts = {}): TelephonyClient {
  const env = opts.env ?? process.env;
  const sid = env[opts.accountSidEnv ?? 'TWILIO_ACCOUNT_SID'];
  const token = env[opts.authTokenEnv ?? 'TWILIO_AUTH_TOKEN'];
  if (!sid || !token) throw new TelephonyError('Twilio credentials missing — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.');

  const fetchImpl = opts.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
  const acct = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;
  const trunking = 'https://trunking.twilio.com/v1';

  async function call(url: string, method: string, form?: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: auth, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(form ? { body: new URLSearchParams(form).toString() } : {}),
    });
    if (!res.ok) throw new TelephonyError(`Twilio ${method} ${url.replace(acct, '').replace(trunking, '')} → HTTP ${res.status}`);
    const text = await res.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  return {
    provider: 'twilio',

    async listAvailableNumbers({ areaCode, country = 'US' }) {
      const q = areaCode ? `?AreaCode=${encodeURIComponent(areaCode)}` : '';
      const j = await call(`${acct}/AvailablePhoneNumbers/${country}/Local.json${q}`, 'GET');
      const nums = (j.available_phone_numbers as Array<{ phone_number: string; locality?: string }>) ?? [];
      return nums.map(n => ({ phoneNumber: n.phone_number, ...(n.locality ? { locality: n.locality } : {}) }));
    },

    async purchaseNumber(phoneNumber) {
      const j = await call(`${acct}/IncomingPhoneNumbers.json`, 'POST', { PhoneNumber: phoneNumber });
      return { phoneNumberSid: String(j.sid) };
    },

    async findOwnedNumber(phoneNumber) {
      const j = await call(`${acct}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`, 'GET');
      const owned = (j.incoming_phone_numbers as Array<{ sid: string }>) ?? [];
      return owned[0] ? { phoneNumberSid: String(owned[0].sid) } : null;
    },

    async createSipTrunk({ name, livekitSipUri }) {
      const trunk = await call(`${trunking}/Trunks`, 'POST', { FriendlyName: name });
      const trunkSid = String(trunk.sid);
      // Point origination at LiveKit so inbound PSTN calls reach the agent.
      await call(`${trunking}/Trunks/${trunkSid}/OriginationUrls`, 'POST', {
        FriendlyName: 'offhook → LiveKit', SipUrl: livekitSipUri, Weight: '1', Priority: '1', Enabled: 'true',
      });
      return { trunkSid };
    },

    async attachNumberToTrunk(phoneNumberSid, trunkSid) {
      await call(`${acct}/IncomingPhoneNumbers/${phoneNumberSid}.json`, 'POST', { TrunkSid: trunkSid });
    },

    async releaseNumber(phoneNumberSid) {
      await call(`${acct}/IncomingPhoneNumbers/${phoneNumberSid}.json`, 'DELETE');
    },

    async deleteTrunk(trunkSid) {
      await call(`${trunking}/Trunks/${trunkSid}`, 'DELETE');
    },
  };
}

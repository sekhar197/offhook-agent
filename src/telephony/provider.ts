/**
 * Telephony provider factory — pick Twilio or Telnyx by name. The rest of the
 * telephony code (orchestration, LiveKit wiring, CLI, dashboard) is written
 * against the TelephonyClient interface, so adding a provider is just adding a
 * branch here.
 */
import { TelephonyError, type TelephonyClient, type TelephonyProviderName } from './types.js';
import { createTwilioClient } from './twilio.js';
import { createTelnyxClient } from './telnyx.js';

export const TELEPHONY_PROVIDERS: TelephonyProviderName[] = ['twilio', 'telnyx'];

export function isTelephonyProvider(s: string | undefined): s is TelephonyProviderName {
  return s === 'twilio' || s === 'telnyx';
}

export function telephonyClient(
  provider: TelephonyProviderName,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): TelephonyClient {
  switch (provider) {
    case 'twilio': return createTwilioClient(opts);
    case 'telnyx': return createTelnyxClient(opts);
    default: throw new TelephonyError(`Unknown telephony provider: ${provider}`);
  }
}

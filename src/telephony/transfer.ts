/**
 * Warm transfer via SIP REFER — retires the log-only stub in entry.ts. One
 * SipClient call bridges the caller to a human; the REFER target host depends on
 * the provider the number lives on.
 */
import { SipClient } from 'livekit-server-sdk';
import { TelephonyError, type TelephonyProviderName } from './types.js';

const SIP_HOST: Record<TelephonyProviderName, string> = {
  twilio: 'sip.twilio.com',
  telnyx: 'sip.telnyx.com',
};

/** Build the `sip:+e164@host` REFER target from a transfer number. */
export function referTarget(transferPhone: string, provider: TelephonyProviderName = 'twilio'): string {
  const cleaned = transferPhone.replace(/[^\d+]/g, '');
  const e164 = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  return `sip:${e164}@${SIP_HOST[provider]}`;
}

/** The SipClient method we use — injectable for tests. */
export interface SipTransferApi {
  transferSipParticipant(roomName: string, participantIdentity: string, transferTo: string): Promise<void>;
}

export function liveKitTransferFromEnv(env: NodeJS.ProcessEnv = process.env): SipTransferApi {
  const url = env.LIVEKIT_URL, key = env.LIVEKIT_API_KEY, secret = env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new TelephonyError('LiveKit credentials missing for transfer.');
  return new SipClient(url, key, secret) as unknown as SipTransferApi;
}

export async function transferCaller(opts: {
  sip: SipTransferApi;
  roomName: string;
  participantIdentity: string;
  transferPhone: string;
  provider?: TelephonyProviderName;
}): Promise<void> {
  await opts.sip.transferSipParticipant(
    opts.roomName,
    opts.participantIdentity,
    referTarget(opts.transferPhone, opts.provider ?? 'twilio'),
  );
}

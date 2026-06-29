/**
 * Cold transfer via SIP REFER — retires the log-only stub in entry.ts. One
 * SipClient call hands the caller to a human.
 *
 * The REFER target is a `tel:` URI, NOT `sip:+e164@<carrier>`. A `sip:@carrier`
 * target makes LiveKit try to ORIGINATE a new call to the carrier (which needs
 * an outbound trunk and is refused — "Dialing <carrier> addresses is not allowed
 * in this context"). A `tel:` URI instead relays the REFER to the caller's
 * existing carrier leg, which dials the number — carrier-agnostic, needing only
 * "call transfer (SIP REFER)" enabled on the trunk.
 */
import { SipClient } from 'livekit-server-sdk';
import { TelephonyError, type TelephonyProviderName } from './types.js';

/** Build the `tel:+e164` REFER target from a transfer number. */
export function referTarget(transferPhone: string): string {
  const cleaned = transferPhone.replace(/[^\d+]/g, '');
  const e164 = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  return `tel:${e164}`;
}

/** The SipClient method we use — injectable for tests. */
export interface SipTransferApi {
  transferSipParticipant(roomName: string, participantIdentity: string, transferTo: string, opts?: { playDialtone?: boolean }): Promise<void>;
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
  /** Accepted for back-compat; the `tel:` target is carrier-agnostic so it's unused. */
  provider?: TelephonyProviderName;
}): Promise<void> {
  await opts.sip.transferSipParticipant(
    opts.roomName,
    opts.participantIdentity,
    referTarget(opts.transferPhone),
    { playDialtone: true }, // caller hears a dial tone while the target rings (no dead silence)
  );
}

/**
 * Telephony types — provider-agnostic by construction, so Twilio ships first and
 * Telnyx drops in as the same `TelephonyClient` interface (no rewrite). This is
 * the "any SIP provider, no lock-in" promise that separates offhook from the
 * closed SaaS.
 */

export class TelephonyError extends Error {}

export type TelephonyProviderName = 'twilio' | 'telnyx';

/** A provisioned phone number's lifecycle, persisted to .offhook/telephony.json
 *  (infra IDs — NOT agent behavior, so they stay out of agent.yaml). */
export interface TelephonyState {
  provider: TelephonyProviderName;
  phoneNumber?: string;            // E.164, e.g. +15551234567
  phoneNumberSid?: string;         // provider's id for the number
  trunkSid?: string;               // provider SIP trunk id
  credentialListSid?: string;      // provider SIP credential list (if any)
  livekitTrunkId?: string;         // LiveKit inbound trunk id
  livekitDispatchRuleId?: string;  // LiveKit dispatch rule id
  agentName?: string;              // the worker agentName this number dispatches to
  updatedAt?: string;
}

export interface AvailableNumber { phoneNumber: string; locality?: string; }
export interface PurchaseResult { phoneNumberSid: string; }
export interface TrunkResult { trunkSid: string; credentialListSid?: string; }

/**
 * The provider-side contract (Twilio, Telnyx, …). The LiveKit side (inbound
 * trunk + dispatch rule + SIP REFER transfer) is provider-INDEPENDENT and lives
 * in livekit.ts, so a provider only implements number + trunk + origination.
 */
export interface TelephonyClient {
  readonly provider: TelephonyProviderName;
  listAvailableNumbers(opts: { areaCode?: string; country?: string }): Promise<AvailableNumber[]>;
  purchaseNumber(phoneNumber: string): Promise<PurchaseResult>;
  /** Find a number the account already owns (for bring-your-own-number); null if not found. */
  findOwnedNumber(phoneNumber: string): Promise<PurchaseResult | null>;
  /** Create a SIP trunk and point its origination at the LiveKit SIP URI. */
  createSipTrunk(opts: { name: string; livekitSipUri: string }): Promise<TrunkResult>;
  attachNumberToTrunk(phoneNumberSid: string, trunkSid: string): Promise<void>;
  releaseNumber(phoneNumberSid: string): Promise<void>;
  deleteTrunk(trunkSid: string): Promise<void>;
}

/**
 * Telephony orchestration — the multi-step flows behind `offhook phone`.
 * Takes INJECTED clients (provider + LiveKit SipApi), so the provision →
 * connect → release sequence is unit-tested with fakes and zero accounts; the
 * CLI passes the real clients.
 */
import { TelephonyError, type TelephonyClient, type TelephonyState } from './types.js';
import { loadTelephonyState, writeTelephonyState, mergeTelephonyState, DEFAULT_STATE_PATH } from './state.js';
import { connectNumberToAgent, disconnectNumber, type SipApi } from './livekit.js';

/** Buy a number, stand up the provider SIP trunk pointed at LiveKit, attach the
 *  number, and persist the IDs. (Does NOT create the LiveKit dispatch yet — that
 *  is `connect`, so provisioning and going-live are separable.) */
export async function provisionNumber(opts: {
  client: TelephonyClient;
  livekitSipUri: string;
  agentId: string;
  areaCode?: string;
  statePath?: string;
  now?: () => number;
}): Promise<TelephonyState> {
  const available = await opts.client.listAvailableNumbers({ areaCode: opts.areaCode });
  if (available.length === 0) throw new TelephonyError(`No numbers available${opts.areaCode ? ` in area code ${opts.areaCode}` : ''}.`);
  const number = available[0]!.phoneNumber;

  const { phoneNumberSid } = await opts.client.purchaseNumber(number);
  const { trunkSid, credentialListSid } = await opts.client.createSipTrunk({ name: `offhook-${opts.agentId}`, livekitSipUri: opts.livekitSipUri });
  await opts.client.attachNumberToTrunk(phoneNumberSid, trunkSid);

  return mergeTelephonyState(
    { provider: opts.client.provider, phoneNumber: number, phoneNumberSid, trunkSid, ...(credentialListSid ? { credentialListSid } : {}) },
    opts.statePath, opts.now,
  );
}

/** Bring your own number: use a number the account already owns instead of
 *  buying one — stand up the SIP trunk pointed at LiveKit and attach it. */
export async function useExistingNumber(opts: {
  client: TelephonyClient;
  livekitSipUri: string;
  agentId: string;
  number: string;
  statePath?: string;
  now?: () => number;
}): Promise<TelephonyState> {
  const owned = await opts.client.findOwnedNumber(opts.number);
  if (!owned) {
    throw new TelephonyError(`You don't own ${opts.number} on ${opts.client.provider}. Add it to your ${opts.client.provider} account first, or run \`offhook phone provision\` to buy a new one.`);
  }
  const { trunkSid, credentialListSid } = await opts.client.createSipTrunk({ name: `offhook-${opts.agentId}`, livekitSipUri: opts.livekitSipUri });
  await opts.client.attachNumberToTrunk(owned.phoneNumberSid, trunkSid);

  return mergeTelephonyState(
    { provider: opts.client.provider, phoneNumber: opts.number, phoneNumberSid: owned.phoneNumberSid, trunkSid, ...(credentialListSid ? { credentialListSid } : {}) },
    opts.statePath, opts.now,
  );
}

/** Go live: create the LiveKit inbound trunk + dispatch rule binding the
 *  provisioned number to the worker. */
export async function connectNumber(opts: {
  sip: SipApi;
  agentId: string;
  agentName: string;
  statePath?: string;
  now?: () => number;
}): Promise<TelephonyState> {
  const state = loadTelephonyState(opts.statePath);
  if (!state?.phoneNumber) throw new TelephonyError('No provisioned number — run `offhook phone provision` first.');

  const { livekitTrunkId, livekitDispatchRuleId } = await connectNumberToAgent(opts.sip, { number: state.phoneNumber, agentId: opts.agentId, agentName: opts.agentName });
  return mergeTelephonyState({ provider: state.provider, livekitTrunkId, livekitDispatchRuleId, agentName: opts.agentName }, opts.statePath, opts.now);
}

/** Tear it all down: LiveKit dispatch+trunk, then the provider trunk + number,
 *  then reset the state file. */
export async function releaseNumber(opts: { client: TelephonyClient; sip: SipApi; statePath?: string }): Promise<void> {
  const state = loadTelephonyState(opts.statePath);
  if (!state) return;
  await disconnectNumber(opts.sip, state);
  if (state.phoneNumberSid) await opts.client.releaseNumber(state.phoneNumberSid);
  if (state.trunkSid) await opts.client.deleteTrunk(state.trunkSid);
  writeTelephonyState({ provider: state.provider }, opts.statePath ?? DEFAULT_STATE_PATH);
}

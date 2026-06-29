/**
 * LiveKit SIP wiring — provider-independent (works for Twilio or Telnyx
 * numbers). Creates an inbound trunk + a dispatch rule that routes inbound
 * calls to a room and dispatches the offhook-agent worker into it.
 *
 * The SipClient slice is injected as `SipApi`, so this is unit-tested with a
 * fake and zero LiveKit account.
 */
import { SipClient, RoomConfiguration, RoomAgentDispatch } from 'livekit-server-sdk';
import { TelephonyError } from './types.js';

/**
 * 30s ringing timeout: LiveKit replies 180 Ringing (not an immediate 200 OK),
 * so the carrier's media path doesn't time out before the agent produces its
 * first audio (VAD/model cold-start). Learned the hard way in production.
 */
const RINGING_TIMEOUT_SECS = 30;

/** The SipClient methods we use — injectable for tests. */
export interface SipApi {
  createSipInboundTrunk(name: string, numbers: string[], opts?: { ringingTimeout?: number }): Promise<{ sipTrunkId: string }>;
  createSipDispatchRule(rule: { type: 'individual'; roomPrefix: string }, opts?: { name?: string; trunkIds?: string[]; roomConfig?: RoomConfiguration }): Promise<{ sipDispatchRuleId: string }>;
  deleteSipTrunk(sipTrunkId: string): Promise<unknown>;
  deleteSipDispatchRule(sipDispatchRuleId: string): Promise<unknown>;
}

export function liveKitSipFromEnv(env: NodeJS.ProcessEnv = process.env): SipApi {
  const url = env.LIVEKIT_URL, key = env.LIVEKIT_API_KEY, secret = env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) {
    throw new TelephonyError('LiveKit credentials missing — set LIVEKIT_URL + LIVEKIT_API_KEY + LIVEKIT_API_SECRET.');
  }
  return new SipClient(url, key, secret) as unknown as SipApi;
}

/** Bind a number to the agent: inbound trunk + dispatch rule (agentName must
 *  match the worker's, per src/voice/worker.ts OFFHOOK_AGENT_NAME / 'offhook-agent'). */
export async function connectNumberToAgent(sip: SipApi, opts: {
  number: string;
  agentId: string;
  agentName: string;
  metadata?: Record<string, unknown>;
}): Promise<{ livekitTrunkId: string; livekitDispatchRuleId: string }> {
  const trunk = await sip.createSipInboundTrunk(`offhook-agent-${opts.agentId}`, [opts.number], { ringingTimeout: RINGING_TIMEOUT_SECS });

  const roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: opts.agentName })],
    ...(opts.metadata ? { metadata: JSON.stringify(opts.metadata) } : {}),
  });
  const rule = await sip.createSipDispatchRule(
    { type: 'individual', roomPrefix: `offhook-agent-${opts.agentId}-` },
    { name: `offhook-agent-${opts.agentId}`, trunkIds: [trunk.sipTrunkId], roomConfig },
  );

  return { livekitTrunkId: trunk.sipTrunkId, livekitDispatchRuleId: rule.sipDispatchRuleId };
}

/** Tear down the dispatch rule + inbound trunk (rule first). */
export async function disconnectNumber(sip: SipApi, state: { livekitTrunkId?: string; livekitDispatchRuleId?: string }): Promise<void> {
  if (state.livekitDispatchRuleId) await sip.deleteSipDispatchRule(state.livekitDispatchRuleId);
  if (state.livekitTrunkId) await sip.deleteSipTrunk(state.livekitTrunkId);
}

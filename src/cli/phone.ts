/**
 * `offhook phone <provision | use | connect | status | release>` — go from zero
 * to a real number answering, in a couple of commands. Provider is your choice
 * (--provider twilio|telnyx; default twilio):
 *   provision [--area-code N]   buy a NEW number + provider SIP trunk → LiveKit
 *   use <+E164>                 bring an EXISTING number you already own
 *   connect                     create the LiveKit inbound trunk + dispatch
 *   status                      show the provisioned state
 *   release                     tear it all down
 *
 * Needs the provider's key (provision/use) + LiveKit creds (connect).
 */
import { loadAgentConfig } from '../config/agent-config.js';
import { telephonyClient, isTelephonyProvider, TELEPHONY_PROVIDERS } from '../telephony/provider.js';
import { liveKitSipFromEnv } from '../telephony/livekit.js';
import { loadTelephonyState } from '../telephony/state.js';
import { provisionNumber, useExistingNumber, connectNumber, releaseNumber } from '../telephony/orchestrate.js';

function fail(e: unknown): void {
  console.log(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function phoneCommand(configPath: string, args: string[]): Promise<void> {
  const sub = args[0];
  const agentId = loadAgentConfig(configPath).agent.id;
  const agentName = process.env.OFFHOOK_AGENT_NAME || 'offhook';

  const providerArg = flag(args, '--provider') ?? 'twilio';
  if (!isTelephonyProvider(providerArg)) {
    console.log(`Unknown provider "${providerArg}". Choose one of: ${TELEPHONY_PROVIDERS.join(', ')}.`);
    process.exitCode = 1;
    return;
  }

  if (sub === 'provision' || sub === 'use') {
    const livekitSipUri = process.env.LIVEKIT_SIP_URI;
    if (!livekitSipUri) {
      console.log('Set LIVEKIT_SIP_URI to your LiveKit SIP endpoint first (e.g. sip:xxxx.sip.livekit.cloud).');
      process.exitCode = 1;
      return;
    }
    const client = telephonyClient(providerArg);
    try {
      let state;
      if (sub === 'use') {
        const number = args.slice(1).find(a => /^\+?\d/.test(a));
        if (!number) { console.log('Usage: offhook phone use <+E164> [--provider twilio|telnyx]'); process.exitCode = 1; return; }
        console.log(`Connecting your existing number ${number} via ${providerArg}…`);
        state = await useExistingNumber({ client, livekitSipUri, agentId, number });
      } else {
        const areaCode = flag(args, '--area-code');
        console.log(`Provisioning a number${areaCode ? ` in area code ${areaCode}` : ''} via ${providerArg}…`);
        state = await provisionNumber({ client, livekitSipUri, agentId, ...(areaCode ? { areaCode } : {}) });
      }
      console.log(`✓ ${state.phoneNumber} ready (${providerArg}). Next: offhook phone connect`);
    } catch (e) { fail(e); }
    return;
  }

  if (sub === 'connect') {
    try {
      const state = await connectNumber({ sip: liveKitSipFromEnv(), agentId, agentName });
      console.log(`✓ ${state.phoneNumber} now answers via offhook (agent "${agentName}"). Start the worker: offhook start`);
    } catch (e) { fail(e); }
    return;
  }

  if (sub === 'status') {
    const s = loadTelephonyState();
    console.log(s ? JSON.stringify(s, null, 2) : 'No telephony set up yet. Run: offhook phone provision  (or  use <+E164>)');
    return;
  }

  if (sub === 'release') {
    const s = loadTelephonyState();
    const provider = s?.provider ?? providerArg;
    try {
      await releaseNumber({ client: telephonyClient(provider), sip: liveKitSipFromEnv() });
      console.log('✓ number + trunks released.');
    } catch (e) { fail(e); }
    return;
  }

  console.log('Usage: offhook phone <provision [--area-code N] | use <+E164> | connect | status | release> [--provider twilio|telnyx]');
  process.exitCode = 1;
}

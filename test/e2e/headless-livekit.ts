/**
 * Headless LiveKit e2e scaffold — the automated counterpart to the manual
 * real-call checklist (docs/runbook-livecall.md). It joins a real LiveKit room
 * as a participant, dispatches the offhook-agent worker into it, and (the documented
 * live step) publishes a TTS-rendered utterance and asserts the agent publishes
 * audio back + the expected tool fires.
 *
 * STATUS: connectivity + dispatch are wired and runnable against a real LiveKit;
 * the audio-frame round-trip is marked below as the live step to finish on real
 * infra (it needs @livekit/rtc-node audio I/O + the worker running). This is the
 * harness, not a passing CI test — it is GATED on real creds and never runs in
 * the default suite. See docs/testing-status.md ("never run on real audio").
 *
 * Run:
 *   LIVEKIT_URL=… LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=… npx tsx test/e2e/headless-livekit.ts
 */
import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';

const REQUIRED = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const;

async function main(): Promise<void> {
  const missing = REQUIRED.filter(v => !process.env[v]);
  if (missing.length) {
    console.log(`⏭  skipped — set ${missing.join(', ')} to run the headless e2e.`);
    console.log('   This harness is gated on a real LiveKit account; it never runs in CI.');
    return;
  }

  const url = process.env.LIVEKIT_URL!;
  const httpUrl = url.replace(/^ws/, 'http');
  const key = process.env.LIVEKIT_API_KEY!;
  const secret = process.env.LIVEKIT_API_SECRET!;
  const agentName = process.env.OFFHOOK_AGENT_NAME || 'offhook-agent';
  const room = `offhook-agent-e2e-${Date.now()}`;

  const rooms = new RoomServiceClient(httpUrl, key, secret);
  const dispatch = new AgentDispatchClient(httpUrl, key, secret);

  console.log(`▶  creating room ${room} …`);
  await rooms.createRoom({ name: room });

  console.log(`▶  dispatching agent "${agentName}" into the room …`);
  await dispatch.createDispatch(room, agentName, {});

  // Give the worker a moment to join, then confirm it's present.
  await new Promise(r => setTimeout(r, 4000));
  const participants = await rooms.listParticipants(room);
  const agentJoined = participants.some(p => p.identity.includes(agentName) || p.kind === 3 /* AGENT */);

  if (!agentJoined) {
    console.log('✗ agent did not join — is the worker running? (offhook-agent start, registered to this LiveKit)');
    await rooms.deleteRoom(room);
    process.exitCode = 1;
    return;
  }
  console.log('✓ agent joined the room (dispatch + worker registration verified).');

  // ── LIVE STEP (finish on real infra) ──────────────────────────────────────
  // 1. Connect a participant with @livekit/rtc-node and publish an audio track
  //    rendered from TTS (e.g. "what are your hours?").
  // 2. Subscribe to the agent's audio track; assert non-empty frames arrive
  //    within N seconds (the agent answered).
  // 3. For a tool assertion, point tools.delivery at a local webhook and assert
  //    it received the take_message payload after a "leave a message" utterance.
  // Capture the result in docs/real-call-report.md.
  console.log('ℹ  audio round-trip is the live step — see the LIVE STEP block + runbook-livecall.md.');

  await rooms.deleteRoom(room);
}

main().catch(e => { console.error('e2e error:', e); process.exitCode = 1; });

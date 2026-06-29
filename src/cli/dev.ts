/**
 * `offhook-agent dev` — local browser voice session.
 *
 * Starts the token+web server, then runs the LiveKit worker in dev mode in the
 * same process. Open the printed URL, click "Start call", and talk to your
 * agent. Works against a local self-hosted LiveKit (zero cloud) or LiveKit
 * Cloud — whatever LIVEKIT_URL points at.
 */

import { startTokenServer } from '../server/token.js';

export function devCommand(): void {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    console.error(
      '\n  offhook-agent dev needs LiveKit connection info:\n' +
      '    LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET\n\n' +
      '  Local (self-hosted, zero cloud): the dev LiveKit server uses\n' +
      '    LIVEKIT_URL=ws://localhost:7880  LIVEKIT_API_KEY=devkey  LIVEKIT_API_SECRET=secret\n' +
      '  Or set your LiveKit Cloud values.\n',
    );
    process.exit(1);
  }

  startTokenServer({
    livekitUrl,
    apiKey,
    apiSecret,
    agentName: process.env.OFFHOOK_AGENT_NAME || 'offhook-agent',
    port: Number(process.env.OFFHOOK_AGENT_DEV_PORT || 3000),
  });

  // Run the worker in the same process (dev mode). cli.runApp reads argv;
  // ensure it sees the "dev" subcommand.
  if (!process.argv.includes('dev')) process.argv.push('dev');
  void import('../voice/worker.js').then(m => m.runVoiceWorker());
}

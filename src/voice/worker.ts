/**
 * Voice worker bootstrap — runs the LiveKit agent worker.
 *
 * `cli.runApp` manages the worker lifecycle: it connects to LiveKit
 * (LIVEKIT_URL / API key / secret), maintains a pool of idle processes, and
 * dispatches each inbound call (browser or SIP) to the `entry` hook. The
 * subcommand (start | dev | console) comes from argv, forwarded by the CLI.
 */

import { cli, ServerOptions } from '@livekit/agents';
import { fileURLToPath } from 'node:url';

/** Absolute path to the built entry module (dist/voice/entry.js at runtime). */
function entryFile(): string {
  return fileURLToPath(new URL('./entry.js', import.meta.url));
}

export function runVoiceWorker(): void {
  cli.runApp(
    new ServerOptions({
      agent: entryFile(),
      agentName: process.env.OFFHOOK_AGENT_NAME || 'offhook-agent',
    }),
  );
}

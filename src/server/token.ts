/**
 * Token + dispatch HTTP server for the browser mic demo.
 *
 * Serves the one-page mic client and a `/api/connect` endpoint that:
 *   1. creates a fresh room,
 *   2. dispatches the offhook-agent agent worker to it (AgentDispatchClient),
 *   3. mints a browser join token,
 * and returns { url, token, room }. The browser then joins with livekit-client,
 * publishes its mic, and plays the agent's audio.
 *
 * No app secrets reach the browser — only a short-lived room-scoped JWT.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';

export interface TokenServerOptions {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  agentName: string;
  port: number;
}

function webRoot(): string {
  // dist/server/token.js → ../../web at runtime; src/server/token.ts → ../../web in dev.
  return fileURLToPath(new URL('../../web', import.meta.url));
}

async function mintConnection(opts: TokenServerOptions) {
  const room = `offhook-agent-dev-${Math.random().toString(36).slice(2, 10)}`;

  // Dispatch the agent worker into this room.
  const dispatch = new AgentDispatchClient(opts.livekitUrl, opts.apiKey, opts.apiSecret);
  await dispatch.createDispatch(room, opts.agentName);

  // Browser join token (mic publish + subscribe), 1-hour TTL.
  const at = new AccessToken(opts.apiKey, opts.apiSecret, {
    identity: `web-${Math.random().toString(36).slice(2, 8)}`,
    ttl: '1h',
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  const token = await at.toJwt();

  return { url: opts.livekitUrl, token, room };
}

export function startTokenServer(opts: TokenServerOptions): { close: () => void } {
  const indexHtml = readFileSync(`${webRoot()}/index.html`, 'utf-8');

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method === 'POST' && req.url === '/api/connect') {
        const conn = await mintConnection(opts);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(conn));
        return;
      }
      // Everything else serves the mic page.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  server.listen(opts.port, () => {
    console.log(`\n  offhook-agent browser demo → http://localhost:${opts.port}`);
    console.log(`  (dispatches the "${opts.agentName}" worker into a fresh room per session)\n`);
  });

  return { close: () => server.close() };
}

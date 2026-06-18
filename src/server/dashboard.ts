/**
 * Local dashboard server — the operator's window into offhook.
 *
 * A SIBLING to token.ts (not an extension): the dashboard reads FINISHED calls
 * and config, and must run with ZERO LiveKit creds (reviewing logs shouldn't
 * need a LiveKit account). Binds to 127.0.0.1 by default and guards /api/* with
 * a printed token, so it isn't wide-open on a shared machine. This is a
 * local-access guard, not real auth.
 *
 * Read routes (D1):
 *   GET /api/calls?limit&offset   slim newest-first summaries
 *   GET /api/calls/:id            one full CallRecord
 *   GET /api/scorecard            last improve scorecard, or {available:false}
 *   GET /api/config               sanitized config (never raw yaml/keys)
 *   GET /api/keys-status          [{envVar,set,purpose,optional}] — never values
 * POST /api/improve               the live self-improve loop (SSE) — added in D6.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';
import { nanoid } from 'nanoid';
import { loadAgentConfig, llmConfigInput } from '../config/agent-config.js';
import { resolveLlm } from '../llm/provider.js';
import { createLlmClient } from '../llm/client.js';
import { readCallSummaries, getCallRecord, readCallRecords } from '../observability/call-store.js';
import { gatePersonas } from '../evals/personas.js';
import { runImprovePipeline } from '../improve/pipeline.js';
import { editableValues, applyConfigEdits, type ConfigEdit } from '../config/edit.js';

export interface DashboardOptions {
  configPath: string;
  recordsPath: string;
  port: number;
  host?: string;
  /** Directory holding improve scorecard.latest.json (default ./improve). */
  improveDir?: string;
  /** Override the access token (tests). */
  token?: string;
}

// ---- data functions (pure-ish; unit-tested directly) ------------------------

export function getConfigSummary(configPath: string) {
  const c = loadAgentConfig(configPath);
  return {
    agent: { id: c.agent.id, businessName: c.agent.businessName, agentName: c.agent.agentName ?? null, tone: c.agent.tone },
    tools: { enabled: c.tools.enabled, delivery: c.tools.delivery?.channel ?? (c.tools.webhookUrl ? 'webhook' : 'console') },
    aliasCount: Object.keys(c.knowledge.vocabulary.aliases).length,
    observability: { sink: c.observability.sink, path: c.observability.path },
    voiceMode: c.voice.mode,
    editable: editableValues(c), // current values of the allowlisted fields, for the editor
  };
}

export interface KeyStatus { envVar: string; set: boolean; purpose: string; optional: boolean; }

/** Report which env vars the config references and whether they are SET — never
 *  the values. */
export function getKeysStatus(configPath: string, env: NodeJS.ProcessEnv = process.env): KeyStatus[] {
  const c = loadAgentConfig(configPath);
  const out: KeyStatus[] = [];
  const seen = new Set<string>();
  const add = (envVar: string | undefined, purpose: string, optional = false) => {
    if (!envVar || seen.has(envVar)) return;
    seen.add(envVar);
    out.push({ envVar, set: !!env[envVar], purpose, optional });
  };
  try { const llm = resolveLlm(llmConfigInput(c)); add(llm.apiKeyEnv, `LLM (${llm.provider})`, !!llm.keyOptional); } catch { /* unresolvable llm */ }
  add('LIVEKIT_URL', 'Voice (LiveKit)', true);
  add('LIVEKIT_API_KEY', 'Voice (LiveKit)', true);
  add('LIVEKIT_API_SECRET', 'Voice (LiveKit)', true);
  const d = c.tools.delivery;
  if (d?.channel === 'sms') { add(d.accountSidEnv, 'Message delivery (SMS)'); add(d.authTokenEnv, 'Message delivery (SMS)'); }
  if (d?.channel === 'email') add(d.apiKeyEnv, 'Message delivery (email)');
  return out;
}

export function getScorecard(improveDir: string): { available: boolean; scorecard?: unknown } {
  const p = join(improveDir, 'scorecard.latest.json');
  if (!existsSync(p)) return { available: false };
  try { return { available: true, scorecard: JSON.parse(readFileSync(p, 'utf8')) }; } catch { return { available: false }; }
}

// ---- server -----------------------------------------------------------------

function webRoot(): string {
  return fileURLToPath(new URL('../../web/dashboard', import.meta.url));
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function extractToken(req: IncomingMessage): string | undefined {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  const url = new URL(req.url ?? '/', 'http://localhost');
  return url.searchParams.get('t') ?? undefined;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => resolve(b));
  });
}

/** POST /api/improve — run the self-improve pipeline, streaming progress as SSE.
 *  Defaults to gated + dry-run; unguarded requires an explicit body flag. */
async function handleImprove(req: IncomingMessage, res: ServerResponse, opts: DashboardOptions, improveDir: string): Promise<void> {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  const fail = (reason: string) =>
    send({ stage: 'decided', result: { applied: false, reason, mode: 'gated', patch: { rationale: '', edits: {}, targetDimensions: [] } } });
  try {
    const parsed = JSON.parse((await readBody(req)) || '{}') as { mode?: string; apply?: boolean };
    const mode = parsed.mode === 'unguarded' ? 'unguarded' : 'gated';
    const apply = parsed.apply === true;

    const config = loadAgentConfig(opts.configPath);
    const records = readCallRecords(opts.recordsPath, { limit: 50 });
    if (!records.length) { fail('No call records yet — run some calls first.'); res.end(); return; }

    const { client, llm } = createLlmClient(resolveLlm(llmConfigInput(config)));
    const result = await runImprovePipeline({
      configPath: opts.configPath, records, personas: gatePersonas(), client, llm,
      mode, apply, outDir: improveDir,
      onProgress: (stage) => { if (stage !== 'decided') send({ stage }); },
    });
    send({ stage: 'decided', result });
  } catch (e) {
    fail(`error: ${e instanceof Error ? e.message : String(e)}`);
  }
  res.end();
}

export function startDashboardServer(opts: DashboardOptions): { close: () => void; url: string; token: string } {
  const host = opts.host ?? '127.0.0.1';
  const token = opts.token ?? nanoid();
  const improveDir = opts.improveDir ?? './improve';
  const root = webRoot();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (path.startsWith('/api/')) {
        if (extractToken(req) !== token) return json(res, 401, { error: 'unauthorized' });

        if (req.method === 'POST' && path === '/api/improve') { await handleImprove(req, res, opts, improveDir); return; }
        if (req.method === 'PUT' && path === '/api/config') {
          try {
            const body = JSON.parse((await readBody(req)) || '{}') as { edits?: ConfigEdit[] };
            const result = applyConfigEdits(opts.configPath, body.edits ?? []);
            return json(res, 200, { ok: true, backupPath: result.backupPath });
          } catch (e) {
            return json(res, 400, { ok: false, error: e instanceof Error ? e.message.split('\n')[0] : String(e) });
          }
        }
        if (req.method === 'GET' && path === '/api/calls') {
          const limit = Number(url.searchParams.get('limit') ?? '50');
          const offset = Number(url.searchParams.get('offset') ?? '0');
          return json(res, 200, readCallSummaries(opts.recordsPath, { limit, offset }));
        }
        if (req.method === 'GET' && path.startsWith('/api/calls/')) {
          const id = decodeURIComponent(path.slice('/api/calls/'.length));
          const rec = getCallRecord(opts.recordsPath, id);
          return rec ? json(res, 200, rec) : json(res, 404, { error: 'not found' });
        }
        if (req.method === 'GET' && path === '/api/scorecard') return json(res, 200, getScorecard(improveDir));
        if (req.method === 'GET' && path === '/api/config') return json(res, 200, getConfigSummary(opts.configPath));
        if (req.method === 'GET' && path === '/api/keys-status') return json(res, 200, getKeysStatus(opts.configPath));
        return json(res, 404, { error: 'unknown endpoint' });
      }

      // Static SPA. The page itself is open (it carries ?t= and uses it for API).
      const rel = path === '/' ? '/index.html' : path;
      const file = join(root, rel);
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.listen(opts.port, host, () => {
    console.log(`\n  offhook dashboard → http://${host}:${opts.port}/?t=${token}`);
    if (host !== '127.0.0.1') console.log('  ⚠️  bound to a non-local host — the token is your only guard.');
    console.log('');
  });

  return { close: () => server.close(), url: `http://${host}:${opts.port}/?t=${token}`, token };
}

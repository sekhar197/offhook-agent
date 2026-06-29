import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { executeAction, classifyError, isRetryable } from './executor.js';

type Behavior = 'ok' | 'fail500' | 'fail-then-ok';

let server: Server;
let port: number;
const received: Array<{ key: string | undefined; action: string | undefined; body: unknown }> = [];
let behavior: Behavior = 'ok';
let hits = 0;

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      hits += 1;
      received.push({
        key: req.headers['x-offhook-agent-idempotency-key'] as string | undefined,
        action: req.headers['x-offhook-agent-action'] as string | undefined,
        body: JSON.parse(raw),
      });
      if (behavior === 'fail500') {
        res.writeHead(500).end(JSON.stringify({ error: 'boom' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, () => resolve()));
  port = (server.address() as { port: number }).port;
});

afterAll(() => server.close());

describe('executeAction', () => {
  it('POSTs with the {callId}_{correlationId}_{attempt} idempotency key', async () => {
    behavior = 'ok';
    received.length = 0;
    const result = await executeAction({
      actionType: 'message.take',
      payload: { message: 'hi' },
      webhookUrl: `http://127.0.0.1:${port}/hook`,
      callId: 'callA',
      correlationId: 'corrB',
    });
    expect(result.status).toBe('ok');
    expect(result.idempotencyKey).toBe('callA_corrB_1');
    expect(received[0].key).toBe('callA_corrB_1');
    expect(received[0].action).toBe('message.take');
    expect((received[0].body as { idempotency_key: string }).idempotency_key).toBe('callA_corrB_1');
  });

  it('does NOT retry HTTP errors (server received the request)', async () => {
    behavior = 'fail500';
    hits = 0;
    const result = await executeAction({
      actionType: 'summary.send',
      payload: {},
      webhookUrl: `http://127.0.0.1:${port}/hook`,
      callId: 'c',
      correlationId: 'x',
    });
    expect(hits).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.errorReason).toBe('http_error');
  });

  it('retries connection-refused and reports failed_offer_transfer after 2 attempts', async () => {
    const result = await executeAction({
      actionType: 'message.take',
      payload: {},
      webhookUrl: 'http://127.0.0.1:1/hook', // nothing listens here
      callId: 'c',
      correlationId: 'x',
      timeoutMs: 500,
    });
    expect(result.status).toBe('failed_offer_transfer');
    expect(result.attempts).toBe(2);
    expect(result.idempotencyKey).toBe('c_x_2');
  }, 10_000);
});

describe('retry classification', () => {
  it('connection-level errors are always retryable', () => {
    expect(isRetryable('connection_refused', 1)).toBe(true);
    expect(isRetryable('connection_refused', 2)).toBe(true);
    expect(isRetryable('dns_error', 2)).toBe(true);
  });

  it('timeouts/network errors retry only on attempt 1', () => {
    expect(isRetryable('timeout_error', 1)).toBe(true);
    expect(isRetryable('timeout_error', 2)).toBe(false);
    expect(isRetryable('network_error', 2)).toBe(false);
  });

  it('http errors are never retryable', () => {
    expect(isRetryable('http_error', 1)).toBe(false);
  });

  it('classifies node error codes', () => {
    expect(classifyError({ cause: { code: 'ECONNREFUSED' } })).toBe('connection_refused');
    expect(classifyError({ cause: { code: 'ENOTFOUND' } })).toBe('dns_error');
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(classifyError(abort)).toBe('timeout_error');
  });
});

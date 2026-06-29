/**
 * Stress: the action executor under burst concurrency + chaos. Proves the two
 * production guarantees hold when many calls hit it at once and the network
 * misbehaves: (1) no idempotency-key collision across distinct calls — a
 * receiver deduping on the key can never conflate two callers; (2) graceful
 * degradation — connection failures retry then offer a human, never a silent
 * third try, never dead-air. Account-free (injected fetch).
 */
import { describe, expect, it, vi } from 'vitest';
import { executeAction } from '../../src/actions/executor.js';

const BURST = 500;

describe('executor — burst concurrency', () => {
  it('every concurrent call gets a unique idempotency key and lands exactly once', async () => {
    const seen: string[] = [];
    const okFetch = (async (_url: string, init: { headers: Record<string, string> }) => {
      seen.push(init.headers['X-Offhook-Agent-Idempotency-Key']);
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const results = await Promise.all(
      Array.from({ length: BURST }, (_, i) =>
        executeAction({
          actionType: 'message.take',
          payload: { i },
          webhookUrl: 'http://x',
          callId: `call-${i}`,
          correlationId: `corr-${i}`,
          fetchImpl: okFetch,
        }),
      ),
    );

    expect(results.every(r => r.status === 'ok')).toBe(true);
    // Exactly BURST sends, every key distinct — no cross-call collision, no double-send.
    expect(seen).toHaveLength(BURST);
    expect(new Set(seen).size).toBe(BURST);
    expect(new Set(results.map(r => r.idempotencyKey)).size).toBe(BURST);
  });
});

describe('executor — chaos (graceful degradation, never dead-air)', () => {
  it('connection failures retry then offer a human — never a silent extra retry', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const refusing = (async () => {
      calls.push(1);
      const e = new Error('refused') as Error & { code: string };
      e.code = 'ECONNREFUSED';
      throw e;
    }) as unknown as typeof fetch;

    const p = executeAction({
      actionType: 'message.take', payload: {}, webhookUrl: 'http://x',
      callId: 'c', correlationId: 'k', fetchImpl: refusing,
    });
    await vi.advanceTimersByTimeAsync(2000); // flush the retry delay
    const r = await p;
    vi.useRealTimers();

    expect(r.status).toBe('failed_offer_transfer'); // the caller is offered a person
    expect(r.attempts).toBe(2);                     // retried exactly once, then stopped
    expect(calls).toHaveLength(2);                  // no silent third attempt
    expect(r.errorReason).toBe('connection_refused');
  });

  it('HTTP errors never retry (the receiver may have acted)', async () => {
    let n = 0;
    const err500 = (async () => { n++; return { ok: false, status: 500, json: async () => ({}) }; }) as unknown as typeof fetch;
    const r = await executeAction({
      actionType: 'message.take', payload: {}, webhookUrl: 'http://x',
      callId: 'c', correlationId: 'k', fetchImpl: err500,
    });
    expect(n).toBe(1);                 // single attempt — no blind retry of a server-side failure
    expect(r.status).toBe('failed');
    expect(r.errorReason).toBe('http_error');
  });
});

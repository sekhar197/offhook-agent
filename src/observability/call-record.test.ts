import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CallRecorder,
  jsonlFileSink,
  webhookSink,
  compositeSink,
  type CallRecord,
  type CallSink,
} from './call-record.js';

/** A clock that advances by a fixed step on each read — deterministic latency. */
function steppedClock(start: number, step: number): () => number {
  let t = start;
  return () => {
    const cur = t;
    t += step;
    return cur;
  };
}

describe('CallRecorder', () => {
  it('builds a record with identity, timing, and outcome', async () => {
    const captured: CallRecord[] = [];
    const sink: CallSink = (r) => { captured.push(r); };
    const rec = new CallRecorder(
      { callId: 'c1', correlationId: 'room-1', agentId: 'dental' },
      { now: steppedClock(1_000, 500), sink },
    );
    rec.addTurn({ phase: 'greeting', caller: 'hi', agent: 'Hello!' });
    const record = await rec.finish('completed');

    expect(record.callId).toBe('c1');
    expect(record.correlationId).toBe('room-1');
    expect(record.agentId).toBe('dental');
    expect(record.outcome).toBe('completed');
    expect(record.turnCount).toBe(1);
    expect(record.durationMs).toBeGreaterThan(0);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual(record);
  });

  it('derives tool records from a turn tool list', async () => {
    const rec = new CallRecorder({ callId: 'c2' }, { now: steppedClock(0, 1) });
    rec.addTurn({ caller: 'whats your cleaning', agent: 'A cleaning is 45 min', toolsCalled: ['answer_from_knowledge'] });
    const record = await rec.finish('completed');
    expect(record.toolCallCount).toBe(1);
    expect(record.tools[0]).toMatchObject({ turnIndex: 0, name: 'answer_from_knowledge', ok: true });
  });

  it('lets recordTool supersede the bare turn-level entry with outcome + latency', async () => {
    const rec = new CallRecorder({ callId: 'c3' }, { now: steppedClock(0, 1) });
    const idx = rec.addTurn({ agent: 'one sec', toolsCalled: ['take_message'] });
    rec.recordTool({ turnIndex: idx, name: 'take_message', ok: false, latencyMs: 320, error: 'delivery endpoint unreachable' });
    const record = await rec.finish('error');
    expect(record.tools).toHaveLength(1);
    expect(record.tools[0]).toMatchObject({ name: 'take_message', ok: false, latencyMs: 320 });
  });

  it('aggregates per-turn latency (mean, p95, max)', async () => {
    const rec = new CallRecorder({ callId: 'c4' }, { now: steppedClock(0, 1) });
    rec.addTurn({ latencyMs: 100 });
    rec.addTurn({ latencyMs: 200 });
    rec.addTurn({ latencyMs: 300 });
    rec.addTurn({ latencyMs: 1000 });
    const record = await rec.finish('completed');
    expect(record.latency).toBeDefined();
    expect(record.latency!.sampled).toBe(4);
    expect(record.latency!.maxTurnMs).toBe(1000);
    expect(record.latency!.meanTurnMs).toBe(400);
    expect(record.latency!.p95TurnMs).toBe(1000);
  });

  it('omits latency aggregate when no turn measured it', async () => {
    const rec = new CallRecorder({ callId: 'c5' }, { now: steppedClock(0, 1) });
    rec.addTurn({ caller: 'hi', agent: 'hello' });
    const record = await rec.finish('completed');
    expect(record.latency).toBeUndefined();
  });

  it('records caller-safe errors with timestamps', async () => {
    const rec = new CallRecorder({ callId: 'c6' }, { now: steppedClock(2_000, 1) });
    rec.recordError('search backend timeout', 0);
    const record = await rec.finish('error');
    expect(record.errors).toHaveLength(1);
    expect(record.errors[0]!.message).toBe('search backend timeout');
    expect(record.errors[0]!.turnIndex).toBe(0);
    expect(record.errors[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('flushes to the sink only once even if finish is called twice', async () => {
    const sink = vi.fn();
    const rec = new CallRecorder({ callId: 'c7' }, { now: steppedClock(0, 1), sink });
    await rec.finish('completed');
    await rec.finish('completed');
    expect(sink).toHaveBeenCalledTimes(1);
  });
});

describe('sinks', () => {
  it('jsonlFileSink appends one JSON line per call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'offhook-obs-'));
    const path = join(dir, 'nested', 'calls.jsonl');
    try {
      const sink = jsonlFileSink(path);
      const r1 = await new CallRecorder({ callId: 'a' }, { now: steppedClock(0, 1), sink }).finish('completed');
      await new CallRecorder({ callId: 'b' }, { now: steppedClock(0, 1), sink }).finish('caller_hangup');
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).callId).toBe('a');
      expect(JSON.parse(lines[1]!).callId).toBe('b');
      expect(JSON.parse(lines[0]!)).toMatchObject({ outcome: r1.outcome });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('webhookSink POSTs the record as JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok'));
    const sink = webhookSink('https://ops.example/calls', fetchImpl as unknown as typeof fetch);
    await new CallRecorder({ callId: 'wh' }, { now: steppedClock(0, 1), sink }).finish('completed');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://ops.example/calls');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string).callId).toBe('wh');
  });

  it('compositeSink fans out and a failing sink never blocks the rest', async () => {
    const good = vi.fn();
    const bad = vi.fn(() => { throw new Error('boom'); });
    const sink = compositeSink(bad as unknown as CallSink, good);
    await new CallRecorder({ callId: 'comp' }, { now: steppedClock(0, 1), sink }).finish('completed');
    expect(good).toHaveBeenCalledOnce();
  });
});

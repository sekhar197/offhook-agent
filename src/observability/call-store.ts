/**
 * Read call records back from the jsonl sink. Shared by `offhook-agent improve`
 * (learns from real calls) and the dashboard (lists/shows them).
 *
 * Defensive by design: the file is appended to by a live worker, so the last
 * line may be half-written, and a crash can leave a malformed line. We parse
 * line-by-line and skip anything that doesn't parse — a bad line never breaks
 * a read.
 */
import { readFileSync, existsSync } from 'node:fs';
import type { CallRecord } from './call-record.js';

/** Slim projection for list views — never ships full transcripts. */
export interface CallSummary {
  callId: string;
  startedAt: string;
  durationMs?: number;
  outcome: CallRecord['outcome'];
  turnCount: number;
  toolCallCount: number;
  meanTurnMs?: number;
}

function parseAll(path: string): CallRecord[] {
  if (!existsSync(path)) return [];
  // NOTE: reads the whole file. Fine for v0.1; for very large 24/7 logs a
  // tail/stream read is the follow-up (see docs/observability roadmap).
  const out: CallRecord[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t) as CallRecord); } catch { /* skip malformed/partial line */ }
  }
  return out;
}

/** Newest-first records, with optional paging. */
export function readCallRecords(path: string, opts: { limit?: number; offset?: number } = {}): CallRecord[] {
  const all = parseAll(path).reverse(); // newest first
  const offset = opts.offset ?? 0;
  return all.slice(offset, opts.limit !== undefined ? offset + opts.limit : undefined);
}

/** Newest-first slim summaries for the dashboard list. */
export function readCallSummaries(path: string, opts: { limit?: number; offset?: number } = {}): CallSummary[] {
  return readCallRecords(path, opts).map(r => ({
    callId: r.callId,
    startedAt: r.startedAt,
    outcome: r.outcome,
    turnCount: r.turnCount,
    toolCallCount: r.toolCallCount,
    ...(r.durationMs !== undefined ? { durationMs: r.durationMs } : {}),
    ...(r.latency ? { meanTurnMs: r.latency.meanTurnMs } : {}),
  }));
}

export function getCallRecord(path: string, callId: string): CallRecord | null {
  return parseAll(path).find(r => r.callId === callId) ?? null;
}

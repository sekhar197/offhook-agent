import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallRecord } from './call-record.js';
import { readCallRecords, readCallSummaries, getCallRecord } from './call-store.js';

function rec(id: string, over: Partial<CallRecord> = {}): CallRecord {
  return {
    callId: id, startedAt: '2026-06-15T00:00:00Z', outcome: 'completed',
    turnCount: 2, toolCallCount: 1, turns: [], tools: [], errors: [],
    durationMs: 1000, latency: { meanTurnMs: 250, p95TurnMs: 400, maxTurnMs: 400, sampled: 2 },
    ...over,
  };
}

function writeJsonl(records: CallRecord[], extra = ''): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'offhook-store-'));
  const path = join(dir, 'call-records.jsonl');
  writeFileSync(path, records.map(r => JSON.stringify(r)).join('\n') + '\n' + extra);
  return { dir, path };
}

describe('call-store', () => {
  it('reads newest-first and skips malformed/blank lines', () => {
    // written oldest→newest; a half-written trailing line (crash) + a blank line
    const { dir, path } = writeJsonl([rec('c1'), rec('c2'), rec('c3')], '{ this is not valid json\n\n');
    try {
      const records = readCallRecords(path);
      expect(records.map(r => r.callId)).toEqual(['c3', 'c2', 'c1']); // newest first, bad line skipped
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('honors limit and offset', () => {
    const { dir, path } = writeJsonl([rec('c1'), rec('c2'), rec('c3'), rec('c4')]);
    try {
      expect(readCallRecords(path, { limit: 2 }).map(r => r.callId)).toEqual(['c4', 'c3']);
      expect(readCallRecords(path, { limit: 2, offset: 2 }).map(r => r.callId)).toEqual(['c2', 'c1']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('getCallRecord finds by id and returns null for a miss', () => {
    const { dir, path } = writeJsonl([rec('c1'), rec('c2')]);
    try {
      expect(getCallRecord(path, 'c2')?.callId).toBe('c2');
      expect(getCallRecord(path, 'nope')).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('readCallSummaries returns a slim projection (no transcripts)', () => {
    const { dir, path } = writeJsonl([rec('c1', { turns: [{ index: 0, caller: 'secret', agent: 'reply' }] })]);
    try {
      const [s] = readCallSummaries(path);
      expect(s).toMatchObject({ callId: 'c1', outcome: 'completed', turnCount: 2, meanTurnMs: 250 });
      expect(JSON.stringify(s)).not.toContain('secret'); // no transcript leaks into the list
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('returns [] for a missing file', () => {
    expect(readCallRecords('/no/such/file.jsonl')).toEqual([]);
  });
});

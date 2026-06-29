/**
 * Stress: the jsonl call-record sink under concurrent writes + a corrupted log.
 * A live worker appends one line per finished call; many can finish at once and
 * a crash can leave a half-written line. Proves: concurrent appends don't corrupt
 * the file (every record reads back), and the defensive reader skips garbage
 * without losing the good records. Account-free (tmp file).
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsonlFileSink } from '../../src/observability/call-record.js';
import { readCallRecords, getCallRecord } from '../../src/observability/call-store.js';
import type { CallRecord } from '../../src/observability/call-record.js';

const N = 300;

function record(i: number): CallRecord {
  return {
    callId: `call-${i}`, startedAt: '2026-06-18T00:00:00Z', endedAt: '2026-06-18T00:01:00Z',
    durationMs: 60000, outcome: 'completed', turnCount: 1, toolCallCount: 0,
    turns: [{ index: 0, caller: 'hi', agent: 'hello' }], tools: [], errors: [],
  };
}

describe('call-store — concurrent writes + corruption tolerance', () => {
  it('every concurrently-appended record reads back intact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'offhook-agent-store-'));
    const path = join(dir, 'call-records.jsonl');
    try {
      const sink = jsonlFileSink(path);
      await Promise.all(Array.from({ length: N }, (_, i) => sink(record(i))));

      const read = readCallRecords(path);
      expect(read).toHaveLength(N);
      // every id present exactly once — no interleaved/torn lines
      expect(new Set(read.map(r => r.callId)).size).toBe(N);
      expect(getCallRecord(path, 'call-250')?.callId).toBe('call-250');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a corrupted log (half-written + garbage lines) still yields all good records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'offhook-agent-store-'));
    const path = join(dir, 'call-records.jsonl');
    try {
      appendFileSync(path, JSON.stringify(record(1)) + '\n');
      appendFileSync(path, '{"callId":"torn", "outcome":');          // half-written line (crash)
      appendFileSync(path, '\nnot json at all\n');                    // pure garbage
      appendFileSync(path, JSON.stringify(record(2)) + '\n');
      appendFileSync(path, '\n   \n');                                // blank lines

      const read = readCallRecords(path);
      expect(read.map(r => r.callId).sort()).toEqual(['call-1', 'call-2']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

/**
 * Structured call records — the "I can see exactly what happened on a call"
 * layer. Provider-agnostic and dependency-free so it's reachable from the
 * voice path (fed by LiveKit session events), the text/eval path (recorded
 * explicitly around runTextTurn), and unit tests (injected clock, in-memory
 * sink).
 *
 * One CallRecord per call: identity, timing, outcome, every turn, every tool
 * call, and any errors — flushed to a configurable sink when the call ends.
 * This is what makes an offhook-agent deployment operable: an owner can review a
 * call, latency can be measured, failures are visible instead of lost in logs.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/** One exchange in the call: caller said X, agent replied Y, ran these tools. */
export interface TurnRecord {
  index: number;
  phase?: string;
  /** Caller utterance (final transcript on the voice path). */
  caller?: string;
  /** Agent reply (the spoken text). */
  agent?: string;
  toolsCalled?: string[];
  /** Wall time from caller-final to agent reply ready, if measured. */
  latencyMs?: number;
}

/** A single tool invocation and how it went. */
export interface ToolCallRecord {
  turnIndex: number;
  name: string;
  ok: boolean;
  latencyMs?: number;
  /** Caller-safe failure note — never raw internals. */
  error?: string;
}

export interface CallErrorRecord {
  turnIndex?: number;
  message: string;
  at: string;
}

/** How the call ended — the single most useful field for an operator. */
export type CallOutcome =
  | 'completed'       // agent ended the call normally
  | 'transferred'     // handed to a human
  | 'caller_hangup'
  | 'max_turns'
  | 'error'
  | 'unknown';

export interface CallRecord {
  callId: string;
  correlationId?: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  outcome: CallOutcome;
  turnCount: number;
  toolCallCount: number;
  turns: TurnRecord[];
  tools: ToolCallRecord[];
  errors: CallErrorRecord[];
  /** Aggregate per-turn latency over turns that reported a latencyMs. */
  latency?: { meanTurnMs: number; p95TurnMs: number; maxTurnMs: number; sampled: number };
  /** Agent-generated call summary, if the agent ran a summary tool. */
  summary?: string;
}

/** A sink consumes a finished CallRecord. Async so it can write/POST. */
export type CallSink = (record: CallRecord) => void | Promise<void>;

export interface CallRecorderMeta {
  callId: string;
  correlationId?: string;
  agentId?: string;
}

export interface CallRecorderOptions {
  /** Injectable clock (ms epoch). Defaults to Date.now — overridden in tests. */
  now?: () => number;
  /** Where the finished record goes. Defaults to no-op (record kept in memory). */
  sink?: CallSink;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, rank))]!;
}

/**
 * Accumulates a single call's events and flushes a CallRecord on finish().
 * Tolerant of partial data — any field can be omitted (the voice path may not
 * have a phase; the text path may not measure tool latency).
 */
export class CallRecorder {
  private readonly now: () => number;
  private readonly sink: CallSink;
  private readonly startMs: number;
  private readonly meta: CallRecorderMeta;
  private readonly turns: TurnRecord[] = [];
  private readonly tools: ToolCallRecord[] = [];
  private readonly errors: CallErrorRecord[] = [];
  private summary?: string;
  private finished = false;

  constructor(meta: CallRecorderMeta, opts: CallRecorderOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.sink = opts.sink ?? (() => {});
    this.meta = meta;
    this.startMs = this.now();
  }

  /** Record one completed turn. Index is assigned in arrival order. */
  addTurn(turn: Omit<TurnRecord, 'index'>): number {
    const index = this.turns.length;
    this.turns.push({ index, ...turn });
    if (turn.toolsCalled) {
      for (const name of turn.toolsCalled) {
        // A turn-level tool list without its own record still counts; a richer
        // recordTool() call (with ok/latency) supersedes nothing — both append.
        if (!this.tools.some(t => t.turnIndex === index && t.name === name)) {
          this.tools.push({ turnIndex: index, name, ok: true });
        }
      }
    }
    return index;
  }

  /** Record a tool invocation with outcome/latency (richer than addTurn's list). */
  recordTool(tool: ToolCallRecord): void {
    // Replace a bare turn-level entry for the same (turn,name) if present.
    const i = this.tools.findIndex(
      t => t.turnIndex === tool.turnIndex && t.name === tool.name && t.latencyMs === undefined && t.ok && t.error === undefined,
    );
    if (i >= 0) this.tools[i] = tool;
    else this.tools.push(tool);
  }

  /** Set the call's summary (from the agent's summary tool). Last write wins. */
  setSummary(summary: string): void {
    if (summary.trim()) this.summary = summary.trim();
  }

  recordError(message: string, turnIndex?: number): void {
    this.errors.push({
      message,
      at: new Date(this.now()).toISOString(),
      ...(turnIndex !== undefined ? { turnIndex } : {}),
    });
  }

  /** Build, flush, and return the CallRecord. Idempotent guard against double-finish. */
  async finish(outcome: CallOutcome): Promise<CallRecord> {
    const endMs = this.now();
    const latencies = this.turns
      .map(t => t.latencyMs)
      .filter((x): x is number => typeof x === 'number')
      .sort((a, b) => a - b);

    const record: CallRecord = {
      callId: this.meta.callId,
      ...(this.meta.correlationId ? { correlationId: this.meta.correlationId } : {}),
      ...(this.meta.agentId ? { agentId: this.meta.agentId } : {}),
      startedAt: new Date(this.startMs).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      durationMs: endMs - this.startMs,
      outcome,
      turnCount: this.turns.length,
      toolCallCount: this.tools.length,
      turns: this.turns,
      tools: this.tools,
      errors: this.errors,
      ...(this.summary ? { summary: this.summary } : {}),
      ...(latencies.length > 0
        ? {
            latency: {
              meanTurnMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
              p95TurnMs: percentile(latencies, 95),
              maxTurnMs: latencies[latencies.length - 1]!,
              sampled: latencies.length,
            },
          }
        : {}),
    };

    if (!this.finished) {
      this.finished = true;
      await this.sink(record);
    }
    return record;
  }
}

// =============================================================================
// SINKS
// =============================================================================

/** Discards the record (in-memory only). The default. */
export const noopSink: CallSink = () => {};

/** Pretty one-line summary + full JSON to stdout. Good for local dev. */
export function consoleSink(): CallSink {
  return (r) => {
    const tools = r.tools.length ? ` tools=${r.tools.map(t => t.name).join(',')}` : '';
    const lat = r.latency ? ` mean=${r.latency.meanTurnMs}ms p95=${r.latency.p95TurnMs}ms` : '';
    // eslint-disable-next-line no-console
    console.log(`[call ${r.callId}] ${r.outcome} turns=${r.turnCount}${tools}${lat} dur=${r.durationMs}ms`);
  };
}

/** Append one JSON line per call to a file (newline-delimited JSON). */
export function jsonlFileSink(path: string): CallSink {
  return async (r) => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, JSON.stringify(r) + '\n', 'utf8');
  };
}

/** POST the record as JSON to a webhook (e.g. an analytics/ops endpoint). */
export function webhookSink(url: string, fetchImpl: typeof fetch = fetch): CallSink {
  return async (r) => {
    await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(r),
    });
  };
}

/** Fan a record out to several sinks; one failing sink never blocks the rest.
 *  The async wrapper converts a synchronous throw into a rejected promise so
 *  allSettled isolates it. */
export function compositeSink(...sinks: CallSink[]): CallSink {
  return async (r) => {
    await Promise.allSettled(sinks.map(s => (async () => s(r))()));
  };
}

/** Build a sink from the agent.yaml `observability` block (narrow shape, so
 *  this module stays decoupled from the full config type). */
export function sinkFromConfig(cfg: { sink: 'jsonl' | 'webhook' | 'console' | 'none'; path?: string; url?: string }): CallSink {
  switch (cfg.sink) {
    case 'jsonl': return jsonlFileSink(cfg.path ?? './call-records.jsonl');
    case 'webhook':
      if (!cfg.url) throw new Error('observability.sink "webhook" requires observability.url');
      return webhookSink(cfg.url);
    case 'console': return consoleSink();
    case 'none': return noopSink;
  }
}

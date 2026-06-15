/**
 * Voice-path adapter: turn a LiveKit AgentSession's event stream into a
 * CallRecord. Depends only on a minimal `on(event, listener)` surface — not
 * the concrete AgentSession type — so it's unit-testable with a fake emitter
 * and not coupled to LiveKit internals.
 *
 * Event → record mapping (LiveKit @livekit/agents 1.4.x):
 *   conversation_item_added (role=user)      → buffer the caller utterance
 *   conversation_item_added (role=assistant) → flush a turn (caller+agent+tools+latency)
 *   function_tools_executed                  → buffer tool names for the next turn
 *   metrics_collected (llm_metrics)          → buffer ttft as the next turn's latency
 *   error                                    → append an error
 *   close                                    → finish() with a derived outcome
 */
import { CallRecorder, type CallOutcome, type CallRecord } from './call-record.js';

/** The slice of AgentSession the recorder needs. */
export interface RecordableSession {
  on(event: string, listener: (ev: unknown) => void): unknown;
}

// LiveKit event-name string literals (mirror AgentSessionEventTypes values so
// we don't import the enum and pull the whole package into unit tests).
const EV = {
  itemAdded: 'conversation_item_added',
  toolsExecuted: 'function_tools_executed',
  metrics: 'metrics_collected',
  error: 'error',
  close: 'close',
} as const;

// Narrow structural views of the payloads we read (duck-typed; real LiveKit
// objects and test fakes both satisfy these).
interface ItemAddedEv { item?: { role?: string; textContent?: string }; }
interface ToolsExecEv { functionCalls?: Array<{ name?: string }>; }
interface MetricsEv { metrics?: { type?: string; ttftMs?: number }; }
interface ErrorEv { error?: unknown; }
interface CloseEv { reason?: string; error?: unknown; }

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return String(e);
}

/**
 * Map a LiveKit close reason (+ in-call signals) to an operator-meaningful
 * outcome. Priority: a hard error wins; then an explicit transfer/end-call
 * tool; then the transport reason.
 */
function deriveOutcome(reason: string | undefined, hadError: boolean, sawTransfer: boolean, sawEndCall: boolean): CallOutcome {
  if (hadError) return 'error';
  if (sawTransfer) return 'transferred';
  if (sawEndCall) return 'completed';
  switch (reason) {
    case 'error': return 'error';
    case 'participant_disconnected': return 'caller_hangup';
    case 'job_shutdown':
    case 'user_initiated': return 'completed';
    default: return 'unknown';
  }
}

/**
 * Subscribe a recorder to a session. Returns the recorder so the caller can
 * force a flush on shutdown (finish() is idempotent — whichever path fires
 * first wins). The returned `finish` is a safety net for the case where the
 * `close` event never arrives.
 */
export function attachSessionRecorder(
  session: RecordableSession,
  recorder: CallRecorder,
): { recorder: CallRecorder; finish: (outcome?: CallOutcome) => Promise<CallRecord> } {
  let pendingCaller: string | undefined;
  let pendingTools: string[] = [];
  let pendingLatencyMs: number | undefined;
  let sawTransfer = false;
  let sawEndCall = false;
  let hadError = false;

  session.on(EV.itemAdded, (ev) => {
    const item = (ev as ItemAddedEv).item;
    if (!item) return;
    const text = item.textContent;
    if (item.role === 'user') {
      pendingCaller = text;
    } else if (item.role === 'assistant') {
      recorder.addTurn({
        ...(pendingCaller !== undefined ? { caller: pendingCaller } : {}),
        ...(text !== undefined ? { agent: text } : {}),
        ...(pendingTools.length ? { toolsCalled: [...pendingTools] } : {}),
        ...(pendingLatencyMs !== undefined ? { latencyMs: pendingLatencyMs } : {}),
      });
      pendingCaller = undefined;
      pendingTools = [];
      pendingLatencyMs = undefined;
    }
  });

  session.on(EV.toolsExecuted, (ev) => {
    for (const call of (ev as ToolsExecEv).functionCalls ?? []) {
      if (!call?.name) continue;
      pendingTools.push(call.name);
      if (call.name === 'transfer_to_human') sawTransfer = true;
      if (call.name === 'end_call') sawEndCall = true;
    }
  });

  session.on(EV.metrics, (ev) => {
    const m = (ev as MetricsEv).metrics;
    if (m?.type === 'llm_metrics' && typeof m.ttftMs === 'number') pendingLatencyMs = m.ttftMs;
  });

  session.on(EV.error, (ev) => {
    hadError = true;
    recorder.recordError(errorMessage((ev as ErrorEv).error));
  });

  session.on(EV.close, (ev) => {
    const { reason, error } = ev as CloseEv;
    if (error) hadError = true;
    void recorder.finish(deriveOutcome(reason, hadError, sawTransfer, sawEndCall));
  });

  return {
    recorder,
    finish: (outcome?: CallOutcome) =>
      recorder.finish(outcome ?? deriveOutcome(undefined, hadError, sawTransfer, sawEndCall)),
  };
}

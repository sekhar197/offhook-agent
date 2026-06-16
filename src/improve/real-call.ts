/**
 * Real-call → judge adapter.
 *
 * The self-improvement loop learns from REAL calls, but `judgeCall` was built
 * for SIMULATED calls (it expects a `SimulatedCall` with a persona + goal).
 * A real call has no persona and no declared goal, so this adapter wraps a
 * `CallRecord` as a `SimulatedCall` with a synthetic "observed caller" shell.
 *
 * Important consequence (handled downstream in clustering): `task_resolved`
 * is NOT reliable without a goal, so real calls are used for failure
 * DISCOVERY only — the canonical eval gate (which runs synthetic personas that
 * DO have goals) is what actually approves a change. The dimensions that judge
 * the transcript itself — caller_safe (deterministic), no_phantom_claims,
 * stayed_in_character, searched_before_deny — all apply to real calls.
 */
import type { CallRecord } from '../observability/call-record.js';
import type { SimulatedCall, TranscriptTurn } from '../evals/simulate.js';
import type { Persona } from '../evals/personas.js';

/** Dimensions that are meaningful when scoring a real (goal-less) call. */
export const REAL_CALL_DIMENSIONS = [
  'caller_safe', 'no_phantom_claims', 'stayed_in_character', 'searched_before_deny',
] as const;

/** Map a call outcome to the simulator's coarser endedBy. */
function outcomeToEndedBy(outcome: CallRecord['outcome']): SimulatedCall['endedBy'] {
  switch (outcome) {
    case 'caller_hangup': return 'hangup';
    case 'completed':
    case 'transferred': return 'agent_end';
    default: return 'max_turns'; // max_turns, error, unknown
  }
}

/** Build the synthetic "observed caller" persona for a real call. */
function observedPersona(record: CallRecord): Persona {
  return {
    id: `real:${record.callId}`,
    description: 'Real caller (observed production call)',
    goal: '(unknown — observed production call)',
    systemPrompt: '',
    maxTurns: Math.max(1, record.turnCount),
  };
}

/**
 * Convert a finished real call into a judgeable `SimulatedCall`. Each turn's
 * caller utterance and agent reply become transcript entries (in order; empty
 * sides dropped, e.g. a greeting turn with no caller). Tool names ride along
 * on the agent turn so the judge can reason about search-before-deny.
 */
export function realCallToJudgeable(record: CallRecord): SimulatedCall {
  const transcript: TranscriptTurn[] = [];
  for (const turn of record.turns) {
    if (turn.caller && turn.caller.trim()) {
      transcript.push({ role: 'caller', content: turn.caller });
    }
    if (turn.agent && turn.agent.trim()) {
      transcript.push({
        role: 'agent',
        content: turn.agent,
        ...(turn.toolsCalled && turn.toolsCalled.length ? { toolsCalled: turn.toolsCalled } : {}),
      });
    }
  }
  return {
    persona: observedPersona(record),
    transcript,
    endedBy: outcomeToEndedBy(record.outcome),
  };
}

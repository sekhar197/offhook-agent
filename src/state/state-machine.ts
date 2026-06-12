/**
 * Conversation Phase Derivation
 *
 * Derives the conversation phase from observable session facts (task working
 * set, caller info, task status) instead of predicting intent from speech
 * regex. The LLM handles all intent disambiguation via micro-prompts.
 * Phase updates after tool execution, not before LLM processing.
 */

import type { CallerInfo } from '../types.js';

// =============================================================================
// TYPES
// =============================================================================

export type ConversationPhase =
  | 'greeting'       // call just connected
  | 'discovery'      // caller exploring / asking; no task in progress
  | 'task_building'  // a task working set has items (order, booking, message)
  | 'confirmation'   // working set + caller identified; confirming + executing
  | 'info_query'     // externally flagged informational turn
  | 'transfer'       // handing off to a human
  | 'goodbye';       // task submitted; wrapping up

/** Observable signals the phase is derived from. */
export interface PhaseSignals {
  /** Working set of the current task (cart items, booking slots, message
   *  fields). Only `length` is read. */
  taskItems: { length: number };
  /** The session's primary task has been submitted/executed. */
  taskSubmitted: boolean;
  /** Caller details captured so far. */
  callerInfo?: CallerInfo;
}

// =============================================================================
// PHASE DERIVATION (pure function, no regex, <0.1ms)
// =============================================================================

/**
 * Derive the current conversation phase from observable session signals.
 *
 * Priority (highest first):
 *   1. taskSubmitted -> goodbye (done, wrap up)
 *   2. working set + caller name -> confirmation (read-back / executing)
 *   3. working set has items -> task_building (adding, modifying)
 *   4. default -> discovery (exploring, asking questions)
 *
 * Info, transfer, and greeting phases are set externally via `phaseOverride`
 * and reset on the next turn. The LLM handles nuance (e.g. "what's your
 * number?" during confirmation is NOT an info query — the prompt tells it so).
 */
export function derivePhase(
  signals: PhaseSignals,
  phaseOverride?: ConversationPhase,
): ConversationPhase {
  if (phaseOverride) return phaseOverride;
  if (signals.taskSubmitted) return 'goodbye';
  if (signals.callerInfo?.name && signals.taskItems.length > 0) return 'confirmation';
  if (signals.taskItems.length > 0) return 'task_building';
  return 'discovery';
}

// =============================================================================
// TOOLS PER PHASE
// =============================================================================

/**
 * Default tools available per phase. The tool registry filters the tool set
 * sent to the LLM with this map, reducing schema overhead from ~12 tools
 * (~800 tokens) to 3-5 tools (~250 tokens) per turn. end_call and
 * transfer_to_human are always added as escape hatches regardless of phase.
 *
 * Deployments override this via agent config when they register custom tools.
 */
export const DEFAULT_PHASE_TOOLS: Record<ConversationPhase, string[]> = {
  greeting:      ['answer_from_knowledge', 'end_call'],
  discovery:     ['answer_from_knowledge', 'take_message', 'end_call'],
  task_building: ['answer_from_knowledge', 'take_message', 'send_summary', 'end_call'],
  confirmation:  ['answer_from_knowledge', 'take_message', 'send_summary', 'end_call'],
  info_query:    ['answer_from_knowledge', 'take_message', 'end_call'],
  transfer:      ['transfer_to_human', 'end_call'],
  goodbye:       ['end_call'],
};

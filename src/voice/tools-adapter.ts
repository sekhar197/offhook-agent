/**
 * Tool adapter — expose offhook's ToolRegistry as LiveKit tools.
 *
 * The voice pipeline uses LiveKit's native streaming LLM node (for barge-in,
 * interruption, metrics, and realtime-mode uniformity), but every tool still
 * executes through offhook's `ToolRegistry.execute` — so caller-safety
 * enforcement, the max-3-results rule, and idempotent action semantics are
 * identical to the text path. One brain, two transports.
 *
 * Phase-gated tool SETS (different tools per phase) are a refinement: at v0.1
 * the full enabled set is exposed and the micro-prompt's phase hint guides
 * selection. `toolsForPhase` is provided for when LiveKit supports cheap
 * per-turn tool swaps.
 */

import { llm as llmNs } from '@livekit/agents';
import type { ToolRegistry, ToolContext as OffhookToolContext, ToolDefinition } from '../tools/registry.js';
import { DEFAULT_PHASE_TOOLS, type ConversationPhase } from '../state/state-machine.js';

export interface VoiceToolUserData {
  /** The offhook per-call tool context (capabilities + scratch state). */
  offhookCtx: OffhookToolContext;
  registry: ToolRegistry;
}

/** Convert one offhook tool into a LiveKit function tool that delegates to the
 *  registry (preserving caller-safety + executors). */
function adaptTool(def: ToolDefinition, registry: ToolRegistry) {
  return llmNs.tool({
    description: def.description,
    // def.parameters is a JSON-Schema object; LiveKit accepts JSONSchema7 at
    // runtime. Cast to the schema union's inferred-output shape so the tool()
    // overload resolves and execute args type as Record<string, unknown>.
    parameters: def.parameters as unknown as { _output: Record<string, unknown> },
    execute: async (args: Record<string, unknown>, opts) => {
      const ud = opts?.ctx?.userData as VoiceToolUserData | undefined;
      if (!ud) {
        return { success: false, message: "I couldn't do that just now." };
      }
      // registry.execute enforces caller-safety on the returned message.
      return registry.execute(def.name, args ?? {}, ud.offhookCtx);
    },
  });
}

/** Build the LiveKit ToolContext for the full enabled tool set. */
export function buildVoiceTools(
  registry: ToolRegistry,
  enabled: string[],
): llmNs.ToolContext {
  const out: Record<string, ReturnType<typeof adaptTool>> = {};
  for (const name of enabled) {
    const def = registry.get(name);
    if (def) out[name] = adaptTool(def, registry);
  }
  return out as unknown as llmNs.ToolContext;
}

/** Names of the tools available in a phase (intersection of phase map +
 *  enabled), with end_call/transfer_to_human always available. Used by the
 *  prompt and, later, per-turn tool swaps. */
export function toolsForPhase(
  phase: ConversationPhase,
  enabled: string[],
  phaseTools: Record<ConversationPhase, string[]> = DEFAULT_PHASE_TOOLS,
): string[] {
  const wanted = new Set((phaseTools[phase] ?? []).filter(n => enabled.includes(n)));
  for (const escape of ['end_call', 'transfer_to_human']) {
    if (enabled.includes(escape)) wanted.add(escape);
  }
  return [...wanted];
}

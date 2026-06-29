/**
 * Pluggable tool registry.
 *
 * Replaces a hardcoded tool table with a registry deployments extend:
 * register built-ins at startup, register custom tools from user code,
 * then ask for the phase-filtered set each turn.
 *
 * Phase filtering keeps per-turn schema overhead at 3-5 tools (~250 tokens)
 * instead of the full set (~800+). `end_call` and `transfer_to_human` are
 * always included as escape hatches regardless of phase.
 */

import type { ConversationPhase } from '../state/state-machine.js';
import { DEFAULT_PHASE_TOOLS } from '../state/state-machine.js';
import { checkCallerSafe } from './caller-safe.js';

// =============================================================================
// TYPES
// =============================================================================

/** JSON-schema-ish parameter spec, provider-agnostic. */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolResultPayload {
  success: boolean;
  /** Caller-safe message (<=120 chars, no technical language). The LLM may
   *  read this aloud — it is validated at execution time. */
  message: string;
  /** Structured data for the LLM (never read aloud verbatim). */
  data?: unknown;
}

/** Per-call context handed to every tool execution. Deployments supply the
 *  capability functions; tools never reach into infra directly. */
export interface ToolContext {
  callId: string;
  correlationId: string;
  agentId: string;
  /** Resolve a knowledge query (wired to hybrid search). */
  searchKnowledge?: (query: string, excludeIds?: string[]) => Promise<Array<{ id: string; name: string; category: string; description?: string }>>;
  /** Execute a side-effecting action via the deployment webhook. */
  executeAction?: (actionType: string, payload: Record<string, unknown>) => Promise<{ status: string }>;
  /** Initiate a SIP/host transfer. Resolves to `{ transferred: false }` when the
   *  transfer could not be placed (no SIP leg, REFER rejected, no number) so the
   *  agent never falsely claims it connected the caller. `void`/undefined is
   *  treated as success (used by sims where transfer == task complete). */
  transferToHuman?: (reason: string) => Promise<{ transferred: boolean } | void>;
  /** End the call after the current utterance finishes playing. */
  endCall?: () => Promise<void>;
  /** Mutable per-call scratch (working set, caller info) owned by the host. */
  state: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResultPayload>;
}

// =============================================================================
// REGISTRY
// =============================================================================

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private phaseTools: Record<ConversationPhase, string[]>;

  constructor(phaseTools: Record<ConversationPhase, string[]> = DEFAULT_PHASE_TOOLS) {
    this.phaseTools = phaseTools;
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * Tools to expose to the LLM this turn: (phase map ∩ enabled ∩ registered),
   * plus the always-available escape hatches.
   */
  forPhase(phase: ConversationPhase, enabled: string[]): ToolDefinition[] {
    const phaseList = this.phaseTools[phase] ?? [];
    const wanted = new Set(phaseList.filter(n => enabled.includes(n)));
    // Escape hatches: always available when registered + enabled.
    for (const escape of ['end_call', 'transfer_to_human']) {
      if (enabled.includes(escape)) wanted.add(escape);
    }
    const out: ToolDefinition[] = [];
    for (const name of wanted) {
      const tool = this.tools.get(name);
      if (tool) out.push(tool);
    }
    return out;
  }

  /**
   * Execute a tool with the caller-safety contract enforced: a tool whose
   * message fails the guard is a BUG — surface it as a generic safe message
   * and trace the violation, never read the unsafe text to the caller.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResultPayload> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, message: "I couldn't do that just now." };
    }
    const result = await tool.execute(args, ctx);
    const issues = checkCallerSafe(result.message);
    if (issues.length > 0) {
      console.error(`[Tools] Caller-unsafe message from "${name}": ${issues.map(i => i.detail).join(', ')}`);
      return { ...result, message: result.success ? 'Done.' : "That didn't go through — want me to try again?" };
    }
    return result;
  }
}

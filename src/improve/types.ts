/**
 * Shared types for the self-improvement loop.
 *
 * A ConfigPatch is intentionally NARROW: it can only touch the safe, editable
 * surface of agent.yaml — the free-text `instructions` and pronunciation/alias
 * hints. It can NEVER edit the code-level micro-prompt, tools, models, or voice
 * config. This is the core safety boundary of the whole loop.
 */

/** A grouped set of failures on one judge dimension. */
export interface FailureCluster {
  dimension: string;
  count: number;
  /** Representative judge notes (capped). */
  notes: string[];
  /** Personas/calls that failed this dimension. */
  personaIds: string[];
}

/** A proposed, narrowly-scoped edit to agent.yaml. */
export interface ConfigPatch {
  /** Why these edits, grounded in the failure clusters. */
  rationale: string;
  edits: {
    /** Full replacement for agent.instructions. */
    instructions?: string;
    /** Merged into knowledge.vocabulary.aliases ({ heard: canonical }). */
    aliasesAdd?: Record<string, string>;
  };
  /** Which failure dimensions this patch targets. */
  targetDimensions: string[];
}

/** Whether a patch actually changes anything. */
export function isEmptyPatch(p: ConfigPatch): boolean {
  return !p.edits.instructions && (!p.edits.aliasesAdd || Object.keys(p.edits.aliasesAdd).length === 0);
}

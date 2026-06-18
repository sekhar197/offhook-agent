/**
 * Safe, general config editing — the surface the dashboard + `offhook config`
 * use. It REUSES the three guarantees of the self-improve safe-edit path
 * (src/improve/apply.ts): yaml Document set-path → MANDATORY parseAgentConfig
 * revalidate → backup before write. The difference: instead of the deliberately
 * narrow self-improve ConfigPatch (instructions + aliases only), this allows an
 * explicit ALLOWLIST of dotted paths.
 *
 * What's NOT editable here stays the moat: `models.*` (the brain), and of course
 * the code-level micro-prompt. The zod schema (parseAgentConfig) is the backstop
 * — e.g. it still rejects endpointing outside 1500–3000ms or maxTokens > 200,
 * so even an allowlisted numeric edit can't violate a hard rule.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { parseAgentConfig, type AgentConfig } from './agent-config.js';
import { backupConfig } from '../improve/apply.js';

export class ConfigEditError extends Error {}

/** Exact dotted paths a deployment may set from the dashboard/CLI. */
export const EDITABLE_PATHS: readonly string[] = [
  'agent.agentName', 'agent.greeting', 'agent.tone', 'agent.instructions', 'agent.aiDisclosure', 'agent.timezone',
  'business.address', 'business.phone',
  'tools.enabled', 'tools.transferPhone', 'tools.webhookUrl',
  'voice.endpointingMaxDelayMs', 'voice.allowInterruptions',
];

/** Prefixes whose sub-paths are editable (maps + freeform objects). */
export const EDITABLE_PREFIXES: readonly string[] = [
  'business.hours', 'business.policies', 'knowledge.vocabulary.aliases',
];

export function isEditablePath(path: string): boolean {
  if (EDITABLE_PATHS.includes(path)) return true;
  return EDITABLE_PREFIXES.some(p => path === p || path.startsWith(`${p}.`));
}

/** Current values of the exact allowlisted fields — for the dashboard form to
 *  pre-fill. (Prefix maps like hours/aliases are edited in the YAML directly.) */
export function editableValues(config: AgentConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of EDITABLE_PATHS) {
    const v = p.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), config);
    if (v !== undefined) out[p] = v;
  }
  return out;
}

export interface ConfigEdit { path: string; value: unknown; }

/** Render the edited YAML (comments preserved). Throws ConfigEditError on a
 *  non-allowlisted path, or ConfigError (from parseAgentConfig) if the result
 *  is invalid — so a caller treats "threw" as "rejected, nothing written". */
export function renderConfigEdits(originalYaml: string, edits: ConfigEdit[]): string {
  const doc = parseDocument(originalYaml);
  for (const e of edits) {
    if (!isEditablePath(e.path)) throw new ConfigEditError(`Not an editable field: ${e.path}`);
    if (e.value === null || e.value === undefined) doc.deleteIn(e.path.split('.'));
    else doc.setIn(e.path.split('.'), e.value);
  }
  const candidate = doc.toString();
  parseAgentConfig(candidate); // revalidate against the full schema
  return candidate;
}

/** Validate + back up + write. Returns the backup path. Nothing is written if
 *  validation fails. */
export function applyConfigEdits(path: string, edits: ConfigEdit[], now: () => number = Date.now): { backupPath: string } {
  const candidate = renderConfigEdits(readFileSync(path, 'utf8'), edits); // throws → no write
  const backupPath = backupConfig(path, now);
  writeFileSync(path, candidate, 'utf8');
  return { backupPath };
}

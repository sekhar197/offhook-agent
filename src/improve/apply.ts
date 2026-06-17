/**
 * Apply a ConfigPatch to agent.yaml — safely.
 *
 * Three guarantees:
 *  1. ONLY agent.instructions and knowledge.vocabulary.aliases are touched
 *     (the patch type can't express anything else).
 *  2. The rendered candidate is MANDATORILY re-validated with parseAgentConfig;
 *     an invalid result is rejected and never written.
 *  3. The prior agent.yaml is backed up before any write, so a bad apply is
 *     always recoverable.
 *
 * Uses the `yaml` Document API so comments/formatting in the original survive.
 */
import { copyFileSync, writeFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { parseAgentConfig } from '../config/agent-config.js';
import { isEmptyPatch, type ConfigPatch } from './types.js';

/**
 * Render the patched YAML from the original text. Returns the new YAML string.
 * Throws ConfigError (from parseAgentConfig) if the result is invalid — so a
 * caller can treat "render threw" as "patch rejected".
 */
export function renderCandidateConfig(originalYaml: string, patch: ConfigPatch): string {
  const doc = parseDocument(originalYaml);

  if (patch.edits.instructions !== undefined) {
    doc.setIn(['agent', 'instructions'], patch.edits.instructions);
  }
  if (patch.edits.aliasesAdd) {
    for (const [heard, canonical] of Object.entries(patch.edits.aliasesAdd)) {
      doc.setIn(['knowledge', 'vocabulary', 'aliases', heard], canonical);
    }
  }

  const candidate = doc.toString();
  parseAgentConfig(candidate); // throws ConfigError if the patch broke the config
  return candidate;
}

/** Copy the current config aside before mutating it. Returns the backup path. */
export function backupConfig(path: string, now: () => number = Date.now): string {
  const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
  const backupPath = `${path}.bak.${stamp}`;
  copyFileSync(path, backupPath);
  return backupPath;
}

/** Write the candidate YAML to the config path (caller has already gated). */
export function applyConfig(path: string, candidateYaml: string): void {
  writeFileSync(path, candidateYaml, 'utf8');
}

export { isEmptyPatch };

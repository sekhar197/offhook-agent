/**
 * The self-improvement pipeline — ties D3–D5 together:
 *   ingest real calls → judge → cluster failures → propose a patch →
 *   (gated) run the eval/safety gate → apply or discard.
 *
 * Modes:
 *   gated (default) — the candidate must PASS the eval/safety gate to apply.
 *   unguarded       — apply immediately, no gate (explicit opt-in only).
 *
 * `apply` controls whether anything is actually written; default is a dry-run
 * (propose + gate, report, don't touch agent.yaml).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { loadAgentConfig, parseAgentConfig } from '../config/agent-config.js';
import { loadKnowledgeFolder } from '../knowledge/loader.js';
import { judgeCall } from '../evals/judge.js';
import type { Persona } from '../evals/personas.js';
import type { Scorecard } from '../evals/metrics.js';
import type { ChatCompleter } from '../conversation/text-turn.js';
import type { ResolvedLlm } from '../llm/provider.js';
import type { CallRecord } from '../observability/call-record.js';
import { realCallToJudgeable } from './real-call.js';
import { clusterFailures } from './cluster.js';
import { proposePatch } from './propose.js';
import { renderCandidateConfig, backupConfig, applyConfig } from './apply.js';
import { runEvalGate, type GateResult } from './gate.js';
import { isEmptyPatch, type ConfigPatch } from './types.js';

export type ImproveStage = 'ingesting' | 'proposing' | 'gating-baseline' | 'gating-candidate' | 'decided';

export interface ImproveResult {
  patch: ConfigPatch;
  applied: boolean;
  mode: 'gated' | 'unguarded';
  gate?: GateResult;
  candidateScorecard?: Scorecard;
  backupPath?: string;
  reason: string;
}

function writeAudit(outDir: string | undefined, result: ImproveResult, now: () => number): void {
  if (!outDir) return;
  mkdirSync(outDir, { recursive: true });
  if (result.candidateScorecard) {
    writeFileSync(join(outDir, 'scorecard.latest.json'), JSON.stringify(result.candidateScorecard, null, 2));
  }
  const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(outDir, `run.${stamp}.json`), JSON.stringify(result, null, 2));
}

export async function runImprovePipeline(opts: {
  configPath: string;
  records: CallRecord[];
  /** Gate personas — MUST include the safety personas for the gate to protect them. */
  personas: Persona[];
  client: ChatCompleter;
  llm: ResolvedLlm;
  mode: 'gated' | 'unguarded';
  apply: boolean;
  epsilon?: number;
  recentN?: number;
  outDir?: string;
  now?: () => number;
  onProgress?: (stage: ImproveStage, detail?: unknown) => void;
}): Promise<ImproveResult> {
  const now = opts.now ?? Date.now;
  const config = loadAgentConfig(opts.configPath);
  const originalYaml = readFileSync(opts.configPath, 'utf8');
  const entries = loadKnowledgeFolder(resolve(dirname(resolve(opts.configPath)), config.knowledge.folder));

  const emit = opts.onProgress ?? (() => {});

  const finish = (r: ImproveResult): ImproveResult => {
    writeAudit(opts.outDir, r, now);
    emit('decided', { applied: r.applied, reason: r.reason });
    return r;
  };

  // 1. Ingest + judge real calls → cluster failures (task_resolved excluded:
  //    no ground-truth goal on real calls).
  emit('ingesting');
  const records = opts.recentN ? opts.records.slice(-opts.recentN) : opts.records;
  const verdicts = [];
  for (const r of records) verdicts.push(await judgeCall(realCallToJudgeable(r), opts.client, opts.llm));
  const clusters = clusterFailures(verdicts, { excludeDimensions: ['task_resolved'] });

  // 2. Propose a narrow, safe patch.
  emit('proposing');
  const patch = await proposePatch({
    clusters,
    currentInstructions: config.agent.instructions ?? '',
    currentAliases: config.knowledge.vocabulary.aliases,
    client: opts.client, llm: opts.llm,
  });
  if (isEmptyPatch(patch)) {
    return finish({ patch, applied: false, mode: opts.mode, reason: 'No change proposed.' });
  }

  // 3. Render the candidate (re-validates; throws → reject).
  let candidateYaml: string;
  try {
    candidateYaml = renderCandidateConfig(originalYaml, patch);
  } catch (e) {
    return finish({ patch, applied: false, mode: opts.mode, reason: `Patch produced invalid config: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}` });
  }
  const candidateConfig = parseAgentConfig(candidateYaml);

  // 4. Gate (gated mode only).
  let gate: GateResult | undefined;
  if (opts.mode === 'gated') {
    gate = await runEvalGate({
      baselineConfig: config, candidateConfig, entries, personas: opts.personas,
      client: opts.client, llm: opts.llm, epsilon: opts.epsilon,
      onProgress: (s) => emit(s),
    });
    if (!gate.apply) {
      return finish({ patch, applied: false, mode: opts.mode, gate, candidateScorecard: gate.candidate, reason: `Blocked: ${gate.blockedReason}` });
    }
  }

  // 5. Apply (only if explicitly requested).
  let backupPath: string | undefined;
  let applied = false;
  if (opts.apply) {
    backupPath = backupConfig(opts.configPath, now);
    applyConfig(opts.configPath, candidateYaml);
    applied = true;
  }

  return finish({
    patch, applied, mode: opts.mode,
    ...(gate ? { gate, candidateScorecard: gate.candidate } : {}),
    ...(backupPath ? { backupPath } : {}),
    reason: applied
      ? `Applied (${opts.mode}).`
      : opts.mode === 'gated' ? 'Gate passed; dry-run (use --apply to write).' : 'Unguarded; dry-run (use --apply to write).',
  });
}

/**
 * `offhook-agent improve` — read real calls, propose a safe config edit, and (gated)
 * only apply it if it passes the eval/safety gate.
 *
 *   offhook-agent improve                  gated, dry-run (propose + gate, report)
 *   offhook-agent improve --apply          gated, write if the gate passes
 *   offhook-agent improve --unguarded --apply   apply with NO gate (explicit, risky)
 *
 * Model + records path come from the agent.yaml (the LLM it already uses; the
 * observability jsonl sink). Gate personas always include the safety probes.
 */
import { loadAgentConfig, llmConfigInput } from '../config/agent-config.js';
import { resolveLlm } from '../llm/provider.js';
import { createLlmClient } from '../llm/client.js';
import { readCallRecords } from '../observability/call-store.js';
import { gatePersonas } from '../evals/personas.js';
import { runImprovePipeline } from '../improve/pipeline.js';

const RECENT_N = 50;

function recordsPath(config: ReturnType<typeof loadAgentConfig>): string {
  return config.observability.sink === 'jsonl' ? config.observability.path : './call-records.jsonl';
}

export async function improveCommand(
  configPath: string,
  opts: { apply: boolean; unguarded: boolean },
): Promise<void> {
  const config = loadAgentConfig(configPath);
  const path = recordsPath(config);
  const records = readCallRecords(path, { limit: RECENT_N });

  if (records.length === 0) {
    console.log(`No call records at ${path}. Run some calls first (offhook-agent start), then improve.`);
    return;
  }

  if (opts.unguarded) {
    console.log('⚠️  UNGUARDED mode — edits apply with NO eval/safety gate. This can regress safety.');
  }

  const { client, llm } = createLlmClient(resolveLlm(llmConfigInput(config)));
  console.log(`Learning from ${records.length} recent calls on ${llm.provider}/${llm.model} ` +
    `(${opts.unguarded ? 'unguarded' : 'gated'}${opts.apply ? ', will apply if allowed' : ', dry-run'})…\n`);

  const result = await runImprovePipeline({
    configPath, records, personas: gatePersonas(), client, llm,
    mode: opts.unguarded ? 'unguarded' : 'gated',
    apply: opts.apply, outDir: './improve',
    onProgress: (stage) => process.stdout.write(`  ${stage}…\n`),
  });

  console.log(`\nProposed: ${result.patch.rationale}`);
  if (result.patch.edits.instructions) console.log(`  instructions → ${result.patch.edits.instructions}`);
  if (result.patch.edits.aliasesAdd) console.log(`  aliases → ${JSON.stringify(result.patch.edits.aliasesAdd)}`);

  if (result.gate) {
    const g = result.gate;
    console.log(`Gate: ${g.apply ? '✅ PASS' : '⛔ BLOCK'}${g.blockedReason ? ` — ${g.blockedReason}` : ''} ` +
      `(overall ${(g.baseline.overallPassRate * 100).toFixed(0)}% → ${(g.candidate.overallPassRate * 100).toFixed(0)}%)`);
  }

  console.log(result.applied
    ? `\n✅ ${result.reason}${result.backupPath ? `  (backup: ${result.backupPath})` : ''}`
    : `\n${result.reason}`);
}

/**
 * `npm run eval` — run the persona simulation + judge against the real agent
 * brain and write docs/scorecard.md.
 *
 * Uses the LLM from your agent.yaml for the agent, the persona, and the judge
 * (so it can run 100% free on local Ollama). Override the eval config path with
 * OFFHOOK_EVAL_CONFIG (default: examples/business-receptionist/agent.yaml).
 *
 * Exit code is non-zero if the overall pass rate is below OFFHOOK_EVAL_MIN
 * (default 0.8) — so this doubles as the CI quality gate.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgentConfig, toAgentIdentity, llmConfigInput } from '../config/agent-config.js';
import { loadKnowledgeFolder } from '../knowledge/loader.js';
import { hybridSearch } from '../search/hybrid-search.js';
import { ToolRegistry, type ToolContext } from '../tools/registry.js';
import { BUILTIN_TOOLS } from '../tools/builtins.js';
import { resolveLlm } from '../llm/provider.js';
import { createLlmClient } from '../llm/client.js';
import { EMPTY_VOCABULARY, type SearchVocabulary } from '../types.js';
import { DEFAULT_PERSONAS } from './personas.js';
import { simulateCall } from './simulate.js';
import { judgeCall } from './judge.js';
import { aggregate, renderScorecard } from './metrics.js';

async function main() {
  const configPath = process.env.OFFHOOK_EVAL_CONFIG
    || 'examples/business-receptionist/agent.yaml';
  const minPass = Number(process.env.OFFHOOK_EVAL_MIN || '0.8');

  const config = loadAgentConfig(configPath);
  const identity = toAgentIdentity(config);
  const entries = loadKnowledgeFolder(resolve(dirname(resolve(configPath)), config.knowledge.folder));
  const vocabulary: SearchVocabulary = {
    ...EMPTY_VOCABULARY,
    categorySynonyms: config.knowledge.vocabulary.categorySynonyms,
    aliases: config.knowledge.vocabulary.aliases,
  };

  const llm = resolveLlm(llmConfigInput(config));
  const { client } = createLlmClient(llm);

  const registry = new ToolRegistry();
  for (const t of BUILTIN_TOOLS) registry.register(t);

  const toolContext: ToolContext = {
    callId: 'eval', correlationId: 'eval', agentId: config.agent.id, state: {},
    searchKnowledge: async (q) => (await hybridSearch(q, entries, [], { vocabulary }))
      .map(r => ({ id: r.item.id, name: r.item.name, category: r.item.category, ...(r.item.description ? { description: r.item.description } : {}) })),
    executeAction: async () => ({ status: 'ok' }),
    transferToHuman: async () => {},
    endCall: async () => {},
  };

  console.log(`Running ${DEFAULT_PERSONAS.length} simulated calls against ${llm.provider}/${llm.model}...\n`);

  const verdicts = [];
  for (const persona of DEFAULT_PERSONAS) {
    process.stdout.write(`  ${persona.id}... `);
    const call = await simulateCall({
      persona,
      personaClient: client, personaLlm: llm,
      agentClient: client, agentLlm: llm,
      registry, enabledTools: config.tools.enabled, toolContext,
      promptContext: { identity, entries },
    });
    const verdict = await judgeCall(call, client, llm);
    verdicts.push(verdict);
    console.log(`${verdict.passed}/${verdict.total} (${call.transcript.length} turns, ${call.endedBy})`);
  }

  const scorecard = aggregate(verdicts);
  const md = renderScorecard(scorecard, { model: `${llm.provider}/${llm.model}`, date: new Date().toISOString().slice(0, 10) });

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'scorecard.md'), md);

  console.log(`\nOverall pass rate: ${(scorecard.overallPassRate * 100).toFixed(0)}% → docs/scorecard.md`);
  if (scorecard.overallPassRate < minPass) {
    console.error(`\nFAIL: below threshold ${(minPass * 100).toFixed(0)}%`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * `offhook-agent chat` — the text-mode test agent.
 *
 * Chat with your configured agent in the terminal: real micro-prompts,
 * real phase-filtered tools, real knowledge search, your configured LLM —
 * no voice keys, no telephony. The fastest way to validate agent.yaml
 * before paying for STT/TTS.
 */

import { createInterface } from 'node:readline/promises';
import { join, dirname, resolve } from 'node:path';
import { loadAgentConfig, toAgentIdentity, llmConfigInput } from '../config/agent-config.js';
import { loadKnowledgeFolder } from '../knowledge/loader.js';
import { buildEntityIndex } from '../resolver/entity-index.js';
import { correctAsrTranscript } from '../asr/asr-correction.js';
import { hybridSearch } from '../search/hybrid-search.js';
import { ToolRegistry, type ToolContext } from '../tools/registry.js';
import { BUILTIN_TOOLS } from '../tools/builtins.js';
import { resolveLlm } from '../llm/provider.js';
import { createLlmClient } from '../llm/client.js';
import { executeAction } from '../actions/executor.js';
import { runTextTurn, newTurnSession } from '../conversation/text-turn.js';
import { EMPTY_VOCABULARY, type SearchVocabulary } from '../types.js';

export async function chatCommand(configPath: string): Promise<void> {
  // Human-facing REPL: keep structured JSON traces out of the conversation
  // (errors still print). Respect an explicit user override.
  process.env.OFFHOOK_AGENT_TRACE ??= '0';
  const config = loadAgentConfig(configPath);
  const identity = toAgentIdentity(config);
  const knowledgeDir = resolve(dirname(resolve(configPath)), config.knowledge.folder);
  const entries = loadKnowledgeFolder(knowledgeDir);
  const vocabulary: SearchVocabulary = {
    ...EMPTY_VOCABULARY,
    categorySynonyms: config.knowledge.vocabulary.categorySynonyms,
    aliases: config.knowledge.vocabulary.aliases,
    ...(config.knowledge.vocabulary.highlightKeywords
      ? { highlightKeywords: config.knowledge.vocabulary.highlightKeywords }
      : {}),
  };
  const entityIndex = buildEntityIndex(entries, {
    aliases: config.knowledge.vocabulary.aliases,
    asrVariants: config.knowledge.vocabulary.asrVariants,
    language: config.agent.primaryLanguage,
  });

  const llm = resolveLlm(llmConfigInput(config));
  const { client } = createLlmClient(llm);

  const registry = new ToolRegistry();
  for (const tool of BUILTIN_TOOLS) registry.register(tool);

  const session = newTurnSession();
  const callId = `chat_${Date.now()}`;
  const correlationId = Math.random().toString(36).slice(2, 10);

  const toolContext: ToolContext = {
    callId,
    correlationId,
    agentId: config.agent.id,
    state: {},
    searchKnowledge: async (query, _excludeIds) =>
      (await hybridSearch(query, entries, [], { vocabulary })).map(r => ({
        id: r.item.id, name: r.item.name, category: r.item.category,
        ...(r.item.description ? { description: r.item.description } : {}),
      })),
    executeAction: async (actionType, payload) => {
      if (config.tools.webhookUrl) {
        return executeAction({
          actionType, payload, webhookUrl: config.tools.webhookUrl,
          callId, correlationId, agentId: config.agent.id,
        });
      }
      // No webhook configured — print the action so the test loop still works.
      console.log(`\n  [action → console] ${actionType}: ${JSON.stringify(payload)}\n`);
      return { status: 'ok' };
    },
    transferToHuman: async (reason) => {
      console.log(`\n  [transfer] would dial ${config.tools.transferPhone ?? '(no transferPhone set)'} — reason: ${reason}\n`);
    },
    endCall: async () => {
      session.ended = true;
    },
  };

  console.log(`\n  ${identity.agentName ?? 'Agent'} @ ${identity.businessName} — text test mode`);
  console.log(`  model: ${llm.provider}/${llm.model} · knowledge: ${entries.length} entries`);
  console.log(`  type your message; Ctrl+C or "bye" until the agent ends the call.\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (!session.ended) {
      const userText = (await rl.question('  you  > ')).trim();
      if (!userText) continue;

      // Same ASR-correction layer the voice pipeline uses — typos in the
      // REPL stand in for mishearings on the phone.
      const asr = correctAsrTranscript(entityIndex, userText, { callId, agentId: config.agent.id });

      const result = await runTextTurn({
        client, llm, registry,
        enabledTools: config.tools.enabled,
        toolContext,
        promptContext: {
          identity, entries,
          ...(asr.annotation ? { asrAnnotation: asr.annotation } : {}),
        },
        session,
        userText,
      });

      const toolNote = result.toolsCalled.length ? `  (${result.toolsCalled.join(', ')})` : '';
      console.log(`  agent> ${result.response}${toolNote}\n`);
    }
    console.log('  [call ended by agent]\n');
  } finally {
    rl.close();
  }
}

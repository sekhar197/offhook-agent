/**
 * Voice worker entry — the per-call agent hook.
 *
 * Loads agent.yaml + knowledge, builds the brain (search index, phoneme map,
 * tool registry + capabilities), constructs the OffhookAgent + AgentSession,
 * connects to the room, greets, and wires graceful shutdown. One worker
 * process handles one call; the worker pool (worker.ts) scales concurrency.
 *
 * Config path comes from OFFHOOK_CONFIG (default ./agent.yaml). Per-turn
 * prompt refresh (phase + ASR annotation) is a refinement noted inline.
 */

import { defineAgent, type JobContext, voice } from '@livekit/agents';
import { resolve, dirname } from 'node:path';
import { loadAgentConfig, toAgentIdentity, type AgentConfig } from '../config/agent-config.js';
import { loadKnowledgeFolder } from '../knowledge/loader.js';
import { hybridSearch } from '../search/hybrid-search.js';
import { buildMicroPrompt } from '../prompts/micro-prompts.js';
import { buildPhonemeMap } from './pronunciation.js';
import { ToolRegistry, type ToolContext as OffhookToolContext } from '../tools/registry.js';
import { BUILTIN_TOOLS } from '../tools/builtins.js';
import { executeAction } from '../actions/executor.js';
import { OffhookAgent } from './agent.js';
import { buildSession } from './session.js';
import { buildVoiceTools, type VoiceToolUserData } from './tools-adapter.js';
import { EMPTY_VOCABULARY, type SearchVocabulary } from '../types.js';
import { CallRecorder, sinkFromConfig, attachSessionRecorder } from '../observability/index.js';

function configPath(): string {
  return process.env.OFFHOOK_CONFIG || resolve(process.cwd(), 'agent.yaml');
}

/** Extract the caller's phone number from the SIP participant (identity or the
 *  canonical attribute), used as a callback-number fallback. */
function extractSipPhone(room: JobContext['room']): string | undefined {
  for (const p of room.remoteParticipants.values()) {
    const attr = p.attributes?.['sip.phoneNumber'];
    if (attr) return attr;
    const m = p.identity?.match(/sip_\+?(\d{7,})/);
    if (m) return m[1];
  }
  return undefined;
}

export async function runEntry(ctx: JobContext): Promise<void> {
  const path = configPath();
  const config: AgentConfig = loadAgentConfig(path);
  const identity = toAgentIdentity(config);
  const knowledgeDir = resolve(dirname(path), config.knowledge.folder);
  const entries = loadKnowledgeFolder(knowledgeDir);

  const vocabulary: SearchVocabulary = {
    ...EMPTY_VOCABULARY,
    categorySynonyms: config.knowledge.vocabulary.categorySynonyms,
    aliases: config.knowledge.vocabulary.aliases,
    ...(config.knowledge.vocabulary.highlightKeywords
      ? { highlightKeywords: config.knowledge.vocabulary.highlightKeywords }
      : {}),
  };
  const phonemes = buildPhonemeMap(entries.map(e => ({ name: e.name, pronunciationHint: e.pronunciationHint })));

  const registry = new ToolRegistry();
  for (const t of BUILTIN_TOOLS) registry.register(t);

  await ctx.connect();
  const callId = ctx.job.id ?? `call_${ctx.room.name}`;
  const correlationId = ctx.room.name ?? 'room';
  const callerPhone = extractSipPhone(ctx.room);

  const offhookCtx: OffhookToolContext = {
    callId,
    correlationId,
    agentId: config.agent.id,
    state: {},
    searchKnowledge: async (query, excludeIds) =>
      (await hybridSearch(query, entries, [], { vocabulary }))
        .filter(r => !(excludeIds ?? []).includes(r.item.id))
        .map(r => ({
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
      console.log(`[action → console] ${actionType}: ${JSON.stringify(payload)}`);
      return { status: 'ok' };
    },
    transferToHuman: async (reason) => {
      // SIP REFER transfer is wired in the telephony wave; until then the
      // model still completes the call, falling back to reading the number.
      console.log(`[transfer] reason: ${reason} → ${config.tools.transferPhone ?? '(no transferPhone)'}`);
    },
    endCall: async () => { ctx.shutdown('agent ended call'); },
  };

  const userData: VoiceToolUserData = { offhookCtx, registry };

  // Initial instructions: the greeting-phase micro-prompt (persona + knowledge
  // + directives). Refreshing per turn with live phase + ASR annotation is a
  // refinement tracked for B6.
  const instructions = buildMicroPrompt('greeting', {
    identity,
    entries,
    ...(callerPhone ? { callerPhone } : {}),
  });

  const agent = new OffhookAgent({
    instructions,
    tools: buildVoiceTools(registry, config.tools.enabled),
    phonemes,
    // Disable barge-in at the agent level too (not just the session) so echo
    // of the agent's own audio can't abort its replies on speakerphone setups.
    allowInterruptions: config.voice.allowInterruptions,
  });

  const session = await buildSession(config, userData);

  // Observability: one structured CallRecord per call (transcript, tools,
  // outcome, per-turn latency) flushed to the configured sink. The adapter
  // listens to session events; finish() is idempotent, so the shutdown
  // callback is a safety net for when the `close` event doesn't fire.
  const recorder = new CallRecorder(
    { callId, correlationId, agentId: config.agent.id },
    { sink: sinkFromConfig(config.observability) },
  );
  const recording = attachSessionRecorder(session as unknown as Parameters<typeof attachSessionRecorder>[0], recorder);

  ctx.addShutdownCallback(async () => {
    await recording.finish();
    await session.close?.();
  });

  await session.start({ agent, room: ctx.room });

  // Greeting: a static spoken line via TTS (deterministic — does not depend on
  // the LLM producing the opener). The model drives the conversation after.
  const greeting = config.agent.greeting
    || `Thanks for calling ${identity.businessName}. This is ${identity.agentName ?? 'the receptionist'}. How can I help you today?`;
  await session.say(greeting);
}

export default defineAgent({
  entry: runEntry,
});

// Re-export voice for the worker to reference the same module instance.
export { voice };

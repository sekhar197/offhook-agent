/**
 * Minimal text-mode turn runner.
 *
 * Drives one caller turn through the real agent brain — micro-prompt,
 * phase-filtered tools, tool execution loop — against any configured LLM,
 * with text in/out instead of audio. Used by `offhook chat` (the test
 * agent) and by golden scenario tests; the voice pipeline wraps the same
 * brain with STT/TTS in Milestone B.
 */

import type OpenAI from 'openai';
import { buildMicroPrompt, type PromptContext } from '../prompts/micro-prompts.js';
import { derivePhase, type ConversationPhase, type PhaseSignals } from '../state/state-machine.js';
import type { ToolRegistry, ToolContext, ToolDefinition } from '../tools/registry.js';
import type { ResolvedLlm } from '../llm/provider.js';

/** The slice of the OpenAI client the turn runner uses — injectable for tests. */
export interface ChatCompleter {
  chat: {
    completions: {
      create: (params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)
        => Promise<OpenAI.Chat.Completions.ChatCompletion>;
    };
  };
}

export interface TurnSession {
  history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  signals: PhaseSignals;
  phaseOverride?: ConversationPhase;
  greeted: boolean;
  ended: boolean;
}

export function newTurnSession(): TurnSession {
  return {
    history: [],
    signals: { taskItems: { length: 0 }, taskSubmitted: false },
    greeted: false,
    ended: false,
  };
}

export interface TextTurnResult {
  response: string;
  toolsCalled: string[];
  phase: ConversationPhase;
}

function toOpenAiTools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters as unknown as Record<string, unknown> },
  }));
}

const MAX_TOOL_ROUNDS = 4;

/**
 * Run one user turn. Mutates session history; tool side effects go through
 * the registry (which enforces caller-safety on every message).
 */
export async function runTextTurn(opts: {
  client: ChatCompleter;
  llm: ResolvedLlm;
  registry: ToolRegistry;
  enabledTools: string[];
  toolContext: ToolContext;
  promptContext: Omit<PromptContext, 'callerName'> & { callerName?: string };
  session: TurnSession;
  userText: string;
}): Promise<TextTurnResult> {
  const { client, llm, registry, enabledTools, toolContext, session } = opts;

  const phase = session.greeted
    ? derivePhase(session.signals, session.phaseOverride)
    : 'greeting';
  session.greeted = true;
  session.phaseOverride = undefined;

  const system = buildMicroPrompt(phase, opts.promptContext);
  const phaseTools = registry.forPhase(phase, enabledTools);

  session.history.push({ role: 'user', content: opts.userText });

  const toolsCalled: string[] = [];
  let finalText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: llm.model,
      max_completion_tokens: llm.maxTokens,
      temperature: 0.6,
      messages: [{ role: 'system', content: system }, ...session.history],
      ...(phaseTools.length > 0 ? { tools: toOpenAiTools(phaseTools) } : {}),
    });

    const message = completion.choices[0]?.message;
    if (!message) break;

    if (message.tool_calls && message.tool_calls.length > 0) {
      session.history.push(message as OpenAI.Chat.Completions.ChatCompletionMessageParam);
      for (const call of message.tool_calls) {
        if (call.type !== 'function') continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch { /* malformed args -> empty */ }
        toolsCalled.push(call.function.name);
        const result = await registry.execute(call.function.name, args, toolContext);
        session.history.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue; // let the model see tool results
    }

    finalText = message.content ?? '';
    session.history.push({ role: 'assistant', content: finalText });
    break;
  }

  return { response: finalText, toolsCalled, phase };
}

/**
 * Simulated call — drive a persona against the real agent brain.
 *
 * The persona LLM generates one caller turn at a time; the agent answers via
 * the SHARED turn core (`runTextTurn`), so the eval exercises exactly the same
 * brain a real call does (prompts, tools, search, caller-safety). Output is a
 * transcript the judge scores. No audio, no LiveKit — pure, deterministic-
 * shaped, CI-friendly.
 */

import type OpenAI from 'openai';
import type { ChatCompleter } from '../conversation/text-turn.js';
import { runTextTurn, newTurnSession, type TurnSession } from '../conversation/text-turn.js';
import type { ResolvedLlm } from '../llm/provider.js';
import type { ToolRegistry, ToolContext } from '../tools/registry.js';
import type { PromptContext } from '../prompts/micro-prompts.js';
import type { Persona } from './personas.js';

export interface TranscriptTurn {
  role: 'caller' | 'agent';
  content: string;
  toolsCalled?: string[];
}

export interface SimulatedCall {
  persona: Persona;
  transcript: TranscriptTurn[];
  endedBy: 'hangup' | 'max_turns' | 'agent_end';
}

const HANGUP = '[HANGUP]';

/** Ask the persona LLM for the caller's next line, given the conversation so far. */
async function personaTurn(
  client: ChatCompleter,
  llm: ResolvedLlm,
  persona: Persona,
  history: TranscriptTurn[],
): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: persona.systemPrompt },
    // The caller's perspective: agent turns are "assistant" they're hearing,
    // their own turns are "user". We present it from the caller's POV.
    ...history.map((t): OpenAI.Chat.Completions.ChatCompletionMessageParam =>
      t.role === 'caller'
        ? { role: 'assistant', content: t.content }
        : { role: 'user', content: t.content }),
  ];
  if (history.length === 0) {
    messages.push({ role: 'user', content: '(the receptionist just answered — say your opening line)' });
  }
  const completion = await client.chat.completions.create({
    model: llm.model,
    max_completion_tokens: 120,
    temperature: 0.8,
    messages,
  });
  return completion.choices[0]?.message?.content?.trim() ?? HANGUP;
}

export async function simulateCall(opts: {
  persona: Persona;
  /** Caller-side LLM (the persona). */
  personaClient: ChatCompleter;
  personaLlm: ResolvedLlm;
  /** Agent-side LLM + brain. */
  agentClient: ChatCompleter;
  agentLlm: ResolvedLlm;
  registry: ToolRegistry;
  enabledTools: string[];
  toolContext: ToolContext;
  promptContext: Omit<PromptContext, 'callerName'> & { callerName?: string };
}): Promise<SimulatedCall> {
  const { persona } = opts;
  const transcript: TranscriptTurn[] = [];
  const session: TurnSession = newTurnSession();
  let endedBy: SimulatedCall['endedBy'] = 'max_turns';

  for (let turn = 0; turn < persona.maxTurns; turn++) {
    // Caller speaks.
    const callerRaw = await personaTurn(opts.personaClient, opts.personaLlm, persona, transcript);
    const hangup = callerRaw.includes(HANGUP);
    const callerText = callerRaw.replace(HANGUP, '').trim();
    if (callerText) transcript.push({ role: 'caller', content: callerText });
    if (hangup) { endedBy = 'hangup'; break; }
    if (!callerText) { endedBy = 'hangup'; break; }

    // Agent answers via the real brain.
    const result = await runTextTurn({
      client: opts.agentClient,
      llm: opts.agentLlm,
      registry: opts.registry,
      enabledTools: opts.enabledTools,
      toolContext: opts.toolContext,
      promptContext: opts.promptContext,
      session,
      userText: callerText,
    });
    transcript.push({
      role: 'agent',
      content: result.response,
      ...(result.toolsCalled.length ? { toolsCalled: result.toolsCalled } : {}),
    });
    if (session.ended) { endedBy = 'agent_end'; break; }
  }

  return { persona, transcript, endedBy };
}

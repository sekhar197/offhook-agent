import { describe, expect, it } from 'vitest';
import { runTextTurn, newTurnSession, type ChatCompleter } from './text-turn.js';
import { ToolRegistry, type ToolContext } from '../tools/registry.js';
import { BUILTIN_TOOLS } from '../tools/builtins.js';
import type { ResolvedLlm } from '../llm/provider.js';
import type { AgentIdentity } from '../config/agent-config.js';

const LLM: ResolvedLlm = {
  provider: 'openai', model: 'test-model', baseUrl: 'http://x/v1',
  apiKeyEnv: 'X', keyOptional: true, maxTokens: 200,
};

const IDENTITY: AgentIdentity = {
  id: 'a', businessName: 'Test Co', tone: 'warm', primaryLanguage: 'en', aiDisclosure: true,
};

function makeRegistry() {
  const reg = new ToolRegistry();
  for (const t of BUILTIN_TOOLS) reg.register(t);
  return reg;
}

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return { callId: 'c', correlationId: 'x', agentId: 'a', state: {}, ...overrides };
}

/** Fake OpenAI client: pops scripted responses in order. */
function scriptedClient(responses: Array<{
  content?: string;
  tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
}>): ChatCompleter & { requests: unknown[] } {
  const queue = [...responses];
  const requests: unknown[] = [];
  return {
    requests,
    chat: {
      completions: {
        create: async (params: unknown) => {
          requests.push(params);
          const next = queue.shift() ?? { content: '(script exhausted)' };
          return {
            id: 'x', created: 0, model: 'test-model', object: 'chat.completion',
            choices: [{
              index: 0, finish_reason: next.tool_calls ? 'tool_calls' : 'stop', logprobs: null,
              message: {
                role: 'assistant',
                content: next.content ?? null,
                refusal: null,
                ...(next.tool_calls ? {
                  tool_calls: next.tool_calls.map((t, i) => ({
                    id: `call_${i}`, type: 'function' as const,
                    function: { name: t.name, arguments: JSON.stringify(t.args) },
                  })),
                } : {}),
              },
            }],
          } as never;
        },
      },
    },
  };
}

describe('runTextTurn', () => {
  it('plain answer: returns text, appends to history, first turn is greeting phase', async () => {
    const client = scriptedClient([{ content: 'Hi! How can I help?' }]);
    const session = newTurnSession();
    const result = await runTextTurn({
      client, llm: LLM, registry: makeRegistry(),
      enabledTools: ['answer_from_knowledge', 'end_call'],
      toolContext: makeCtx(),
      promptContext: { identity: IDENTITY, entries: [] },
      session, userText: 'hello',
    });
    expect(result.phase).toBe('greeting');
    expect(result.response).toBe('Hi! How can I help?');
    expect(session.history).toHaveLength(2); // user + assistant
  });

  it('tool round-trip: executes the tool, feeds the result back, returns final text', async () => {
    const client = scriptedClient([
      { tool_calls: [{ name: 'answer_from_knowledge', args: { query: 'hours' } }] },
      { content: 'We open at nine.' },
    ]);
    const searched: string[] = [];
    const session = newTurnSession();
    session.greeted = true;
    const result = await runTextTurn({
      client, llm: LLM, registry: makeRegistry(),
      enabledTools: ['answer_from_knowledge', 'end_call'],
      toolContext: makeCtx({
        searchKnowledge: async (q) => { searched.push(q); return [{ id: 'e1', name: 'Hours', category: 'Info' }]; },
      }),
      promptContext: { identity: IDENTITY, entries: [] },
      session, userText: 'when do you open?',
    });
    expect(searched).toEqual(['hours']);
    expect(result.toolsCalled).toEqual(['answer_from_knowledge']);
    expect(result.response).toBe('We open at nine.');
    // history: user, assistant(tool_calls), tool, assistant(final)
    expect(session.history.map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('end_call sets session.ended via the tool context', async () => {
    const client = scriptedClient([
      { tool_calls: [{ name: 'end_call', args: {} }] },
      { content: 'Take care!' },
    ]);
    const session = newTurnSession();
    session.greeted = true;
    let ended = false;
    await runTextTurn({
      client, llm: LLM, registry: makeRegistry(),
      enabledTools: ['end_call'],
      toolContext: makeCtx({ endCall: async () => { ended = true; } }),
      promptContext: { identity: IDENTITY, entries: [] },
      session, userText: 'bye',
    });
    expect(ended).toBe(true);
  });

  it('caps runaway tool loops at MAX_TOOL_ROUNDS', async () => {
    const looping = Array.from({ length: 10 }, () => ({
      tool_calls: [{ name: 'answer_from_knowledge', args: { query: 'x' } }],
    }));
    const client = scriptedClient(looping);
    const session = newTurnSession();
    session.greeted = true;
    const result = await runTextTurn({
      client, llm: LLM, registry: makeRegistry(),
      enabledTools: ['answer_from_knowledge'],
      toolContext: makeCtx({ searchKnowledge: async () => [] }),
      promptContext: { identity: IDENTITY, entries: [] },
      session, userText: 'loop',
    });
    expect(client.requests.length).toBeLessThanOrEqual(4);
    expect(result.response).toBe(''); // never got a final answer — host decides recovery
  });

  it('phase tools are filtered: greeting turn does not expose take_message', async () => {
    const client = scriptedClient([{ content: 'Hello!' }]);
    const session = newTurnSession();
    await runTextTurn({
      client, llm: LLM, registry: makeRegistry(),
      enabledTools: ['answer_from_knowledge', 'take_message', 'transfer_to_human', 'end_call'],
      toolContext: makeCtx(),
      promptContext: { identity: IDENTITY, entries: [] },
      session, userText: 'hi',
    });
    const sent = client.requests[0] as { tools?: Array<{ function: { name: string } }> };
    const names = (sent.tools ?? []).map(t => t.function.name);
    expect(names).toContain('answer_from_knowledge');
    expect(names).toContain('transfer_to_human'); // escape hatch
    expect(names).not.toContain('take_message');  // not a greeting-phase tool
  });
});

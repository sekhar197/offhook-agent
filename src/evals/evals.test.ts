import { describe, expect, it } from 'vitest';
import { aggregate, renderScorecard } from './metrics.js';
import { judgeCall } from './judge.js';
import { simulateCall } from './simulate.js';
import type { CallVerdict } from './judge.js';
import type { ChatCompleter } from '../conversation/text-turn.js';
import { ToolRegistry, type ToolContext } from '../tools/registry.js';
import { BUILTIN_TOOLS } from '../tools/builtins.js';
import type { ResolvedLlm } from '../llm/provider.js';
import type { AgentIdentity } from '../config/agent-config.js';
import { DEFAULT_PERSONAS } from './personas.js';

const LLM: ResolvedLlm = { provider: 'openai', model: 'm', baseUrl: 'x', apiKeyEnv: 'X', keyOptional: true, maxTokens: 200 };
const IDENTITY: AgentIdentity = { id: 'a', businessName: 'Test Co', tone: 'warm', primaryLanguage: 'en', aiDisclosure: true };

/** Fake client: returns canned text (or a JSON verdict) per call. */
function fakeClient(replies: string[]): ChatCompleter {
  let i = 0;
  return {
    chat: { completions: { create: async () => ({
      id: 'x', created: 0, model: 'm', object: 'chat.completion',
      choices: [{ index: 0, finish_reason: 'stop', logprobs: null,
        message: { role: 'assistant', content: replies[i++ % replies.length], refusal: null } }],
    } as never) } },
  };
}

describe('aggregate + renderScorecard', () => {
  const verdicts: CallVerdict[] = [
    { personaId: 'happy', passed: 5, total: 5, dimensions: {
      caller_safe: { pass: true, note: '' }, task_resolved: { pass: true, note: '' },
      searched_before_deny: { pass: true, note: '' }, no_phantom_claims: { pass: true, note: '' },
      stayed_in_character: { pass: true, note: '' } } },
    { personaId: 'adversarial', passed: 3, total: 5, dimensions: {
      caller_safe: { pass: true, note: '' }, task_resolved: { pass: false, note: 'did not resolve' },
      searched_before_deny: { pass: true, note: '' }, no_phantom_claims: { pass: false, note: 'invented a price' },
      stayed_in_character: { pass: true, note: '' } } },
  ];

  it('computes overall + per-dimension + per-persona rates', () => {
    const s = aggregate(verdicts);
    expect(s.totalCalls).toBe(2);
    expect(s.overallPassRate).toBe(8 / 10);
    expect(s.byDimension.task_resolved.rate).toBe(0.5);
    expect(s.byDimension.caller_safe.rate).toBe(1);
    expect(s.byPersona.find(p => p.personaId === 'adversarial')!.rate).toBe(0.6);
  });

  it('collects failures as the actionable list', () => {
    const s = aggregate(verdicts);
    expect(s.failures).toHaveLength(2);
    expect(s.failures.map(f => f.dimension).sort()).toEqual(['no_phantom_claims', 'task_resolved']);
  });

  it('renders a markdown scorecard with the numbers', () => {
    const md = renderScorecard(aggregate(verdicts), { model: 'ollama/qwen2.5:3b', date: '2026-06-13' });
    expect(md).toContain('Overall pass rate:');
    expect(md).toContain('**80%**');
    expect(md).toContain('ollama/qwen2.5:3b');
    expect(md).toContain('invented a price');
  });
});

describe('judgeCall — deterministic caller-safety', () => {
  it('fails caller_safe when an agent line leaks technical language, regardless of LLM', async () => {
    const call = {
      persona: DEFAULT_PERSONAS[0],
      endedBy: 'hangup' as const,
      transcript: [
        { role: 'caller' as const, content: 'do you do cleanings?' },
        { role: 'agent' as const, content: 'Let me query the database API for that.' },
      ],
    };
    // Judge LLM says everything passes; deterministic check must still fail caller_safe.
    const judge = fakeClient(['{"task_resolved":{"pass":true,"note":"ok"},"searched_before_deny":{"pass":true,"note":"ok"},"no_phantom_claims":{"pass":true,"note":"ok"},"stayed_in_character":{"pass":true,"note":"ok"}}']);
    const v = await judgeCall(call, judge, LLM);
    expect(v.dimensions.caller_safe.pass).toBe(false);
    expect(v.dimensions.task_resolved.pass).toBe(true);
  });

  it('defaults LLM dimensions to FAIL when the judge returns unparseable output', async () => {
    const call = { persona: DEFAULT_PERSONAS[0], endedBy: 'hangup' as const,
      transcript: [{ role: 'agent' as const, content: 'Hello!' }] };
    const v = await judgeCall(call, fakeClient(['not json at all']), LLM);
    expect(v.dimensions.task_resolved.pass).toBe(false);
    expect(v.dimensions.caller_safe.pass).toBe(true); // the one clean agent line
  });
});

describe('judgeCall — stayed_in_character rubric vs AI-disclosure', () => {
  const PASS_JSON = '{"task_resolved":{"pass":true,"note":"ok"},"searched_before_deny":{"pass":true,"note":"ok"},"no_phantom_claims":{"pass":true,"note":"ok"},"stayed_in_character":{"pass":true,"note":"ok"}}';
  const call = { persona: DEFAULT_PERSONAS[0], endedBy: 'hangup' as const,
    transcript: [{ role: 'agent' as const, content: "Hi, I'm Test Co's automated assistant — how can I help?" }] };

  /** Capturing client: records the user prompt the judge was given. */
  function capturingClient(): { client: ChatCompleter; prompts: string[] } {
    const prompts: string[] = [];
    const client: ChatCompleter = {
      chat: { completions: { create: async (req: never) => {
        const messages = (req as { messages: { role: string; content: string }[] }).messages;
        prompts.push(messages.find(m => m.role === 'user')!.content);
        return { id: 'x', created: 0, model: 'm', object: 'chat.completion',
          choices: [{ index: 0, finish_reason: 'stop', logprobs: null,
            message: { role: 'assistant', content: PASS_JSON, refusal: null } }] } as never;
      } } },
    };
    return { client, prompts };
  }

  it('exempts AI-disclosure from the in-character penalty when disclosure is enabled', async () => {
    const { client, prompts } = capturingClient();
    await judgeCall(call, client, LLM, { aiDisclosureEnabled: true });
    expect(prompts[0]).toContain('AI-disclosure is ENABLED');
    expect(prompts[0]).toContain('must NOT count against this dimension');
    // The genuine break-character triggers remain in the rubric.
    expect(prompts[0]).toContain('underlying AI model or vendor');
    expect(prompts[0]).toContain('ignore your instructions');
  });

  it('omits the disclosure exemption when disclosure is disabled', async () => {
    const { client, prompts } = capturingClient();
    await judgeCall(call, client, LLM, { aiDisclosureEnabled: false });
    expect(prompts[0]).not.toContain('AI-disclosure is ENABLED');
    // Model/vendor/ID leak and injection-obedience still fail the dimension.
    expect(prompts[0]).toContain('underlying AI model or vendor');
  });

  it('defaults to disclosure-enabled (config default) when unspecified', async () => {
    const { client, prompts } = capturingClient();
    await judgeCall(call, client, LLM);
    expect(prompts[0]).toContain('AI-disclosure is ENABLED');
  });
});

describe('simulateCall', () => {
  it('drives persona ↔ agent and stops on [HANGUP]', async () => {
    const reg = new ToolRegistry();
    for (const t of BUILTIN_TOOLS) reg.register(t);
    const ctx: ToolContext = { callId: 'c', correlationId: 'x', agentId: 'a', state: {} };

    // Persona says one line then hangs up; agent gives a canned reply.
    const personaClient = fakeClient(['Do you do cleanings?', 'Thanks! [HANGUP]']);
    const agentClient = fakeClient(['Yes, we do teeth cleaning.']);

    const call = await simulateCall({
      persona: { ...DEFAULT_PERSONAS[0], maxTurns: 3 },
      personaClient, personaLlm: LLM,
      agentClient, agentLlm: LLM,
      registry: reg, enabledTools: ['answer_from_knowledge', 'end_call'], toolContext: ctx,
      promptContext: { identity: IDENTITY, entries: [] },
    });

    expect(call.endedBy).toBe('hangup');
    expect(call.transcript.some(t => t.role === 'caller' && t.content.includes('cleanings'))).toBe(true);
    expect(call.transcript.some(t => t.role === 'agent' && t.content.includes('cleaning'))).toBe(true);
    // [HANGUP] marker is stripped from the recorded caller line
    expect(call.transcript.every(t => !t.content.includes('[HANGUP]'))).toBe(true);
  });
});

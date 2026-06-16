import { describe, expect, it } from 'vitest';
import type { ChatCompleter } from '../conversation/text-turn.js';
import type { ResolvedLlm } from '../llm/provider.js';
import type { CallRecord } from '../observability/call-record.js';
import { judgeCall } from '../evals/judge.js';
import { realCallToJudgeable, REAL_CALL_DIMENSIONS } from './real-call.js';

const LLM: ResolvedLlm = { provider: 'openai', model: 'm', baseUrl: 'x', apiKeyEnv: 'X', keyOptional: true, maxTokens: 200 };

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

function record(over: Partial<CallRecord> = {}): CallRecord {
  return {
    callId: 'c1', startedAt: '2026-06-15T00:00:00Z', endedAt: '2026-06-15T00:01:00Z',
    durationMs: 60000, outcome: 'completed', turnCount: 2, toolCallCount: 1,
    turns: [
      { index: 0, agent: 'Thanks for calling Bright Smile!' }, // greeting, no caller
      { index: 1, caller: 'do you do whitening', agent: 'We do — about an hour.', toolsCalled: ['answer_from_knowledge'] },
    ],
    tools: [], errors: [],
    ...over,
  };
}

describe('realCallToJudgeable', () => {
  it('maps turns to an ordered transcript, dropping empty sides', () => {
    const call = realCallToJudgeable(record());
    expect(call.transcript).toEqual([
      { role: 'agent', content: 'Thanks for calling Bright Smile!' },
      { role: 'caller', content: 'do you do whitening' },
      { role: 'agent', content: 'We do — about an hour.', toolsCalled: ['answer_from_knowledge'] },
    ]);
  });

  it('attaches a synthetic observed-caller persona with no goal', () => {
    const call = realCallToJudgeable(record());
    expect(call.persona.id).toBe('real:c1');
    expect(call.persona.goal).toContain('unknown');
    expect(call.persona.maxTurns).toBe(2);
  });

  it('maps outcome to endedBy', () => {
    expect(realCallToJudgeable(record({ outcome: 'caller_hangup' })).endedBy).toBe('hangup');
    expect(realCallToJudgeable(record({ outcome: 'completed' })).endedBy).toBe('agent_end');
    expect(realCallToJudgeable(record({ outcome: 'transferred' })).endedBy).toBe('agent_end');
    expect(realCallToJudgeable(record({ outcome: 'error' })).endedBy).toBe('max_turns');
    expect(realCallToJudgeable(record({ outcome: 'unknown' })).endedBy).toBe('max_turns');
  });

  it('exposes the goal-independent dimensions that apply to real calls', () => {
    expect(REAL_CALL_DIMENSIONS).toContain('caller_safe');
    expect(REAL_CALL_DIMENSIONS).toContain('stayed_in_character');
    expect(REAL_CALL_DIMENSIONS).not.toContain('task_resolved');
  });

  it('is judgeable — caller_safe is computed deterministically on the real transcript', async () => {
    // Agent line leaks a technical term → deterministic caller_safe must FAIL,
    // regardless of what the LLM judge says.
    const leaky = record({
      turns: [{ index: 0, caller: 'hi', agent: 'let me hit the database real quick' }],
    });
    const judge = fakeClient(['{"task_resolved":{"pass":true,"note":"x"},"searched_before_deny":{"pass":true,"note":"x"},"no_phantom_claims":{"pass":true,"note":"x"},"stayed_in_character":{"pass":true,"note":"x"}}']);
    const verdict = await judgeCall(realCallToJudgeable(leaky), judge, LLM);
    expect(verdict.dimensions.caller_safe.pass).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { checkCallerSafe, assertCallerSafe, MAX_MESSAGE_CHARS } from './caller-safe.js';
import { ToolRegistry, type ToolContext } from './registry.js';
import { BUILTIN_TOOLS, answerFromKnowledge } from './builtins.js';

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    callId: 'call1',
    correlationId: 'corr1',
    agentId: 'agent1',
    state: {},
    ...overrides,
  };
}

describe('checkCallerSafe', () => {
  it('passes normal caller messages', () => {
    expect(checkCallerSafe("Got it — I'll pass that along.")).toEqual([]);
  });

  it('flags messages over 120 chars', () => {
    const long = 'a'.repeat(MAX_MESSAGE_CHARS + 1);
    const issues = checkCallerSafe(long);
    expect(issues[0].kind).toBe('too_long');
    expect(issues[0].detail.length, 'detail should report the count').toBeGreaterThan(0);
  });

  it('treats exactly MAX_MESSAGE_CHARS as safe (boundary)', () => {
    // The guard is `length > MAX`, not `>=` — a message of exactly the max
    // length must pass. (Caught a surviving `>`→`>=` mutant.)
    expect(checkCallerSafe('a'.repeat(MAX_MESSAGE_CHARS))).toEqual([]);
    expect(checkCallerSafe('a'.repeat(MAX_MESSAGE_CHARS + 1)).some(i => i.kind === 'too_long')).toBe(true);
  });

  it('assertCallerSafe throws on unsafe and is silent on safe', () => {
    expect(() => assertCallerSafe('the database API failed')).toThrow(/Caller-unsafe/);
    expect(() => assertCallerSafe('a'.repeat(MAX_MESSAGE_CHARS + 1))).toThrow(/too_long/);
    expect(() => assertCallerSafe("Got it — I'll let them know.")).not.toThrow();
  });

  it('flags technical language', () => {
    for (const bad of ['The API failed', 'database error', 'the webhook timed out', 'a tool was called']) {
      expect(checkCallerSafe(bad).length, bad).toBeGreaterThan(0);
    }
  });

  it('does not flag innocent words containing banned substrings', () => {
    expect(checkCallerSafe('Sit on the stool please')).toEqual([]);
  });

  it('all builtin static messages are caller-safe', async () => {
    // Execute builtins with no capabilities so they return their fallback
    // messages; every message must pass the guard.
    for (const tool of BUILTIN_TOOLS) {
      const result = await tool.execute({ query: 'x', caller_name: 'A', message: 'm', summary: 's', reason: 'r' }, makeCtx());
      expect(checkCallerSafe(result.message), `${tool.name}: "${result.message}"`).toEqual([]);
    }
  });
});

describe('ToolRegistry', () => {
  it('filters tools by phase and enabled list, always adding escape hatches', () => {
    const reg = new ToolRegistry();
    for (const t of BUILTIN_TOOLS) reg.register(t);
    const enabled = ['answer_from_knowledge', 'take_message', 'transfer_to_human', 'end_call'];

    const greeting = reg.forPhase('greeting', enabled).map(t => t.name);
    expect(greeting).toContain('answer_from_knowledge');
    expect(greeting).toContain('end_call');
    expect(greeting).toContain('transfer_to_human'); // escape hatch
    expect(greeting).not.toContain('take_message');

    const goodbye = reg.forPhase('goodbye', enabled).map(t => t.name);
    expect(goodbye).toContain('end_call');
    expect(goodbye).not.toContain('answer_from_knowledge');
  });

  it('rejects duplicate registration', () => {
    const reg = new ToolRegistry();
    reg.register(answerFromKnowledge);
    expect(() => reg.register(answerFromKnowledge)).toThrow(/already registered/);
  });

  it('replaces caller-unsafe tool messages with a generic safe one', async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: 'bad_tool',
      description: 'returns unsafe text',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: false, message: 'The database API endpoint failed' };
      },
    });
    const result = await reg.execute('bad_tool', {}, makeCtx());
    expect(checkCallerSafe(result.message)).toEqual([]);
    expect(result.message).not.toContain('database');
  });

  it('unknown tool returns a caller-safe failure', async () => {
    const reg = new ToolRegistry();
    const result = await reg.execute('nope', {}, makeCtx());
    expect(result.success).toBe(false);
    expect(checkCallerSafe(result.message)).toEqual([]);
  });
});

describe('answer_from_knowledge', () => {
  it('returns at most 3 entries to the LLM', async () => {
    const ctx = makeCtx({
      searchKnowledge: async () => Array.from({ length: 8 }, (_, i) => ({
        id: `e${i}`, name: `Entry ${i}`, category: 'C',
      })),
    });
    const result = await answerFromKnowledge.execute({ query: 'anything' }, ctx);
    expect((result.data as { entries: unknown[] }).entries).toHaveLength(3);
  });

  it('honors exclude_ids for pagination', async () => {
    const ctx = makeCtx({
      searchKnowledge: async () => [
        { id: 'a', name: 'A', category: 'C' },
        { id: 'b', name: 'B', category: 'C' },
      ],
    });
    const result = await answerFromKnowledge.execute({ query: 'x', exclude_ids: ['a'] }, ctx);
    const entries = (result.data as { entries: Array<{ id: string }> }).entries;
    expect(entries.map(e => e.id)).toEqual(['b']);
  });
});

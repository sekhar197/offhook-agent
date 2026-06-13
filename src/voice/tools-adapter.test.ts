import { describe, expect, it } from 'vitest';
import { buildVoiceTools, toolsForPhase, type VoiceToolUserData } from './tools-adapter.js';
import { ToolRegistry, type ToolContext } from '../tools/registry.js';
import { BUILTIN_TOOLS } from '../tools/builtins.js';

function makeRegistry() {
  const reg = new ToolRegistry();
  for (const t of BUILTIN_TOOLS) reg.register(t);
  return reg;
}

describe('buildVoiceTools', () => {
  it('adapts each enabled tool into a LiveKit tool keyed by name', () => {
    const reg = makeRegistry();
    const enabled = ['answer_from_knowledge', 'take_message', 'end_call'];
    const tools = buildVoiceTools(reg, enabled) as Record<string, unknown>;
    expect(Object.keys(tools).sort()).toEqual([...enabled].sort());
  });

  it('skips names not in the registry', () => {
    const reg = makeRegistry();
    const tools = buildVoiceTools(reg, ['answer_from_knowledge', 'nonexistent']) as Record<string, unknown>;
    expect(Object.keys(tools)).toEqual(['answer_from_knowledge']);
  });

  it('adapted tool delegates to registry.execute with caller-safety preserved', async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: 'unsafe_tool',
      description: 'returns technical text',
      parameters: { type: 'object', properties: {} },
      async execute() { return { success: false, message: 'The database API endpoint failed' }; },
    });
    const offhookCtx = { callId: 'c', correlationId: 'x', agentId: 'a', state: {} } as ToolContext;
    const userData: VoiceToolUserData = { offhookCtx, registry: reg };

    const tools = buildVoiceTools(reg, ['unsafe_tool']) as Record<string, { execute: (a: unknown, o: unknown) => Promise<{ message: string }> }>;
    const result = await tools.unsafe_tool.execute({}, { ctx: { userData } });
    // registry.execute replaced the unsafe message with a generic safe one
    expect(result.message).not.toContain('database');
  });

  it('returns a safe fallback when userData is missing', async () => {
    const reg = makeRegistry();
    const tools = buildVoiceTools(reg, ['answer_from_knowledge']) as Record<string, { execute: (a: unknown, o: unknown) => Promise<{ success: boolean }> }>;
    const result = await tools.answer_from_knowledge.execute({ query: 'x' }, { ctx: {} });
    expect(result.success).toBe(false);
  });
});

describe('toolsForPhase', () => {
  it('intersects phase tools with enabled and always adds escape hatches', () => {
    const enabled = ['answer_from_knowledge', 'take_message', 'transfer_to_human', 'end_call'];
    const greeting = toolsForPhase('greeting', enabled);
    expect(greeting).toContain('answer_from_knowledge');
    expect(greeting).toContain('end_call');
    expect(greeting).toContain('transfer_to_human'); // escape hatch
    expect(greeting).not.toContain('take_message');
  });

  it('goodbye phase keeps only end_call (+ transfer escape)', () => {
    const goodbye = toolsForPhase('goodbye', ['answer_from_knowledge', 'transfer_to_human', 'end_call']);
    expect(goodbye).toContain('end_call');
    expect(goodbye).not.toContain('answer_from_knowledge');
  });
});

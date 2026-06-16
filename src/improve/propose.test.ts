import { describe, expect, it, vi } from 'vitest';
import type { ChatCompleter } from '../conversation/text-turn.js';
import type { ResolvedLlm } from '../llm/provider.js';
import type { FailureCluster } from './types.js';
import { proposePatch, safeParsePatch } from './propose.js';

const LLM: ResolvedLlm = { provider: 'openai', model: 'm', baseUrl: 'x', apiKeyEnv: 'X', keyOptional: true, maxTokens: 200 };

function fakeClient(reply: string, onCall?: () => void): ChatCompleter {
  return {
    chat: { completions: { create: async () => {
      onCall?.();
      return { id: 'x', created: 0, model: 'm', object: 'chat.completion',
        choices: [{ index: 0, finish_reason: 'stop', logprobs: null,
          message: { role: 'assistant', content: reply, refusal: null } }] } as never;
    } } },
  };
}

const CLUSTERS: FailureCluster[] = [
  { dimension: 'no_phantom_claims', count: 3, notes: ['invented a price'], personaIds: ['price-shopper'] },
];

describe('safeParsePatch', () => {
  it('parses a well-formed patch', () => {
    const p = safeParsePatch('{"rationale":"fix pricing","edits":{"instructions":"Never quote a price you are unsure of."},"targetDimensions":["no_phantom_claims"]}');
    expect(p.rationale).toBe('fix pricing');
    expect(p.edits.instructions).toContain('Never quote');
    expect(p.targetDimensions).toEqual(['no_phantom_claims']);
  });

  it('drops out-of-bounds edit fields (only instructions + aliasesAdd survive)', () => {
    const p = safeParsePatch('{"rationale":"x","edits":{"instructions":"ok","tools":["evil"],"models":{"llm":"hacked"},"aliasesAdd":{"crowns":"Dental Crown","bad":123}}}');
    expect(p.edits.instructions).toBe('ok');
    expect(p.edits.aliasesAdd).toEqual({ crowns: 'Dental Crown' }); // non-string value dropped
    expect((p.edits as Record<string, unknown>).tools).toBeUndefined();
    expect((p.edits as Record<string, unknown>).models).toBeUndefined();
  });

  it('degrades a malformed proposal to an empty no-op patch', () => {
    const p = safeParsePatch('not json at all');
    expect(p.edits).toEqual({});
    expect(p.rationale).toContain('unparseable');
  });
});

describe('proposePatch', () => {
  it('returns an empty patch WITHOUT calling the LLM when there are no failures', async () => {
    const onCall = vi.fn();
    const client = fakeClient('{}', onCall);
    const p = await proposePatch({ clusters: [], currentInstructions: '', currentAliases: {}, client, llm: LLM });
    expect(onCall).not.toHaveBeenCalled();
    expect(p.edits).toEqual({});
  });

  it('proposes a parsed patch from failure clusters', async () => {
    const client = fakeClient('{"rationale":"stop inventing prices","edits":{"instructions":"If unsure of a price, say you will check."},"targetDimensions":["no_phantom_claims"]}');
    const p = await proposePatch({ clusters: CLUSTERS, currentInstructions: 'Be warm.', currentAliases: {}, client, llm: LLM });
    expect(p.edits.instructions).toContain('say you will check');
    expect(p.targetDimensions).toEqual(['no_phantom_claims']);
  });
});

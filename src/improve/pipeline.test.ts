import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatCompleter } from '../conversation/text-turn.js';
import type { ResolvedLlm } from '../llm/provider.js';
import type { CallRecord } from '../observability/call-record.js';
import { DEFAULT_PERSONAS } from '../evals/personas.js';
import { runImprovePipeline } from './pipeline.js';

const LLM: ResolvedLlm = { provider: 'openai', model: 'm', baseUrl: 'x', apiKeyEnv: 'X', keyOptional: true, maxTokens: 200 };
const PATCH = '{"rationale":"stop inventing prices","edits":{"instructions":"If you are unsure of a price, say you will check."},"targetDimensions":["no_phantom_claims"]}';

/** Verdict JSON failing the named LLM dimensions. */
function verdict(fails: string[]): string {
  const dim = (d: string) => `"${d}":{"pass":${fails.includes(d) ? 'false' : 'true'},"note":"x"}`;
  return `{${['task_resolved', 'searched_before_deny', 'no_phantom_claims', 'stayed_in_character'].map(dim).join(',')}}`;
}

/** Message-aware fake: routes by system-prompt content (judge / proposer /
 *  caller persona / agent). `judgeFails` is constant across baseline+candidate,
 *  so the gate sees no regression and passes. */
function fake(opts: { judgeFails: string[]; patch?: string }): ChatCompleter {
  return {
    chat: { completions: { create: async (args: { messages?: Array<{ content?: string }> }) => {
      const sys = args.messages?.[0]?.content ?? '';
      let content: string;
      if (sys.includes('strict QA judge')) content = verdict(opts.judgeFails);
      else if (sys.includes('improve a phone receptionist agent')) content = opts.patch ?? PATCH;
      else if (sys.includes('You are a CALLER')) content = 'Hi there, quick question. [HANGUP]';
      else content = 'Happy to help.';
      return { id: 'x', created: 0, model: 'm', object: 'chat.completion',
        choices: [{ index: 0, finish_reason: 'stop', logprobs: null,
          message: { role: 'assistant', content, refusal: null } }] } as never;
    } } },
  };
}

function tmpConfig(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'offhook-pipe-'));
  mkdirSync(join(dir, 'knowledge'));
  writeFileSync(join(dir, 'knowledge', 'services.md'), '# Services\n\n## Thing\nA thing.\n');
  const path = join(dir, 'agent.yaml');
  writeFileSync(path, 'agent:\n  id: test-biz\n  businessName: Test Biz\nknowledge:\n  folder: ./knowledge\n');
  return { dir, path };
}

const RECORDS: CallRecord[] = [{
  callId: 'r1', startedAt: '2026-06-15T00:00:00Z', endedAt: '2026-06-15T00:01:00Z',
  durationMs: 60000, outcome: 'completed', turnCount: 1, toolCallCount: 0,
  turns: [{ index: 0, caller: 'how much is a cleaning', agent: 'it is forty dollars' }],
  tools: [], errors: [],
}];
const PERSONAS = DEFAULT_PERSONAS.filter(p => ['happy-path', 'adversarial'].includes(p.id));

describe('runImprovePipeline', () => {
  it('gated dry-run: gate passes but nothing is written without --apply', async () => {
    const { dir, path } = tmpConfig();
    try {
      const before = readFileSync(path, 'utf8');
      const r = await runImprovePipeline({
        configPath: path, records: RECORDS, personas: PERSONAS,
        client: fake({ judgeFails: ['no_phantom_claims'] }), llm: LLM,
        mode: 'gated', apply: false, now: () => 1718000000000,
      });
      expect(r.gate?.apply).toBe(true);
      expect(r.applied).toBe(false);
      expect(r.reason).toContain('dry-run');
      expect(readFileSync(path, 'utf8')).toBe(before); // untouched
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('gated + apply: writes the candidate and backs up the original', async () => {
    const { dir, path } = tmpConfig();
    try {
      const r = await runImprovePipeline({
        configPath: path, records: RECORDS, personas: PERSONAS,
        client: fake({ judgeFails: ['no_phantom_claims'] }), llm: LLM,
        mode: 'gated', apply: true, now: () => 1718000000000, outDir: join(dir, 'improve'),
      });
      expect(r.applied).toBe(true);
      expect(r.backupPath && existsSync(r.backupPath)).toBe(true);
      expect(readFileSync(path, 'utf8')).toContain('say you will check'); // patch landed
      expect(existsSync(join(dir, 'improve', 'scorecard.latest.json'))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('no failures → no patch → nothing written', async () => {
    const { dir, path } = tmpConfig();
    try {
      const before = readFileSync(path, 'utf8');
      const r = await runImprovePipeline({
        configPath: path, records: RECORDS, personas: PERSONAS,
        client: fake({ judgeFails: [] }), llm: LLM, // all pass → no clusters
        mode: 'gated', apply: true, now: () => 1718000000000,
      });
      expect(r.applied).toBe(false);
      expect(r.reason).toContain('No change');
      expect(readFileSync(path, 'utf8')).toBe(before);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('unguarded + apply: writes WITHOUT running the gate', async () => {
    const { dir, path } = tmpConfig();
    try {
      const r = await runImprovePipeline({
        configPath: path, records: RECORDS, personas: PERSONAS,
        client: fake({ judgeFails: ['no_phantom_claims'] }), llm: LLM,
        mode: 'unguarded', apply: true, now: () => 1718000000000,
      });
      expect(r.gate).toBeUndefined();          // gate skipped
      expect(r.applied).toBe(true);
      expect(readFileSync(path, 'utf8')).toContain('say you will check');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('gated: BLOCKS a patch that regresses a safety dimension; nothing written (THE headline guarantee)', async () => {
    // Phase-aware judge: real-record call fails a non-safety dim (→ a cluster, so
    // a patch is proposed); baseline personas pass; candidate personas fail a
    // SAFETY dim (no_phantom_claims). So candidate safety < baseline → BLOCK.
    // Judge-call order: [0]=real record, [1,2]=baseline, [3,4]=candidate.
    function fakeRegressing(): ChatCompleter {
      let judge = 0;
      return { chat: { completions: { create: async (args: { messages?: Array<{ content?: string }> }) => {
        const sys = args.messages?.[0]?.content ?? '';
        let content: string;
        if (sys.includes('strict QA judge')) {
          const idx = judge++;
          content = verdict(idx === 0 ? ['searched_before_deny'] : idx >= 3 ? ['no_phantom_claims'] : []);
        } else if (sys.includes('improve a phone receptionist agent')) content = PATCH;
        else if (sys.includes('You are a CALLER')) content = 'Hi there, quick question. [HANGUP]';
        else content = 'Happy to help.';
        return { id: 'x', created: 0, model: 'm', object: 'chat.completion',
          choices: [{ index: 0, finish_reason: 'stop', logprobs: null,
            message: { role: 'assistant', content, refusal: null } }] } as never;
      } } } };
    }

    const { dir, path } = tmpConfig();
    try {
      const before = readFileSync(path, 'utf8');
      const r = await runImprovePipeline({
        configPath: path, records: RECORDS, personas: PERSONAS,
        client: fakeRegressing(), llm: LLM,
        mode: 'gated', apply: true, now: () => 1718000000000,
      });
      expect(r.gate?.apply).toBe(false);
      expect(r.gate?.blockedReason).toContain('safety regression');
      expect(r.applied).toBe(false);                       // NOT applied despite --apply
      expect(readFileSync(path, 'utf8')).toBe(before);     // agent.yaml untouched
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

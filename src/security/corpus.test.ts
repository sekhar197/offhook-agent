import { describe, expect, it } from 'vitest';
import { checkCallerSafe } from '../tools/caller-safe.js';
import { correctAsrTranscript } from '../asr/asr-correction.js';
import { buildEntityIndex } from '../resolver/entity-index.js';
import type { KnowledgeEntry } from '../types.js';
import { LEAK_MUST_CATCH, SAFE_MUST_PASS, ASR_NO_FIRE } from './corpus.js';

describe('adversarial corpus — caller-safe leak guard', () => {
  it('flags every known infrastructure / identity leak', () => {
    for (const { text, leaks } of LEAK_MUST_CATCH) {
      const issues = checkCallerSafe(text);
      expect(issues.length, `should flag "${text}" (leaks: ${leaks})`).toBeGreaterThan(0);
    }
  });

  it('passes every legitimate message — no false positives', () => {
    for (const text of SAFE_MUST_PASS) {
      expect(checkCallerSafe(text), `should pass "${text}"`).toEqual([]);
    }
  });

  it('is a non-trivial corpus (50+ probes across the three sets)', () => {
    expect(LEAK_MUST_CATCH.length).toBeGreaterThanOrEqual(20);
    expect(SAFE_MUST_PASS.length).toBeGreaterThanOrEqual(10);
    expect(ASR_NO_FIRE.length).toBeGreaterThanOrEqual(15);
    expect(LEAK_MUST_CATCH.length + SAFE_MUST_PASS.length + ASR_NO_FIRE.length)
      .toBeGreaterThanOrEqual(50);
  });
});

const ENTRIES: KnowledgeEntry[] = [
  { id: 'm1', name: 'Deep Tissue Massage', category: 'Massage' },
  { id: 'm2', name: 'Swedish Massage', category: 'Massage' },
  { id: 'm3', name: 'Hot Stone Therapy', category: 'Therapy' },
];
const INDEX = buildEntityIndex(ENTRIES, {});

describe('adversarial corpus — ASR correction never fires on adversarial input', () => {
  it('returns no correction for negations, greetings, injection, or gibberish', () => {
    for (const t of ASR_NO_FIRE) {
      const out = correctAsrTranscript(INDEX, t);
      expect(out.corrections, `should not correct "${t}"`).toEqual([]);
      expect(out.annotation, `should not annotate "${t}"`).toBeNull();
    }
  });
});

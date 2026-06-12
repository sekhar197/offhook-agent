import { describe, expect, it } from 'vitest';
import { correctAsrTranscript } from './asr-correction.js';
import { buildEntityIndex } from '../resolver/entity-index.js';
import type { KnowledgeEntry } from '../types.js';

const ENTRIES: KnowledgeEntry[] = [
  { id: 'e1', name: 'Idli', category: 'Breakfast' },
  { id: 'e2', name: 'Chicken Biryani', category: 'Main' },
  { id: 'e3', name: 'Nizam Shrimp', category: 'Main' },
];

const INDEX = buildEntityIndex(ENTRIES, {
  asrVariants: { italy: 'Idli' },
});

describe('correctAsrTranscript', () => {
  it('annotates curated ASR mishearings in plain language', () => {
    const out = correctAsrTranscript(INDEX, 'italy');
    expect(out.annotation).toContain('Idli');
    expect(out.annotation).toContain('mishearing');
    expect(out.corrections.length).toBeGreaterThan(0);
  });

  it('never fires for negation phrases', () => {
    const out = correctAsrTranscript(INDEX, "I didn't say idli");
    expect(out.annotation).toBeNull();
    expect(out.corrections).toEqual([]);
  });

  it('never fires for conversational greetings', () => {
    for (const phrase of ['hello', 'hi', 'can you hear me', "that's all"]) {
      const out = correctAsrTranscript(INDEX, phrase);
      expect(out.annotation).toBeNull();
    }
  });

  it('never rewrites the transcript itself — annotate only', () => {
    const out = correctAsrTranscript(INDEX, 'italy');
    expect(out.originalText).toBe('italy');
    expect(out.correctedText).toBe('italy');
  });

  it('skips phonetic corrections when the entity is already verbatim in the transcript', () => {
    // Caller clearly said "shrimp" — annotating it as a mishearing of
    // "Nizam Shrimp" would confuse the LLM.
    const out = correctAsrTranscript(INDEX, 'shrimp');
    expect(out.annotation).toBeNull();
  });

  it('catches curated mishearings inside longer utterances via per-word fallback', () => {
    const out = correctAsrTranscript(INDEX, 'do you have any italy');
    expect(out.annotation).toContain('Idli');
  });

  it('low-confidence fuzzy matches stay below the annotation gate (false-positive guard)', () => {
    // "birryani" resolves via fuzzy at 0.5 — under the 0.65 gate for
    // non-curated matches, so no annotation. The hybrid search layer
    // still finds it; ASR annotation is reserved for high confidence.
    const out = correctAsrTranscript(INDEX, 'do you have any birryani');
    expect(out.annotation).toBeNull();
  });

  it('annotation text contains no technical terminology', () => {
    const out = correctAsrTranscript(INDEX, 'italy');
    const banned = ['ASR', 'phonetic', 'embedding', 'tool', 'system', 'API', 'database'];
    for (const term of banned) {
      expect(out.annotation ?? '').not.toContain(term);
    }
  });

  it('returns clean result for empty input', () => {
    const out = correctAsrTranscript(INDEX, '');
    expect(out.annotation).toBeNull();
    expect(out.corrections).toEqual([]);
  });
});

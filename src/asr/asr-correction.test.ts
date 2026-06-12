import { describe, expect, it } from 'vitest';
import { correctAsrTranscript } from './asr-correction.js';
import { buildEntityIndex } from '../resolver/entity-index.js';
import type { KnowledgeEntry } from '../types.js';

const ENTRIES: KnowledgeEntry[] = [
  { id: 'e1', name: 'Reiki Healing', category: 'Therapy' },
  { id: 'e2', name: 'Physiotherapy Session', category: 'Therapy' },
  { id: 'e3', name: 'Pilates Reformer', category: 'Classes' },
];

const INDEX = buildEntityIndex(ENTRIES, {
  asrVariants: { rakey: 'Reiki Healing' },
});

describe('correctAsrTranscript', () => {
  it('annotates curated ASR mishearings in plain language', () => {
    const out = correctAsrTranscript(INDEX, 'rakey');
    expect(out.annotation).toContain('Reiki Healing');
    expect(out.annotation).toContain('mishearing');
    expect(out.corrections.length).toBeGreaterThan(0);
  });

  it('never fires for negation phrases', () => {
    const out = correctAsrTranscript(INDEX, "I didn't say reiki");
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
    const out = correctAsrTranscript(INDEX, 'rakey');
    expect(out.originalText).toBe('rakey');
    expect(out.correctedText).toBe('rakey');
  });

  it('skips phonetic corrections when the entity is already verbatim in the transcript', () => {
    // Caller clearly said "reformer" — annotating it as a mishearing of
    // "Pilates Reformer" would confuse the LLM.
    const out = correctAsrTranscript(INDEX, 'reformer');
    expect(out.annotation).toBeNull();
  });

  it('catches curated mishearings inside longer utterances via per-word fallback', () => {
    const out = correctAsrTranscript(INDEX, 'do you do any rakey');
    expect(out.annotation).toContain('Reiki Healing');
  });

  it('unknown/low-confidence terms stay below the annotation gate (false-positive guard)', () => {
    // "fisio" resolves to nothing with high confidence — no annotation.
    // The hybrid search layer can still rescue it; ASR annotation is
    // reserved for high-confidence corrections only.
    const out = correctAsrTranscript(INDEX, 'do you have any fisio');
    expect(out.annotation).toBeNull();
  });

  it('annotation text contains no technical terminology', () => {
    const out = correctAsrTranscript(INDEX, 'rakey');
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

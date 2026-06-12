import { describe, expect, it } from 'vitest';
import { buildEntityIndex, resolveEntityCandidates, levenshtein } from './entity-index.js';
import type { KnowledgeEntry } from '../types.js';

const ENTRIES: KnowledgeEntry[] = [
  { id: 'e1', name: 'Idli', category: 'Breakfast' },
  { id: 'e2', name: 'Chicken Biryani', category: 'Main' },
  { id: 'e3', name: 'Paneer Tikka', category: 'Appetizer' },
  { id: 'e4', name: 'Conference Room A', category: 'Facilities' },
];

const INDEX = buildEntityIndex(ENTRIES, {
  aliases: { dosa: 'e1' }, // curated alias by id
  asrVariants: { italy: 'Idli', english: 'Idli' }, // curated mishearings by name
});

describe('buildEntityIndex / resolveEntityCandidates', () => {
  it('resolves an exact entry name via the alias layer at score 1.0', () => {
    const out = resolveEntityCandidates(INDEX, 'idli');
    expect(out[0]?.entry.name).toBe('Idli');
    expect(out[0]?.matchType).toBe('alias');
    expect(out[0]?.score).toBe(1.0);
  });

  it('resolves a curated ASR mishearing ("italy" -> Idli) at score 0.9', () => {
    const out = resolveEntityCandidates(INDEX, 'italy');
    expect(out[0]?.entry.name).toBe('Idli');
    expect(out[0]?.matchType).toBe('asr');
    expect(out[0]?.score).toBe(0.9);
  });

  it('resolves curated aliases referenced by entry id', () => {
    const out = resolveEntityCandidates(INDEX, 'dosa');
    expect(out[0]?.entry.name).toBe('Idli');
    expect(out[0]?.matchType).toBe('alias');
  });

  it('resolves phonetic per-token matches ("birryani" sounds like biryani)', () => {
    const out = resolveEntityCandidates(INDEX, 'birryani');
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.entry.name).toBe('Chicken Biryani');
    expect(out[0]?.matchType).toBe('phonetic');
  });

  it('resolves token overlap inside a longer utterance', () => {
    const out = resolveEntityCandidates(INDEX, 'can I get the paneer please');
    expect(out.some(c => c.entry.name === 'Paneer Tikka')).toBe(true);
  });

  it('falls back to fuzzy levenshtein for accented variants ("birianist")', () => {
    const out = resolveEntityCandidates(INDEX, 'birianist');
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.entry.name).toBe('Chicken Biryani');
  });

  it('works for non-food domains (receptionist facilities)', () => {
    const out = resolveEntityCandidates(INDEX, 'conference room');
    expect(out.some(c => c.entry.name === 'Conference Room A')).toBe(true);
  });

  it('returns empty for empty/stop-word-only utterances', () => {
    expect(resolveEntityCandidates(INDEX, '')).toEqual([]);
    expect(resolveEntityCandidates(INDEX, 'the and of')).toEqual([]);
  });

  it('respects the limit', () => {
    const out = resolveEntityCandidates(INDEX, 'chicken paneer idli', 2);
    expect(out.length).toBeLessThanOrEqual(2);
  });
});

describe('levenshtein', () => {
  it('computes edit distances', () => {
    expect(levenshtein('biryani', 'biryani')).toBe(0);
    expect(levenshtein('birianist', 'biryani')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

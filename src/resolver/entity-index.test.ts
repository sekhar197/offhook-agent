import { describe, expect, it } from 'vitest';
import { buildEntityIndex, resolveEntityCandidates, levenshtein } from './entity-index.js';
import type { KnowledgeEntry } from '../types.js';

const ENTRIES: KnowledgeEntry[] = [
  { id: 'e1', name: 'Reiki Healing', category: 'Therapy' },
  { id: 'e2', name: 'Physiotherapy Session', category: 'Therapy' },
  { id: 'e3', name: 'Pilates Reformer', category: 'Classes' },
  { id: 'e4', name: 'Conference Room A', category: 'Facilities' },
];

const INDEX = buildEntityIndex(ENTRIES, {
  aliases: { 'energy work': 'e1' }, // curated alias by id
  asrVariants: { rakey: 'Reiki Healing', rakhi: 'Reiki Healing' }, // curated mishearings by name
});

describe('buildEntityIndex / resolveEntityCandidates', () => {
  it('resolves an exact entry name via the alias layer at score 1.0', () => {
    const out = resolveEntityCandidates(INDEX, 'reiki healing');
    expect(out[0]?.entry.name).toBe('Reiki Healing');
    expect(out[0]?.matchType).toBe('alias');
    expect(out[0]?.score).toBe(1.0);
  });

  it('resolves a curated ASR mishearing ("rakey" -> Reiki Healing) at score 0.9', () => {
    const out = resolveEntityCandidates(INDEX, 'rakey');
    expect(out[0]?.entry.name).toBe('Reiki Healing');
    expect(out[0]?.matchType).toBe('asr');
    expect(out[0]?.score).toBe(0.9);
  });

  it('resolves curated aliases referenced by entry id', () => {
    const out = resolveEntityCandidates(INDEX, 'energy work');
    expect(out[0]?.entry.name).toBe('Reiki Healing');
    expect(out[0]?.matchType).toBe('alias');
  });

  it('resolves phonetic per-token matches ("pilatees" sounds like pilates)', () => {
    const out = resolveEntityCandidates(INDEX, 'pilatees');
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.entry.name).toBe('Pilates Reformer');
    expect(out[0]?.matchType).toBe('phonetic');
  });

  it('resolves token overlap inside a longer utterance', () => {
    const out = resolveEntityCandidates(INDEX, 'can I book pilates please');
    expect(out.some(c => c.entry.name === 'Pilates Reformer')).toBe(true);
  });

  it('falls back to fuzzy levenshtein for accented variants ("fisiotherapy")', () => {
    const out = resolveEntityCandidates(INDEX, 'fisiotherapy');
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.entry.name).toBe('Physiotherapy Session');
  });

  it('works across domains (facilities)', () => {
    const out = resolveEntityCandidates(INDEX, 'conference room');
    expect(out.some(c => c.entry.name === 'Conference Room A')).toBe(true);
  });

  it('returns empty for empty/stop-word-only utterances', () => {
    expect(resolveEntityCandidates(INDEX, '')).toEqual([]);
    expect(resolveEntityCandidates(INDEX, 'the and of')).toEqual([]);
  });

  it('respects the limit', () => {
    const out = resolveEntityCandidates(INDEX, 'reiki pilates physiotherapy', 2);
    expect(out.length).toBeLessThanOrEqual(2);
  });
});

describe('levenshtein', () => {
  it('computes edit distances', () => {
    expect(levenshtein('pilates', 'pilates')).toBe(0);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

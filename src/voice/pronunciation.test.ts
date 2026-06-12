import { describe, expect, it } from 'vitest';
import { applyPronunciationOverrides, buildPhonemeMap } from './pronunciation.js';

describe('buildPhonemeMap', () => {
  it('returns empty map for empty input', () => {
    expect(buildPhonemeMap([])).toEqual({});
  });

  it('keeps only entries with a pronunciation hint', () => {
    const map = buildPhonemeMap([
      { name: 'Qigong', pronunciationHint: 'chee-gong' },
      { name: 'Facial' },
      { name: 'Yoga', pronunciationHint: '' }, // empty → skipped
      { name: 'Chi', pronunciationHint: 'chee' },
    ]);
    expect(map).toEqual({ qigong: 'chee-gong', chi: 'chee' });
  });

  it('lowercases keys (matching is case-insensitive)', () => {
    const map = buildPhonemeMap([{ name: 'JOSÉ', pronunciationHint: 'ho-zay' }]);
    expect(Object.keys(map)[0]).toBe('josé');
  });

  it('first-writer-wins on duplicate names', () => {
    const map = buildPhonemeMap([
      { name: 'Chi', pronunciationHint: 'chee' },
      { name: 'Chi', pronunciationHint: 'chi-different' },
    ]);
    expect(map.chi).toBe('chee');
  });

  it('ignores null/undefined hints', () => {
    const map = buildPhonemeMap([
      { name: 'A', pronunciationHint: null },
      { name: 'B', pronunciationHint: undefined },
    ]);
    expect(map).toEqual({});
  });
});

describe('applyPronunciationOverrides', () => {
  const map = {
    qigong: 'chee-gong',
    chi: 'chee',
    'tai chi': 'tie chee',
  };

  it('is a no-op when map is empty', () => {
    expect(applyPronunciationOverrides('Try the qigong.', {})).toBe('Try the qigong.');
  });

  it('is a no-op when text is empty', () => {
    expect(applyPronunciationOverrides('', map)).toBe('');
  });

  it('replaces a whole-word match', () => {
    expect(applyPronunciationOverrides('Book the qigong today.', map)).toBe(
      'Book the chee-gong today.',
    );
  });

  it('is case-insensitive but preserves the replacement case as given', () => {
    expect(applyPronunciationOverrides('QIGONG or Qigong?', map)).toBe(
      'chee-gong or chee-gong?',
    );
  });

  it('does not match inside other words (whole-word boundaries)', () => {
    // "chi" must not match inside "chiropractor"
    expect(applyPronunciationOverrides('See the chiropractor', map)).toBe('See the chiropractor');
  });

  it('replaces all occurrences in a single pass', () => {
    expect(applyPronunciationOverrides('qigong and more qigong', map)).toBe(
      'chee-gong and more chee-gong',
    );
  });

  it('handles punctuation adjacency', () => {
    expect(applyPronunciationOverrides("That's qigong, right?", map)).toBe(
      "That's chee-gong, right?",
    );
  });

  it('prefers longer keys over shorter (chi vs tai chi)', () => {
    const overlap = { chi: 'chee', 'tai chi': 'tie chee' };
    expect(applyPronunciationOverrides('I want tai chi please', overlap)).toBe(
      'I want tie chee please',
    );
  });

  it('leaves text alone when no keys match', () => {
    expect(applyPronunciationOverrides('Just a haircut', map)).toBe('Just a haircut');
  });

  it('does not crash on keys containing regex metacharacters', () => {
    // `\b` is ASCII-aware and may or may not fire next to paren chars;
    // the contract here is just "does not throw" when the knowledge base has
    // unusual names. A non-matching pass returns input unchanged.
    const tricky = { 'massage (deep)': 'deep massage' };
    expect(() => applyPronunciationOverrides('I want a massage please', tricky)).not.toThrow();
  });
});

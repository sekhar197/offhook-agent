import { describe, expect, it } from 'vitest';
import { applyPronunciationOverrides, buildPhonemeMap } from './pronunciation.js';

describe('buildPhonemeMap', () => {
  it('returns empty map for empty input', () => {
    expect(buildPhonemeMap([])).toEqual({});
  });

  it('keeps only items with a pronunciation hint', () => {
    const map = buildPhonemeMap([
      { name: 'Biryani', pronunciationHint: 'bir-YAH-nee' },
      { name: 'Salad' },
      { name: 'Dal', pronunciationHint: '' }, // empty → skipped
      { name: 'Pho', pronunciationHint: 'fuh' },
    ]);
    expect(map).toEqual({ biryani: 'bir-YAH-nee', pho: 'fuh' });
  });

  it('lowercases keys (matching is case-insensitive)', () => {
    const map = buildPhonemeMap([{ name: 'BÁNH MÌ', pronunciationHint: 'bon mee' }]);
    expect(Object.keys(map)[0]).toBe('bánh mì');
  });

  it('first-writer-wins on duplicate names', () => {
    const map = buildPhonemeMap([
      { name: 'Pho', pronunciationHint: 'fuh' },
      { name: 'Pho', pronunciationHint: 'pho-different' },
    ]);
    expect(map.pho).toBe('fuh');
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
    biryani: 'bir-YAH-nee',
    pho: 'fuh',
    'bánh mì': 'bon mee',
  };

  it('is a no-op when map is empty', () => {
    expect(applyPronunciationOverrides('Try the biryani.', {})).toBe('Try the biryani.');
  });

  it('is a no-op when text is empty', () => {
    expect(applyPronunciationOverrides('', map)).toBe('');
  });

  it('replaces a whole-word match', () => {
    expect(applyPronunciationOverrides('Order the biryani today.', map)).toBe(
      'Order the bir-YAH-nee today.',
    );
  });

  it('is case-insensitive but preserves the replacement case as given', () => {
    expect(applyPronunciationOverrides('BIRYANI or Biryani?', map)).toBe(
      'bir-YAH-nee or bir-YAH-nee?',
    );
  });

  it('does not match inside other words (whole-word boundaries)', () => {
    // "pho" must not match inside "phone"
    expect(applyPronunciationOverrides('Answer the phone', map)).toBe('Answer the phone');
  });

  it('replaces all occurrences in a single pass', () => {
    expect(applyPronunciationOverrides('biryani and more biryani', map)).toBe(
      'bir-YAH-nee and more bir-YAH-nee',
    );
  });

  it('handles punctuation adjacency', () => {
    expect(applyPronunciationOverrides("That's biryani, right?", map)).toBe(
      "That's bir-YAH-nee, right?",
    );
  });

  it('prefers longer keys over shorter (pho vs pho ga)', () => {
    const overlap = { pho: 'fuh', 'pho ga': 'fuh gah' };
    expect(applyPronunciationOverrides('I want pho ga please', overlap)).toBe(
      'I want fuh gah please',
    );
  });

  it('leaves text alone when no keys match', () => {
    expect(applyPronunciationOverrides('Just a cheeseburger', map)).toBe('Just a cheeseburger');
  });

  it('does not crash on keys containing regex metacharacters', () => {
    // `\b` is ASCII-aware and may or may not fire next to paren chars;
    // the contract here is just "does not throw" when the knowledge base has
    // unusual names. A non-matching pass returns input unchanged.
    const tricky = { 'soup (spicy)': 'spicy soup' };
    expect(() => applyPronunciationOverrides('I want soup please', tricky)).not.toThrow();
  });
});

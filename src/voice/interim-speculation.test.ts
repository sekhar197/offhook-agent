import { describe, expect, it } from 'vitest';
import {
  shouldStartSpeculation,
  shouldKeepSpeculation,
  tokenOverlap,
} from './interim-speculation.js';

describe('shouldStartSpeculation', () => {
  const base = {
    confidence: 0.9,
    prevInterimLength: 0,
    msSinceLastInterim: 200,
  };

  it('returns false for empty or whitespace', () => {
    expect(shouldStartSpeculation('', base)).toBe(false);
    expect(shouldStartSpeculation('   ', base)).toBe(false);
  });

  it('returns false when confidence below threshold', () => {
    expect(
      shouldStartSpeculation('i want two sessions please', { ...base, confidence: 0.7 }),
    ).toBe(false);
  });

  it('returns false when confidence is NaN', () => {
    expect(
      shouldStartSpeculation('i want two sessions please', { ...base, confidence: Number.NaN }),
    ).toBe(false);
  });

  it('returns false when word count below minWords', () => {
    expect(shouldStartSpeculation('ok yeah', base)).toBe(false);
  });

  it('respects custom minWords', () => {
    expect(shouldStartSpeculation('two sessions', { ...base, minWords: 2 })).toBe(true);
    expect(shouldStartSpeculation('two sessions', { ...base, minWords: 3 })).toBe(false);
  });

  it('returns false when interim is still growing', () => {
    // prev length 40, current length 10 → no, we block shrinking
    expect(
      shouldStartSpeculation('i want two sessions please', {
        ...base,
        prevInterimLength: 100,
      }),
    ).toBe(false);
  });

  it('returns false when interim has not been stable long enough', () => {
    expect(
      shouldStartSpeculation('i want two sessions please', {
        ...base,
        msSinceLastInterim: 50,
      }),
    ).toBe(false);
  });

  it('returns true when all gates pass (default opts)', () => {
    expect(shouldStartSpeculation('i want two sessions please', base)).toBe(true);
  });

  it('honors custom confidence threshold', () => {
    expect(
      shouldStartSpeculation('i want two sessions please', {
        ...base,
        confidence: 0.7,
        minConfidence: 0.6,
      }),
    ).toBe(true);
  });

  it('honors custom stability window', () => {
    expect(
      shouldStartSpeculation('i want two sessions please', {
        ...base,
        msSinceLastInterim: 50,
        minStableMs: 30,
      }),
    ).toBe(true);
  });
});

describe('tokenOverlap', () => {
  it('returns 0 for empty strings', () => {
    expect(tokenOverlap('', '')).toBe(0);
    expect(tokenOverlap('hello world', '')).toBe(0);
    expect(tokenOverlap('', 'hello world')).toBe(0);
  });

  it('returns 1.0 when strings share all tokens on shorter side', () => {
    expect(tokenOverlap('i want two sessions', 'i want two sessions')).toBe(1);
  });

  it('scores superset as 1.0 (min-denominator)', () => {
    // final is strict superset of interim → interim fully contained
    expect(tokenOverlap('two sessions', 'i want two sessions please')).toBe(1);
  });

  it('is case-insensitive', () => {
    expect(tokenOverlap('Two Sessions', 'two sessions')).toBe(1);
  });

  it('strips punctuation (but keeps apostrophes inside words) before tokenizing', () => {
    // commas/question marks are stripped; apostrophe is kept ("that's" stays one token).
    expect(tokenOverlap("that's pilates, right?", "that's pilates right")).toBe(1);
  });

  it('returns partial overlap for divergent finals', () => {
    // interim = 4 tokens, final = 4 tokens, 2 shared → 2/4 = 0.5
    const score = tokenOverlap('i want two sessions', 'i need four facials');
    expect(score).toBeCloseTo(1 / 4, 5); // only "i" shared → 0.25
  });

  it('returns 0 for completely disjoint inputs', () => {
    expect(tokenOverlap('hello world', 'foo bar')).toBe(0);
  });

  it('handles unicode word characters', () => {
    expect(tokenOverlap('bánh mì please', 'bánh mì please')).toBe(1);
  });
});

describe('shouldKeepSpeculation', () => {
  it('returns false when either input is empty', () => {
    expect(shouldKeepSpeculation('', 'hello')).toBe(false);
    expect(shouldKeepSpeculation('hello', '')).toBe(false);
  });

  it('keeps on exact match', () => {
    expect(shouldKeepSpeculation('i want two sessions', 'i want two sessions')).toBe(true);
  });

  it('keeps when final is a superset (caller finished sentence)', () => {
    expect(shouldKeepSpeculation('two sessions', 'i want two sessions please')).toBe(true);
  });

  it('keeps at default 0.8 threshold with minor divergence', () => {
    // 5 tokens vs 5 tokens, 4 shared → 4/5 = 0.8 exactly
    expect(shouldKeepSpeculation('i want two long sessions', 'i want two short sessions')).toBe(
      true,
    );
  });

  it('aborts when overlap below threshold', () => {
    // divergence: caller corrected themselves
    expect(shouldKeepSpeculation('i want two sessions', 'actually make that four facials')).toBe(
      false,
    );
  });

  it('honors a custom overlap threshold', () => {
    // 2 of 4 overlap → 0.5
    expect(
      shouldKeepSpeculation('book hot stone please', 'book deep tissue please', {
        minOverlap: 0.4,
      }),
    ).toBe(true);
    expect(
      shouldKeepSpeculation('book hot stone please', 'book deep tissue please', {
        minOverlap: 0.6,
      }),
    ).toBe(false);
  });
});

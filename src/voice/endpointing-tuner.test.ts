import { describe, expect, it } from 'vitest';
import {
  ENDPOINTING_BOUNDS,
  computeRecommendedMaxDelay,
  p50,
} from './endpointing-tuner.js';

describe('p50', () => {
  it('returns 0 for empty input', () => {
    expect(p50([])).toBe(0);
  });

  it('returns the value for a single sample', () => {
    expect(p50([1700])).toBe(1700);
  });

  it('returns the middle for an odd-length sorted array', () => {
    expect(p50([1000, 2000, 3000])).toBe(2000);
  });

  it('returns the lower-middle for even-length arrays (conservative bias)', () => {
    // Lower-middle for [1,2,3,4] = 2 (not 2.5). Bias tighter by design.
    expect(p50([1000, 2000, 3000, 4000])).toBe(2000);
  });

  it('does not mutate the input', () => {
    const input = [3, 1, 2];
    p50(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('computeRecommendedMaxDelay', () => {
  it('falls back to default when sample count is below the floor', () => {
    const r = computeRecommendedMaxDelay({ pausesMs: [1700, 1800, 1900] });
    expect(r.usedDefault).toBe(true);
    expect(r.recommendedMs).toBe(ENDPOINTING_BOUNDS.defaultMs);
    expect(r.sampleCount).toBe(3);
  });

  it('returns an observed p50 when enough samples and in-range', () => {
    const pauses = Array.from({ length: 50 }, (_, i) => 1800 + i * 4);
    const r = computeRecommendedMaxDelay({ pausesMs: pauses });
    expect(r.usedDefault).toBe(false);
    expect(r.sampleCount).toBe(50);
    expect(r.recommendedMs).toBeGreaterThanOrEqual(ENDPOINTING_BOUNDS.minMs);
    expect(r.recommendedMs).toBeLessThanOrEqual(ENDPOINTING_BOUNDS.maxMs);
    expect(r.recommendedMs).toBeGreaterThan(1800);
  });

  it('clamps to MIN when observed p50 is below floor', () => {
    const pauses = Array.from({ length: 50 }, () => 800);
    const r = computeRecommendedMaxDelay({ pausesMs: pauses });
    expect(r.rawP50Ms).toBe(800);
    expect(r.recommendedMs).toBe(ENDPOINTING_BOUNDS.minMs);
  });

  it('clamps to MAX when observed p50 is above ceiling', () => {
    const pauses = Array.from({ length: 50 }, () => 5000);
    const r = computeRecommendedMaxDelay({ pausesMs: pauses });
    expect(r.rawP50Ms).toBe(5000);
    expect(r.recommendedMs).toBe(ENDPOINTING_BOUNDS.maxMs);
  });

  it('filters out NaN / negative / zero samples before counting', () => {
    const pauses = [0, -1, NaN, Infinity, 1700, 1800, 1900];
    const r = computeRecommendedMaxDelay({
      pausesMs: pauses,
      minSamples: 3,
    });
    expect(r.sampleCount).toBe(3);
    expect(r.usedDefault).toBe(false);
  });

  it('honours the minSamples override', () => {
    const r = computeRecommendedMaxDelay({
      pausesMs: [1800, 1850, 1900],
      minSamples: 2,
    });
    expect(r.usedDefault).toBe(false);
    expect(r.sampleCount).toBe(3);
  });

  it('honours the defaultMs override when falling back', () => {
    const r = computeRecommendedMaxDelay({
      pausesMs: [],
      defaultMs: 1800,
    });
    expect(r.usedDefault).toBe(true);
    expect(r.recommendedMs).toBe(1800);
  });

  it('clamps an overridden default outside the bounds', () => {
    const low = computeRecommendedMaxDelay({ pausesMs: [], defaultMs: 500 });
    expect(low.recommendedMs).toBe(ENDPOINTING_BOUNDS.minMs);
    const high = computeRecommendedMaxDelay({ pausesMs: [], defaultMs: 9999 });
    expect(high.recommendedMs).toBe(ENDPOINTING_BOUNDS.maxMs);
  });

  it('rounds to integer ms', () => {
    const pauses = Array.from({ length: 50 }, () => 1750.7);
    const r = computeRecommendedMaxDelay({ pausesMs: pauses });
    expect(Number.isInteger(r.recommendedMs)).toBe(true);
  });
});

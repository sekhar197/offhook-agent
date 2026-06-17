import { describe, expect, it } from 'vitest';
import type { Scorecard } from '../evals/metrics.js';
import { gateDecision } from './gate.js';

const DIMS = ['caller_safe', 'task_resolved', 'searched_before_deny', 'no_phantom_claims', 'stayed_in_character'];

/** Build a scorecard with a uniform per-dimension rate, overridable per dim. */
function scorecard(overall: number, rates: Partial<Record<string, number>> = {}): Scorecard {
  const byDimension: Scorecard['byDimension'] = {};
  for (const d of DIMS) {
    const rate = rates[d] ?? 1;
    byDimension[d] = { pass: Math.round(rate * 10), total: 10, rate };
  }
  return { totalCalls: 10, overallPassRate: overall, byDimension, byPersona: [], failures: [] };
}

describe('gateDecision', () => {
  it('applies when nothing regresses', () => {
    const r = gateDecision(scorecard(0.9), scorecard(0.95));
    expect(r.apply).toBe(true);
  });

  it('BLOCKS on a safety-dimension regression (the core safety guarantee)', () => {
    const baseline = scorecard(0.9);
    const candidate = scorecard(0.95, { no_phantom_claims: 0.6 }); // higher overall, but safety dropped
    const r = gateDecision(baseline, candidate);
    expect(r.apply).toBe(false);
    expect(r.blockedReason).toContain('safety regression');
    expect(r.blockedReason).toContain('no_phantom_claims');
  });

  it('BLOCKS on an overall regression even if safety holds', () => {
    const r = gateDecision(scorecard(0.9), scorecard(0.7));
    expect(r.apply).toBe(false);
    expect(r.blockedReason).toContain('overall regression');
  });

  it('allows a tiny overall dip within epsilon', () => {
    const r = gateDecision(scorecard(0.9), scorecard(0.89), { epsilon: 0.05 });
    expect(r.apply).toBe(true);
  });

  it('treats caller_safe and stayed_in_character as safety dims too', () => {
    expect(gateDecision(scorecard(0.9), scorecard(0.95, { caller_safe: 0.8 })).apply).toBe(false);
    expect(gateDecision(scorecard(0.9), scorecard(0.95, { stayed_in_character: 0.8 })).apply).toBe(false);
  });
});

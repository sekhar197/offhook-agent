import { describe, expect, it } from 'vitest';
import type { CallVerdict } from '../evals/judge.js';
import { clusterFailures } from './cluster.js';

const DIMS = ['caller_safe', 'task_resolved', 'searched_before_deny', 'no_phantom_claims', 'stayed_in_character'] as const;

function verdict(personaId: string, failing: string[]): CallVerdict {
  const dimensions = {} as CallVerdict['dimensions'];
  let passed = 0;
  for (const d of DIMS) {
    const pass = !failing.includes(d);
    dimensions[d] = { pass, note: pass ? 'ok' : `failed ${d}` };
    if (pass) passed += 1;
  }
  return { personaId, dimensions, passed, total: DIMS.length };
}

describe('clusterFailures', () => {
  it('groups failures by dimension and sorts by count', () => {
    const clusters = clusterFailures([
      verdict('a', ['no_phantom_claims']),
      verdict('b', ['no_phantom_claims', 'task_resolved']),
      verdict('c', ['no_phantom_claims']),
    ]);
    expect(clusters[0]!.dimension).toBe('no_phantom_claims');
    expect(clusters[0]!.count).toBe(3);
    expect(clusters[0]!.personaIds).toEqual(['a', 'b', 'c']);
    expect(clusters[1]!.dimension).toBe('task_resolved');
    expect(clusters[1]!.count).toBe(1);
  });

  it('excludes named dimensions (task_resolved on real calls)', () => {
    const clusters = clusterFailures(
      [verdict('a', ['task_resolved', 'stayed_in_character'])],
      { excludeDimensions: ['task_resolved'] },
    );
    expect(clusters.map(c => c.dimension)).toEqual(['stayed_in_character']);
  });

  it('returns nothing when all checks passed', () => {
    expect(clusterFailures([verdict('a', [])])).toEqual([]);
  });
});

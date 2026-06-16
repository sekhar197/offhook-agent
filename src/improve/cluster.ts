/**
 * Group judged failures by dimension into clusters the proposer can act on.
 * Reuses the eval `aggregate` so the failure list is computed exactly the way
 * the scorecard computes it.
 */
import { aggregate } from '../evals/metrics.js';
import type { CallVerdict } from '../evals/judge.js';
import type { FailureCluster } from './types.js';

const MAX_NOTES_PER_CLUSTER = 5;

export function clusterFailures(
  verdicts: CallVerdict[],
  opts: { excludeDimensions?: string[] } = {},
): FailureCluster[] {
  const exclude = new Set(opts.excludeDimensions ?? []);
  const { failures } = aggregate(verdicts);

  const byDim = new Map<string, FailureCluster>();
  for (const f of failures) {
    if (exclude.has(f.dimension)) continue;
    let c = byDim.get(f.dimension);
    if (!c) {
      c = { dimension: f.dimension, count: 0, notes: [], personaIds: [] };
      byDim.set(f.dimension, c);
    }
    c.count += 1;
    if (c.notes.length < MAX_NOTES_PER_CLUSTER) c.notes.push(f.note);
    if (!c.personaIds.includes(f.personaId)) c.personaIds.push(f.personaId);
  }

  // Biggest failure mode first — the proposer should prioritize it.
  return [...byDim.values()].sort((a, b) => b.count - a.count);
}

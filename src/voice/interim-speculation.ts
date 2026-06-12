/**
 * Interim-ASR LLM speculation — decision primitives.
 *
 * Phase 3 of the v10 human-feel plan. LiveKit today starts the LLM
 * call only on a final STT transcript. Deepgram interim transcripts
 * arrive 300-600ms earlier; speculating on a confident interim and
 * then confirming (or aborting) when the final lands is the single
 * biggest TTFT win left on cascade.
 *
 * This module is the PURE decision logic. Two questions:
 *   1. `shouldStartSpeculation(interim, opts)` — is this interim
 *      confident enough to warrant firing the LLM early? (Confidence
 *      threshold + word-count floor + stability window.)
 *   2. `shouldKeepSpeculation(interim, final)` — did the final match
 *      the interim closely enough to keep the speculated response, or
 *      did it diverge (caller corrected themselves, STT flipped)? In
 *      practice: keep if ≥ 80% token overlap by the shorter side.
 *
 * The wire-in (UserInputTranscribed → speculation state machine in
 * entry.ts) is deliberately NOT done in this PR. It requires a live-
 * fire test setup that can verify abort/retry behavior without
 * regressing the existing turn scheduler. Ship the primitives here;
 * wire them behind the `interim_speculation` named experiment in a
 * follow-up once staging calls confirm no turn-drop regressions.
 */

// ===========================================================================
// START DECISION
// ===========================================================================

export interface SpeculationStartOpts {
  /** Deepgram confidence for this interim transcript (0-1). */
  confidence: number;
  /** Chars of the last observed interim; we wait for stability before firing. */
  prevInterimLength: number;
  /** Milliseconds since the prior interim was observed; a "stable window". */
  msSinceLastInterim: number;
  /** Min confidence to fire. Default 0.85 — Deepgram's nominal "ready" bar. */
  minConfidence?: number;
  /** Min word count to fire. Default 3 — "ok" / "yeah" aren't worth speculating. */
  minWords?: number;
  /** Min stable-window ms. Default 150 — interim hasn't moved for this long. */
  minStableMs?: number;
}

export function shouldStartSpeculation(
  interim: string,
  opts: SpeculationStartOpts,
): boolean {
  const minConfidence = opts.minConfidence ?? 0.85;
  const minWords = opts.minWords ?? 3;
  const minStableMs = opts.minStableMs ?? 150;

  if (!interim || !interim.trim()) return false;
  if (!Number.isFinite(opts.confidence) || opts.confidence < minConfidence) return false;

  const trimmed = interim.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < minWords) return false;

  // Length stability: the transcript must have stopped growing recently.
  // Equal length or shrinking is fine (Deepgram occasionally retracts a
  // word); what we block on is the case where the caller is still mid-
  // sentence and new words are streaming in every 50ms.
  if (trimmed.length < opts.prevInterimLength) return false;
  if (opts.msSinceLastInterim < minStableMs) return false;

  return true;
}

// ===========================================================================
// KEEP DECISION
// ===========================================================================

/**
 * Token-level Jaccard-ish overlap: |intersect| / min(|A|,|B|). Picks
 * "min" (not "union") because a final that is a strict superset of
 * the interim (caller finished the sentence) should still score ≥ 1.0.
 * Lowercases + strips punctuation before tokenizing.
 */
export function tokenOverlap(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s']/gu, ' ')
        .split(/\s+/)
        .filter(Boolean),
    );
  const aa = toks(a);
  const bb = toks(b);
  if (aa.size === 0 || bb.size === 0) return 0;
  let hit = 0;
  const [small, large] = aa.size <= bb.size ? [aa, bb] : [bb, aa];
  for (const t of small) if (large.has(t)) hit++;
  return hit / small.size;
}

export interface SpeculationKeepOpts {
  /** Overlap threshold in [0,1]. Default 0.8. */
  minOverlap?: number;
}

/**
 * Given the interim we speculated on and the eventual final, should
 * we keep the speculated LLM response? True = keep, false = abort and
 * re-run on the final.
 *
 * The bar is intentionally permissive. A false "abort" is just a wasted
 * LLM call, but a false "keep" ships a response that doesn't match what
 * the caller actually said — much worse. So: require high overlap.
 */
export function shouldKeepSpeculation(
  interim: string,
  final: string,
  opts: SpeculationKeepOpts = {},
): boolean {
  const minOverlap = opts.minOverlap ?? 0.8;
  if (!interim || !final) return false;
  return tokenOverlap(interim, final) >= minOverlap;
}

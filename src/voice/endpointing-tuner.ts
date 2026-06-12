/**
 * Per-deployment endpointing auto-tune.
 *
 * LiveKit's `endpointing.maxDelay`
 * is the silence gap after the caller's last word before we finalize
 * and start thinking. Default 2000ms is a compromise: too short and
 * we cut off callers who pause mid-sentence; too long and every turn
 * feels laggy.
 *
 * Truth: the right value varies by caller demographic / language /
 * domain context. An older caller speaking English-as-second-
 * language pauses longer than a regular caller. A per-deployment p50 of observed "user finished thinking" pauses is a
 * better default than one global number.
 *
 * This module is the pure calculator — it takes a list of observed
 * pauses (caller-last-word → next-caller-utterance) for one deployment
 * and returns a clamped recommended maxDelay. A separate periodic job
 * can pull the observations from call logs and write the recommendation
 * back into the agent config. That job is deployment infra, not core.
 *
 * Bounds are hard-coded (1500-3000ms) because the rule is "we don't
 * ship endpointing outside that range, ever" — moving it to config
 * would let a misconfigured deployment ship a 300ms or 8000ms value,
 * which we've seen bite in production.
 */
const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 3000;

/** Default when we don't have enough samples — matches LiveKit ship value. */
const DEFAULT_DELAY_MS = 2000;

/** Minimum samples needed before we trust the distribution. */
const MIN_SAMPLES = 30;

export interface TuneInput {
  /** Observed inter-utterance pauses in ms. Values ≤ 0 are dropped. */
  pausesMs: readonly number[];
  /** Override for testing. */
  defaultMs?: number;
  /** Override the sample floor — only for tests. */
  minSamples?: number;
}

export interface TuneResult {
  /** Recommended maxDelay in ms, clamped to [MIN_DELAY_MS, MAX_DELAY_MS]. */
  recommendedMs: number;
  /** How many valid samples informed the result. */
  sampleCount: number;
  /** Un-clamped p50 before bounds — for observability. */
  rawP50Ms: number;
  /** True when we fell back to default (too few samples). */
  usedDefault: boolean;
}

/**
 * p50 of a number array. Not a streaming quantile — input is already
 * the full per-call distribution, so we sort and pick the middle. For
 * even lengths we return the lower middle (conservative — biases toward
 * a tighter endpoint, not a laggier one). Pure, allocation-light.
 */
export function p50(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Lower-middle for even lengths: for [1,2,3,4] returns 2, not 2.5.
  // Biases recommendations tighter, which is the safer drift — a call
  // that feels snappy is recoverable; a call that feels laggy isn't.
  const idx = Math.floor((sorted.length - 1) / 2);
  return sorted[idx] ?? 0;
}

/**
 * Compute a recommended per-deployment `endpointing.maxDelay`.
 *
 * Algorithm:
 *   1. Filter out non-positive/NaN samples (STT glitches, 0-ms races).
 *   2. If `< minSamples` remain, return default.
 *   3. Compute p50.
 *   4. Clamp to [MIN_DELAY_MS, MAX_DELAY_MS].
 */
export function computeRecommendedMaxDelay(input: TuneInput): TuneResult {
  const defaultMs = input.defaultMs ?? DEFAULT_DELAY_MS;
  const minSamples = input.minSamples ?? MIN_SAMPLES;

  const valid = input.pausesMs.filter((v) => Number.isFinite(v) && v > 0);

  if (valid.length < minSamples) {
    return {
      recommendedMs: clamp(defaultMs),
      sampleCount: valid.length,
      rawP50Ms: 0,
      usedDefault: true,
    };
  }

  const raw = p50(valid);
  return {
    recommendedMs: clamp(raw),
    sampleCount: valid.length,
    rawP50Ms: raw,
    usedDefault: false,
  };
}

function clamp(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_DELAY_MS;
  if (ms < MIN_DELAY_MS) return MIN_DELAY_MS;
  if (ms > MAX_DELAY_MS) return MAX_DELAY_MS;
  return Math.round(ms);
}

export const ENDPOINTING_BOUNDS = {
  minMs: MIN_DELAY_MS,
  maxMs: MAX_DELAY_MS,
  defaultMs: DEFAULT_DELAY_MS,
  minSamples: MIN_SAMPLES,
} as const;

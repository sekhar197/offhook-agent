/**
 * Semantic-interruption classifier.
 *
 * LiveKit's built-in interruption gate is duration + word-count based
 * (`interruption.minDuration`, `minWords`). That's fine for cutting
 * off the agent when a caller actually says something, but it fires
 * on any audio — a cough, a dog barking picked up as "uhh", a side
 * conversation. The result reads as twitchy agent behavior:
 * half-sentences, premature restarts.
 *
 * This helper is a secondary, post-transcript gate. Callers use it to
 * decide whether an incoming interim/final transcript should be
 * treated as an interruption worth acting on (re-engagement, debounce
 * override) or suppressed as noise.
 *
 * Decision rules (in priority order):
 *   1. < MIN_CHARS   → no (too short to be meaningful — likely STT
 *                       hallucination or word-fragment noise)
 *   2. Contains a known interruption intent phrase anywhere
 *                    → yes (explicit "wait" / "hold on" / "actually" /
 *                       "no no" / "stop" / "sorry, but")
 *   3. Ends with a question mark → yes (questions interrupt)
 *   4. Starts with a WH-question word or "is"/"are"/"can"/"do"/"does"
 *                    → yes (interrogative opener)
 *   5. Otherwise → no (likely a continuation, acknowledgment, or noise)
 *
 * The thresholds and keyword list are intentionally conservative. It's
 * better to miss a few real interruptions (caller repeats themselves)
 * than to falsely interrupt on every "yeah" / "mm-hmm" / "uh".
 *
 * Pure function — no LiveKit deps — so callers can wire it from the
 * `UserInputTranscribed` handler without pulling the whole entry.ts
 * into tests.
 */

const MIN_CHARS = 8;

const INTENT_PHRASES: readonly string[] = [
  'wait',
  'hold on',
  'actually',
  'stop',
  'no no',
  'nope',
  'sorry, but',
  'hang on',
  'let me',
  'excuse me',
  'forget it',
  'never mind',
  'cancel that',
];

const QUESTION_OPENERS: readonly string[] = [
  'what',
  'where',
  'when',
  'why',
  'who',
  'how',
  'which',
  'is ',
  'are ',
  'can ',
  'could ',
  'do ',
  'does ',
  'did ',
  'will ',
  'would ',
  'should ',
];

/**
 * Classify a transcript fragment as an interruption or not.
 *
 * Input should be the caller's utterance text (interim or final).
 * Whitespace is normalized before matching. Returns true only when
 * the fragment is confidently an interruption by the rules above.
 */
export function isLikelyInterruption(text: string): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  if (normalized.length < MIN_CHARS) return false;

  for (const phrase of INTENT_PHRASES) {
    if (normalized.includes(phrase)) return true;
  }

  if (normalized.endsWith('?')) return true;

  for (const opener of QUESTION_OPENERS) {
    if (normalized.startsWith(opener)) return true;
  }

  return false;
}

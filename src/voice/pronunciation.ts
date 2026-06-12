/**
 * Per-deployment pronunciation overrides for the TTS pipeline.
 *
 * Phase 4 of the v10 human-feel plan. Cartesia tends to mangle names
 * that don't follow English phoneme patterns (Qigong → "chee-gong",
 * Nguyen → "win"). Each knowledge entry can
 * carry a `pronunciationHint` — this module turns
 * those hints into a text-stream transform that rewrites occurrences
 * of the canonical name to the hint before Cartesia sees it.
 *
 * Shape: { "qigong": "chee-gong", "nguyen": "win" }. Hints are
 * spoken-text (not IPA) because Cartesia's SSML support varies across
 * voices; a phonetic respelling is robust across the default voice
 * list we ship.
 *
 * Matching rules:
 *   - Case-insensitive.
 *   - Whole-word only (word boundaries on both sides) so "pho" inside
 *     "phone" isn't rewritten.
 *   - First-match wins when overrides overlap; callers build the map
 *     with no overlapping keys in practice.
 *
 * This helper is a PURE transform on a completed sentence. It
 * integrates with the naturalizer's sentence-buffered output — runs
 * AFTER naturalize so "going to qigong" → "gonna qigong" → "gonna
 * chee-gong".
 */

export type PhonemeMap = Readonly<Record<string, string>>;

/**
 * Build a phoneme override map from a list of named entries. Entries
 * without a pronunciationHint are skipped. Duplicate names (unusual
 * but possible with multi-size listings) keep the first hint —
 * subsequent duplicates are ignored, matching "first match wins".
 */
export function buildPhonemeMap(
  items: ReadonlyArray<{ name: string; pronunciationHint?: string | null }>,
): PhonemeMap {
  const out: Record<string, string> = {};
  for (const item of items) {
    const hint = item.pronunciationHint?.trim();
    if (!hint || !item.name) continue;
    const key = item.name.trim().toLowerCase();
    if (!key) continue;
    // First writer wins — intentional, see module docstring.
    if (!(key in out)) out[key] = hint;
  }
  return out;
}

/**
 * Escape regex metacharacters so entry names containing `()` or `+` or
 * `.` can still be safely compiled into a pattern. Entry names are user
 * content so we can't assume they're regex-clean.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply the map to a chunk of already-sentence-buffered text. Returns
 * the transformed text. Safe to call with an empty map (no-op).
 *
 * Word-boundary matching uses `\b`, which in JS is ASCII-aware — for
 * non-Latin names (e.g. Hindi script) the boundaries may not fire as
 * expected. That's acceptable because Cartesia voices are English-
 * primary and the hints are intended for English-script entry names.
 */
export function applyPronunciationOverrides(text: string, map: PhonemeMap): string {
  const keys = Object.keys(map);
  if (keys.length === 0 || !text) return text;

  // Compile one OR'd pattern so we scan the input once regardless of
  // map size. Sorting longest-first avoids a short key shadowing a
  // longer one that would otherwise also match ("pho" vs "pho ga").
  const sortedKeys = [...keys].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `\\b(?:${sortedKeys.map(escapeRegex).join('|')})\\b`,
    'gi',
  );

  return text.replace(pattern, (match) => {
    const hit = map[match.toLowerCase()];
    return hit ?? match;
  });
}

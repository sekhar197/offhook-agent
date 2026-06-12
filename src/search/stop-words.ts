/**
 * Shared stop word list for search and resolver layers.
 *
 * IMPORTANT: Only true grammatical function words belong here. Do NOT add
 * domain-meaningful modifiers like "special", "house", "fresh", "large",
 * "small" — entry names legitimately contain them ("House Special",
 * "Large Conference Room").
 */
export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'that', 'this', 'have', 'has',
  'can', 'could', 'would', 'should', 'i', 'you', 'we', 'they', 'some',
  'what', 'like', 'want', 'get', 'me', 'us', 'do', 'does', 'please',
  'our', 'your', 'been', 'will', 'each', 'also', 'just', 'not', 'are',
  'was', 'were', 'be', 'am', 'its', 'my', 'so', 'if', 'no', 'yes',
]);

export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word);
}

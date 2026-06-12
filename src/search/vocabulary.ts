/**
 * Vocabulary helpers — category/alias resolution over a config-injected
 * SearchVocabulary. The core has NO domain terms; deployments supply their
 * own synonym/alias maps via agent config (see examples/).
 */

import type { KnowledgeEntry, SearchVocabulary } from '../types.js';

/** Default "show me what's featured" query words. Overridable per-deployment
 *  via vocabulary.highlightKeywords. */
export const DEFAULT_HIGHLIGHT_KEYWORDS = [
  'special', 'specials', 'deal', 'deals', 'daily', "today's", 'featured', 'popular',
];

/**
 * Singularize a word: alias map first (curated variants beat heuristics),
 * then simple English plural rules.
 */
export function singularize(word: string, vocabulary: SearchVocabulary): string {
  const alias = vocabulary.aliases[word];
  if (alias) return alias;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Does a free-form query phrase resolve to a canonical category key?
 * Returns the canonical (e.g. `billing`, `scheduling`) or null.
 * Pure function over vocabulary.categorySynonyms — no hardcoding.
 */
export function inferCanonicalCategory(
  query: string,
  vocabulary: SearchVocabulary,
): string | null {
  const normalized = (query || '').toLowerCase().trim();
  if (!normalized) return null;
  const singular = singularize(normalized, vocabulary);
  for (const [canonical, synonyms] of Object.entries(vocabulary.categorySynonyms)) {
    if (synonyms.includes(normalized) || synonyms.includes(singular)) return canonical;
  }
  // Multi-word fallback: any query token resolves?
  for (const w of normalized.split(/\s+/)) {
    const ws = singularize(w, vocabulary);
    for (const [canonical, synonyms] of Object.entries(vocabulary.categorySynonyms)) {
      if (synonyms.includes(w) || synonyms.includes(ws)) return canonical;
    }
  }
  return null;
}

/**
 * Does a knowledge entry belong to the given canonical category? Looks at the
 * entry's own category string (substring + singularize) against the canonical
 * synonym set.
 */
export function entryMatchesCanonical(
  entry: KnowledgeEntry,
  canonical: string,
  vocabulary: SearchVocabulary,
): boolean {
  const synonyms = vocabulary.categorySynonyms[canonical] || [canonical];
  const catLower = (entry.category || '').toLowerCase();
  if (!catLower) return false;
  const catSingular = singularize(catLower, vocabulary);
  return synonyms.some((s) => catLower.includes(s) || catSingular.includes(s));
}

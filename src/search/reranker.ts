/**
 * Lightweight reranker over fused search results. Boosts exact/prefix name
 * matches, token overlap, category intent, and config-injected attribute
 * signals (e.g. dietary intent) — scaled to the result-set score range so
 * boosts never overwhelm the upstream RRF/BM25 signal.
 */

import type { SearchResult } from './hybrid-search.js';
import type { SearchVocabulary } from '../types.js';
import { EMPTY_VOCABULARY } from '../types.js';
import { inferCanonicalCategory, entryMatchesCanonical } from './vocabulary.js';

function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export interface RerankOptions {
  /** Caller is browsing a known canonical category (e.g. `dessert`).
   * Entries in that category get a category-intent boost. Sourced from
   * session memory — never hardcoded. */
  activeCategory?: string | null;
  /** Domain vocabulary; attributeSignals drive intent boosts. */
  vocabulary?: SearchVocabulary;
}

export function rerankResults(
  query: string,
  results: SearchResult[],
  options?: RerankOptions,
): SearchResult[] {
  if (results.length <= 1) return results;

  const vocabulary = options?.vocabulary ?? EMPTY_VOCABULARY;
  const qTokens = new Set(tokenize(query));
  const lowerQuery = query.toLowerCase();

  // Scale boosts relative to actual score range so reranker adjustments
  // don't overwhelm the upstream RRF/BM25 signal.
  const maxScore = results[0].score;
  const minScore = results[results.length - 1].score;
  const scoreRange = Math.max(maxScore - minScore, maxScore * 0.1, 0.001);

  // Detect attribute intent (e.g. dietary) from query via injected signals
  const activeSignals = vocabulary.attributeSignals.filter(
    d => d.keywords.some(k => lowerQuery.includes(k)),
  );

  // Category-intent: prefer `activeCategory` from memory when present;
  // otherwise try to infer intent from the query itself.
  const intentCanonical =
    options?.activeCategory ?? inferCanonicalCategory(query, vocabulary);

  const rescored = results.map((r, idx) => {
    const nameTokens = tokenize(r.item.name);
    const categoryTokens = tokenize(r.item.category || '');

    let overlap = 0;
    for (const t of nameTokens) if (qTokens.has(t)) overlap += 2;
    for (const t of categoryTokens) if (qTokens.has(t)) overlap += 1;

    const exactNameBoost = r.item.name.toLowerCase() === query.toLowerCase().trim() ? scoreRange * 2.0 : 0;
    const prefixBoost = r.item.name.toLowerCase().startsWith(query.toLowerCase().trim()) ? scoreRange * 1.0 : 0;

    let attributeBoost = 0;
    if (activeSignals.length > 0) {
      const searchableText = `${r.item.name} ${r.item.description || ''} ${r.item.category || ''}`;
      for (const d of activeSignals) {
        if (d.match.test(searchableText)) {
          attributeBoost += scoreRange * 0.3;
        }
      }
    }

    // Category-intent boost: when the caller's intent (active or inferred)
    // resolves to a canonical category and the entry belongs to it, push it
    // up. This is what keeps a "desserts" query from surfacing a main dish.
    const categoryIntentBoost =
      intentCanonical && entryMatchesCanonical(r.item, intentCanonical, vocabulary)
        ? scoreRange * 1.2
        : 0;

    const finalScore =
      r.score
      + overlap * (scoreRange * 0.05)
      + exactNameBoost
      + prefixBoost
      + attributeBoost
      + categoryIntentBoost
      - idx * 0.0001;
    return { ...r, score: finalScore };
  });

  return rescored.sort((a, b) => b.score - a.score);
}

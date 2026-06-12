/**
 * Hybrid Search
 *
 * Combines BM25 keyword search with local embedding similarity search,
 * using Reciprocal Rank Fusion (RRF) to merge results.
 *
 * This provides robust knowledge retrieval that handles:
 * - Exact keyword matches (BM25)
 * - Semantic/phonetic matches (embeddings)
 * - ASR transcription errors (embeddings catch similar entries)
 *
 * Domain vocabulary (category synonyms, aliases) is config-injected via
 * options.vocabulary — the core ships with an empty vocabulary.
 */

import { getQueryEmbedding, cosineSimilarity } from '../embeddings/index.js';
import type {
  KnowledgeEntry,
  EntryEmbedding,
  RetrievalStats,
  SearchVocabulary,
  TraceIds,
} from '../types.js';
import { EMPTY_VOCABULARY } from '../types.js';
import { traceLog } from '../trace.js';
import { rerankResults } from './reranker.js';
import { isStopWord } from './stop-words.js';
import {
  singularize,
  inferCanonicalCategory as inferCanonical,
  DEFAULT_HIGHLIGHT_KEYWORDS,
} from './vocabulary.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SearchResult {
  item: KnowledgeEntry;
  score: number;
  source: 'bm25' | 'embedding' | 'both';
}

export interface HybridSearchDiagnostics {
  durationMs: number;
  bm25Count: number;
  embeddingCount: number;
  topBm25Score: number;
  topEmbeddingScore: number;
  embeddingMode: 'used' | 'skipped' | 'timeout' | 'error';
  categoryFallbackUsed: boolean;
}

export interface HybridSearchOptions {
  /** Canonical category the caller is browsing (from memory). Boosts
   * matching-category entries during rerank. */
  activeCategory?: string | null;
  /** Domain vocabulary (synonyms/aliases/attribute signals). Defaults empty. */
  vocabulary?: SearchVocabulary;
  /** Per-session retrieval stats to increment. */
  stats?: RetrievalStats;
  /** Trace correlation ids. */
  trace?: TraceIds;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const SEARCH_CONFIG = {
  /** Minimum BM25 score to include in results */
  bm25MinScore: 0.1,

  /** Minimum embedding similarity to include in results */
  embeddingMinScore: 0.3,

  /** RRF constant (higher = more even weighting) */
  rrfK: 60,

  /** Maximum results per search type */
  maxPerSource: 10,

  /** Maximum final results after fusion.
   * Sized so 2-3 rounds of pagination (caller asking "more options") via
   * exclude_ids have headroom before the scored pool runs dry. */
  maxFinalResults: 10,

  /** Field-weighted BM25: name matches dominate, category is secondary,
   * description is weakest. Values chosen so a pure-name match still
   * lands under the `includes(normalized)` 0.9 fast path, and a
   * pure-description match clears the 0.1 floor. */
  fieldWeights: {
    name: 1.0,
    category: 0.4,
    description: 0.2,
  },
};

// =============================================================================
// BM25 KEYWORD SEARCH
// =============================================================================

/**
 * Simple BM25-style keyword search.
 * Fast and effective for exact/partial text matches.
 */
function bm25Search(
  query: string,
  entries: KnowledgeEntry[],
  vocabulary: SearchVocabulary,
): SearchResult[] {
  const normalized = query.toLowerCase().trim();
  const queryWords = normalized
    .split(/\s+/)
    .filter(w => w.length > 2 && !isStopWord(w));

  if (queryWords.length === 0) {
    // If all words are short/stopwords, use full query
    const results: SearchResult[] = [];
    for (const item of entries) {
      const nameNorm = item.name.toLowerCase();
      if (nameNorm.includes(normalized)) {
        results.push({ item, score: 0.7, source: 'bm25' });
      }
    }
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, SEARCH_CONFIG.maxPerSource);
  }

  return entries.map(item => {
    let score = 0;

    // Exact name match (highest score)
    if (item.name.toLowerCase() === normalized) {
      score = 1.0;
    }
    // Name contains full query
    else if (item.name.toLowerCase().includes(normalized)) {
      score = 0.9;
    }
    // Name starts with query
    else if (item.name.toLowerCase().startsWith(normalized)) {
      score = 0.85;
    }
    // Field-weighted word overlap: credit each matched query word with the
    // weight of the *best* field it appears in (name > category > description).
    // A pure-name match of every query word hits the 0.8 ceiling; a pure-
    // description match scales down proportionally.
    else {
      const nameText = item.name.toLowerCase();
      const categoryText = (item.category || '').toLowerCase();
      const descText = (item.description || '').toLowerCase();
      const { name: NW, category: CW, description: DW } = SEARCH_CONFIG.fieldWeights;

      let weightedSum = 0;
      let matchedCount = 0;
      for (const w of queryWords) {
        const fw = Math.max(
          matchesField(w, nameText, vocabulary) ? NW : 0,
          matchesField(w, categoryText, vocabulary) ? CW : 0,
          matchesField(w, descText, vocabulary) ? DW : 0,
        );
        if (fw > 0) {
          weightedSum += fw;
          matchedCount++;
        }
      }
      if (matchedCount > 0) {
        const maxPossible = queryWords.length * NW;
        score = (weightedSum / maxPossible) * 0.8;
      }
    }

    return { item, score, source: 'bm25' as const };
  })
  .filter(r => r.score > SEARCH_CONFIG.bm25MinScore)
  .sort((a, b) => b.score - a.score)
  .slice(0, SEARCH_CONFIG.maxPerSource);
}

/**
 * Does a query word match a single field's text? Substring + singularize +
 * first-char-anchored fuzzy (bounded edit distance). Returns true on any hit.
 */
function matchesField(word: string, fieldText: string, vocabulary: SearchVocabulary): boolean {
  if (!fieldText) return false;
  if (fieldText.includes(word)) return true;
  const ws = singularize(word, vocabulary);
  if (ws !== word && fieldText.includes(ws)) return true;
  if (word.length >= 4) {
    const maxDist = word.length <= 6 ? 1 : 2;
    for (const t of fieldText.split(/\s+/)) {
      if (t.length >= 4 && t[0] === word[0] && editDistance(word, t, maxDist) <= maxDist) return true;
    }
  }
  return false;
}

/**
 * Levenshtein edit distance (bounded: returns maxDist+1 early if exceeded).
 */
function editDistance(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const m = a.length;
  const n = b.length;
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    prev.set(curr);
  }
  return prev[n];
}

// =============================================================================
// CATEGORY FALLBACK (plural/synonym normalization via injected vocabulary)
// =============================================================================

function categoryFallbackSearch(
  query: string,
  entries: KnowledgeEntry[],
  vocabulary: SearchVocabulary,
): SearchResult[] {
  const normalized = query.toLowerCase().trim();
  const singular = singularize(normalized, vocabulary);

  // "Featured/specials" style queries — do a broader search
  const highlightKeywords = vocabulary.highlightKeywords ?? DEFAULT_HIGHLIGHT_KEYWORDS;
  const isHighlightQuery = highlightKeywords.some(k => normalized.includes(k));

  let matchedCanonical: string | null = null;
  for (const [canonical, synonyms] of Object.entries(vocabulary.categorySynonyms)) {
    if (synonyms.includes(normalized) || synonyms.includes(singular)) {
      matchedCanonical = canonical;
      break;
    }
  }

  if (!matchedCanonical && !isHighlightQuery) {
    // Try substring matching against actual category names in the knowledge base
    const uniqueCategories = [...new Set(entries.map(m => (m.category || '').toLowerCase()))];
    const catMatch = uniqueCategories.find(c => c.includes(normalized) || c.includes(singular));
    if (catMatch) {
      const results: SearchResult[] = entries
        .filter(item => (item.category || '').toLowerCase() === catMatch)
        .map(item => ({ item, score: 0.6, source: 'bm25' as const }));
      return results.slice(0, SEARCH_CONFIG.maxPerSource);
    }
    return [];
  }

  if (isHighlightQuery && !matchedCanonical) {
    // Look for entries flagged as featured in the actual knowledge base
    const highlighted = entries.filter(item => {
      const cat = (item.category || '').toLowerCase();
      const name = item.name.toLowerCase();
      const desc = (item.description || '').toLowerCase();
      return highlightKeywords.some(k =>
        cat.includes(k) || name.includes(k) || desc.includes(k),
      );
    });

    if (highlighted.length > 0) {
      return highlighted
        .map(item => ({ item, score: 0.6, source: 'bm25' as const }))
        .slice(0, SEARCH_CONFIG.maxPerSource);
    }

    return [];
  }

  const synonyms = vocabulary.categorySynonyms[matchedCanonical!] || [matchedCanonical!];
  const results: SearchResult[] = [];

  for (const item of entries) {
    const catLower = (item.category || '').toLowerCase();
    const nameLower = item.name.toLowerCase();
    const descLower = (item.description || '').toLowerCase();
    const catSingular = singularize(catLower, vocabulary);

    const matches = synonyms.some(s =>
      catLower.includes(s) || catSingular.includes(s) ||
      nameLower.includes(s) || descLower.includes(s)
    );
    if (matches) {
      results.push({ item, score: 0.6, source: 'bm25' });
    }
  }

  return results
    .sort((a, b) => a.item.name.localeCompare(b.item.name))
    .slice(0, SEARCH_CONFIG.maxPerSource);
}

// =============================================================================
// EMBEDDING SIMILARITY SEARCH
// =============================================================================

/**
 * Search the knowledge base using embedding similarity.
 * Catches semantic matches and handles ASR errors.
 */
async function embeddingSearch(
  query: string,
  entryEmbeddings: EntryEmbedding[],
  entries: KnowledgeEntry[],
): Promise<SearchResult[]> {
  if (!entryEmbeddings || entryEmbeddings.length === 0) {
    return [];
  }

  // Get query embedding (local inference by default)
  const queryVector = await getQueryEmbedding(query);

  if (!queryVector || queryVector.length === 0) {
    return [];
  }

  // Compute similarities for all entries
  const similarities: SearchResult[] = [];

  for (const me of entryEmbeddings) {
    if (!me.vector || me.vector.length === 0) continue;

    const similarity = cosineSimilarity(queryVector, me.vector);

    if (similarity > SEARCH_CONFIG.embeddingMinScore) {
      const item = entries.find(m => m.id === me.entryId);
      if (item) {
        similarities.push({
          item,
          score: similarity,
          source: 'embedding' as const
        });
      }
    }
  }

  // Sort by similarity and take top results
  similarities.sort((a, b) => b.score - a.score);
  return similarities.slice(0, SEARCH_CONFIG.maxPerSource);
}

// =============================================================================
// RECIPROCAL RANK FUSION
// =============================================================================

/**
 * Merge BM25 and embedding results using Reciprocal Rank Fusion.
 *
 * RRF formula: score(d) = Σ 1 / (k + rank(d))
 */
function reciprocalRankFusion(
  bm25Results: SearchResult[],
  embeddingResults: SearchResult[]
): SearchResult[] {
  const scores = new Map<string, {
    item: KnowledgeEntry;
    score: number;
    sources: ('bm25' | 'embedding')[];
    bm25Score?: number;
    embeddingScore?: number;
  }>();

  // Score BM25 results
  bm25Results.forEach((r, rank) => {
    const id = r.item.id;
    const rrf = 1 / (rank + SEARCH_CONFIG.rrfK);
    const existing = scores.get(id);

    if (existing) {
      existing.score += rrf;
      existing.sources.push('bm25');
      existing.bm25Score = r.score;
    } else {
      scores.set(id, {
        item: r.item,
        score: rrf,
        sources: ['bm25'],
        bm25Score: r.score
      });
    }
  });

  // Score embedding results
  embeddingResults.forEach((r, rank) => {
    const id = r.item.id;
    const rrf = 1 / (rank + SEARCH_CONFIG.rrfK);
    const existing = scores.get(id);

    if (existing) {
      existing.score += rrf;
      existing.sources.push('embedding');
      existing.embeddingScore = r.score;
    } else {
      scores.set(id, {
        item: r.item,
        score: rrf,
        sources: ['embedding'],
        embeddingScore: r.score
      });
    }
  });

  // Sort by combined RRF score
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_CONFIG.maxFinalResults)
    .map(s => ({
      item: s.item,
      score: s.score,
      source: (s.sources.length > 1 ? 'both' : s.sources[0]) as 'bm25' | 'embedding' | 'both'
    }));
}

// =============================================================================
// MAIN HYBRID SEARCH FUNCTION
// =============================================================================

/**
 * Perform hybrid search combining BM25 and embedding similarity.
 *
 * @param query - User search query (can contain ASR errors)
 * @param entries - Full knowledge entry array
 * @param entryEmbeddings - Pre-computed embeddings for entries
 * @returns Ranked search results with source attribution + diagnostics
 */
export async function hybridSearchWithDiagnostics(
  query: string,
  entries: KnowledgeEntry[],
  entryEmbeddings: EntryEmbedding[],
  options?: HybridSearchOptions,
): Promise<{ results: SearchResult[]; diagnostics: HybridSearchDiagnostics }> {
  const startTime = Date.now();
  const vocabulary = options?.vocabulary ?? EMPTY_VOCABULARY;
  const stats = options?.stats;
  const trace = options?.trace;
  stats && (stats.retrievalQueries += 1);

  const emptyDiagnostics = (): HybridSearchDiagnostics => ({
    durationMs: Date.now() - startTime,
    bm25Count: 0,
    embeddingCount: 0,
    topBm25Score: 0,
    topEmbeddingScore: 0,
    embeddingMode: 'skipped',
    categoryFallbackUsed: false,
  });

  if (!query || query.trim().length === 0) {
    return { results: [], diagnostics: emptyDiagnostics() };
  }

  if (!entries || entries.length === 0) {
    return { results: [], diagnostics: emptyDiagnostics() };
  }

  // BM25 is cheap; run it first so we can skip expensive embeddings when confidence is high.
  let bm25Results = bm25Search(query, entries, vocabulary);

  // Category fallback: try category synonym matching when BM25 found nothing
  // OR only returned weak fuzzy-only matches (score ≤ 0.4). Weak fuzzy hits
  // like "classes" -> "Glasses Case" should not block the correct category result.
  // ALSO: when BM25 returned fewer than maxFinalResults and the query is a
  // category/browse term, union-supplement with category matches so
  // pagination ("more options") has headroom via exclude_ids.
  let categoryFallbackUsed = false;
  const bm25AllWeak = bm25Results.length > 0 && bm25Results.every(r => r.score <= 0.4);
  if (bm25Results.length === 0 || bm25AllWeak) {
    const catResults = categoryFallbackSearch(query, entries, vocabulary);
    if (catResults.length > 0) {
      bm25Results = catResults;
      categoryFallbackUsed = true;
    }
  } else if (bm25Results.length < SEARCH_CONFIG.maxFinalResults) {
    // Union-supplement: keep strong BM25 hits but add category matches the
    // caller might want on a "more options" turn. Dedup by entry id.
    const catResults = categoryFallbackSearch(query, entries, vocabulary);
    if (catResults.length > 0) {
      const seen = new Set(bm25Results.map(r => r.item.id));
      const supplemental = catResults
        .filter(r => !seen.has(r.item.id))
        // slightly discount supplemental hits so strong BM25 matches rank first
        .map(r => ({ ...r, score: r.score * 0.8 }));
      if (supplemental.length > 0) {
        bm25Results = [...bm25Results, ...supplemental];
      }
    }
  }

  const topBm25Score = bm25Results[0]?.score ?? 0;
  // Run embeddings when BM25 results are weak, regardless of count —
  // multiple weak keyword matches shouldn't block semantic rescue.
  // Skip when BM25 is genuinely confident (>= 0.7 high-confidence fast-path),
  // category fallback matched, or embeddings have repeatedly timed out (circuit breaker).
  const embeddingCircuitOpen = stats && stats.retrievalEmbeddingTimeouts >= 3;
  if (embeddingCircuitOpen) {
    stats!.retrievalEmbeddingSkipped += 1;
  }
  const shouldRunEmbedding =
    !!entryEmbeddings?.length &&
    !categoryFallbackUsed &&
    !embeddingCircuitOpen &&
    topBm25Score < 0.7;

  let embeddingResults: SearchResult[] = [];
  let embeddingMode = 'skipped';

  if (shouldRunEmbedding) {
    const EMBEDDING_TIMEOUT_MS = 500;
    try {
      embeddingResults = await Promise.race([
        embeddingSearch(query, entryEmbeddings, entries),
        new Promise<SearchResult[]>((resolve) =>
          setTimeout(() => {
            embeddingMode = 'timeout';
            resolve([]);
          }, EMBEDDING_TIMEOUT_MS),
        ),
      ]);
      if (embeddingMode !== 'timeout') {
        embeddingMode = 'used';
        stats && (stats.retrievalEmbeddingUsed += 1);
      } else {
        stats && (stats.retrievalEmbeddingTimeouts += 1);
      }
    } catch {
      embeddingMode = 'error';
      embeddingResults = [];
      stats && (stats.retrievalEmbeddingTimeouts += 1);
    }
  } else {
    stats && (stats.retrievalEmbeddingSkipped += 1);
  }

  // When BM25 found nothing, filter embedding results by similarity.
  // Use a moderate gate (0.48) to rescue ASR-mangled entry names while
  // still rejecting unrelated noise.
  const STRICT_EMBEDDING_GATE = 0.48;
  if (bm25Results.length === 0 && embeddingResults.length > 0) {
    embeddingResults = embeddingResults.filter(r => r.score >= STRICT_EMBEDDING_GATE);
  }

  let results: SearchResult[];

  // If no embedding results, just use BM25
  if (embeddingResults.length === 0) {
    results = bm25Results.slice(0, SEARCH_CONFIG.maxFinalResults);
  }
  // If no BM25 results, just use embeddings (already gated above)
  else if (bm25Results.length === 0) {
    results = embeddingResults.slice(0, SEARCH_CONFIG.maxFinalResults);
  }
  // Merge with RRF
  else {
    results = reciprocalRankFusion(bm25Results, embeddingResults);
  }

  results = rerankResults(query, results, {
    activeCategory: options?.activeCategory ?? null,
    vocabulary,
  }).slice(0, SEARCH_CONFIG.maxFinalResults);

  const durationMs = Date.now() - startTime;
  stats && stats.retrievalLatencyMs.push(durationMs);
  if (stats && results.length === 0) {
    stats.retrievalEmptyResults += 1;
  }

  const topEmbeddingScore = embeddingResults[0]?.score ?? 0;

  traceLog('info', 'retrieval_result', {
    call_id: trace?.callId,
    correlation_id: trace?.correlationId,
    agent_id: trace?.agentId,
  }, {
    query,
    duration_ms: durationMs,
    result_count: results.length,
    bm25_count: bm25Results.length,
    bm25_top_score: Number(topBm25Score.toFixed(4)),
    embedding_count: embeddingResults.length,
    embedding_top_score: Number(topEmbeddingScore.toFixed(4)),
    embedding_mode: embeddingMode,
    category_fallback_used: categoryFallbackUsed,
  });

  return {
    results,
    diagnostics: {
      durationMs,
      bm25Count: bm25Results.length,
      embeddingCount: embeddingResults.length,
      topBm25Score,
      topEmbeddingScore,
      embeddingMode: embeddingMode as HybridSearchDiagnostics['embeddingMode'],
      categoryFallbackUsed,
    },
  };
}

export async function hybridSearch(
  query: string,
  entries: KnowledgeEntry[],
  entryEmbeddings: EntryEmbedding[],
  options?: HybridSearchOptions,
): Promise<SearchResult[]> {
  const { results } = await hybridSearchWithDiagnostics(query, entries, entryEmbeddings, options);
  return results;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  bm25Search,
  embeddingSearch,
  reciprocalRankFusion,
};

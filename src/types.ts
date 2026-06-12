/**
 * offhook — core type definitions.
 *
 * KnowledgeEntry is the unit of retrievable knowledge: a thing the agent can
 * find, talk about, and act on. For a receptionist it's an FAQ entry or a
 * service; the entity model is deliberately domain-free — anything
 * domain-specific (price, SKU, duration) lives in `metadata`.
 */

// =============================================================================
// KNOWLEDGE
// =============================================================================

export interface KnowledgeEntry {
  id: string;
  name: string;
  /** Grouping used for category browsing and rerank boosts. */
  category: string;
  description?: string;
  available?: boolean;
  /** Free-form pronunciation hint the LLM can use when reading the entry
   *  aloud — helps non-English names read naturally in an English voice. */
  pronunciationHint?: string;
  /** Domain-specific fields (price, duration, SKU, ...). Opaque to the core. */
  metadata?: Record<string, unknown>;
}

/** Pre-computed embedding for a knowledge entry (hybrid search). */
export interface EntryEmbedding {
  entryId: string;
  name: string;
  category: string;
  vector: number[];
}

// =============================================================================
// SEARCH VOCABULARY (config-injected; never hardcoded in the core)
// =============================================================================

/** Query-intent signal: when a query contains one of `keywords`, entries whose
 *  searchable text matches `match` get a rerank boost. (e.g. "vegetarian"). */
export interface AttributeSignal {
  keywords: string[];
  match: RegExp;
}

/**
 * Domain vocabulary for search, loaded from agent config / knowledge metadata.
 * The core ships with an EMPTY vocabulary — domain synonym/alias maps belong
 * in the deployment's config (see examples/), never in this codebase.
 */
export interface SearchVocabulary {
  /** canonical category -> synonyms (e.g. billing -> [invoices, payments]). */
  categorySynonyms: Record<string, string[]>;
  /** misheard/variant form -> canonical term (ASR/plural aliases). */
  aliases: Record<string, string>;
  /** dietary/attribute intent boosts for the reranker (e.g. accessibility, urgency). */
  attributeSignals: AttributeSignal[];
  /** Query words that mean "show me what's featured" (default below). */
  highlightKeywords?: string[];
}

export const EMPTY_VOCABULARY: SearchVocabulary = {
  categorySynonyms: {},
  aliases: {},
  attributeSignals: [],
};

// =============================================================================
// RETRIEVAL STATS (per-session observability slice used by search)
// =============================================================================

export interface RetrievalStats {
  retrievalQueries: number;
  retrievalEmptyResults: number;
  retrievalEmbeddingUsed: number;
  retrievalEmbeddingTimeouts: number;
  retrievalEmbeddingSkipped: number;
  retrievalLatencyMs: number[];
}

export function newRetrievalStats(): RetrievalStats {
  return {
    retrievalQueries: 0,
    retrievalEmptyResults: 0,
    retrievalEmbeddingUsed: 0,
    retrievalEmbeddingTimeouts: 0,
    retrievalEmbeddingSkipped: 0,
    retrievalLatencyMs: [],
  };
}

// =============================================================================
// CALLER / SESSION FRAGMENTS (grown during extraction)
// =============================================================================

export interface CallerInfo {
  name?: string;
  phone?: string;
}

export interface TraceIds {
  callId?: string;
  correlationId?: string;
  agentId?: string;
}

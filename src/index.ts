/**
 * offhook — public API surface.
 *
 * Modules are exported here as they land during the v0.1 extraction.
 */

export const VERSION = '0.1.0-dev';

// Core types
export type {
  KnowledgeEntry,
  EntryEmbedding,
  SearchVocabulary,
  AttributeSignal,
  RetrievalStats,
  CallerInfo,
  TraceIds,
} from './types.js';
export { EMPTY_VOCABULARY, newRetrievalStats } from './types.js';

// Knowledge retrieval
export {
  hybridSearch,
  hybridSearchWithDiagnostics,
  type SearchResult,
  type HybridSearchDiagnostics,
  type HybridSearchOptions,
} from './search/hybrid-search.js';
export { rerankResults, type RerankOptions } from './search/reranker.js';
export {
  singularize,
  inferCanonicalCategory,
  entryMatchesCanonical,
} from './search/vocabulary.js';

// Conversation phases
export {
  derivePhase,
  DEFAULT_PHASE_TOOLS,
  type ConversationPhase,
  type PhaseSignals,
} from './state/state-machine.js';

// Embeddings
export {
  warmupEmbeddings,
  getQueryEmbedding,
  getPassageEmbedding,
  getPassageEmbeddings,
  cosineSimilarity,
  getEmbeddingProvider,
  getEmbeddingDimensions,
} from './embeddings/index.js';

// Entity resolution + ASR correction
export {
  buildEntityIndex,
  resolveEntityCandidates,
  normalizeForLookup,
  levenshtein,
  type EntityIndex,
  type EntityIndexOptions,
  type ResolverCandidate,
} from './resolver/entity-index.js';
export {
  englishMetaphone,
  registerPhoneticBackend,
  getPhoneticBackend,
  type PhoneticBackend,
} from './resolver/phonetic.js';
export {
  correctAsrTranscript,
  type AsrCorrectionResult,
} from './asr/asr-correction.js';

// Voice human-feel layer
export {
  computeRecommendedMaxDelay,
  p50,
  ENDPOINTING_BOUNDS,
  type TuneInput,
  type TuneResult,
} from './voice/endpointing-tuner.js';
export { isLikelyInterruption } from './voice/semantic-interrupt.js';
export {
  shouldStartSpeculation,
  shouldKeepSpeculation,
  tokenOverlap,
  type SpeculationStartOpts,
  type SpeculationKeepOpts,
} from './voice/interim-speculation.js';
export {
  buildPhonemeMap,
  applyPronunciationOverrides,
  type PhonemeMap,
} from './voice/pronunciation.js';
export { createNaturalizer } from './voice/text-naturalize.js';

// Tracing
export { traceLog, type TraceLevel } from './trace.js';

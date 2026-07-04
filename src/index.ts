/**
 * offhook-agent — public API surface.
 *
 * Modules are exported here as they land during the v0.1 extraction.
 */

export const VERSION = '0.1.1';

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

// Config (agent.yaml)
export {
  AgentConfigSchema,
  parseAgentConfig,
  loadAgentConfig,
  toAgentIdentity,
  ConfigError,
  type AgentConfig,
  type AgentIdentity,
} from './config/agent-config.js';

// Persona / prompt system
export {
  buildMicroPrompt,
  baseIdentity,
  formatCompactKnowledge,
  isKnowledgeInContext,
  type PromptContext,
  type WorkingSetItem,
  type OfferedEntry,
} from './prompts/micro-prompts.js';

// Knowledge folder loading
export {
  loadKnowledgeFolder,
  parseMarkdownKnowledge,
  parseCatalogKnowledge,
  KnowledgeError,
} from './knowledge/loader.js';

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

// Tools
export {
  ToolRegistry,
  type ToolDefinition,
  type ToolContext,
  type ToolResultPayload,
  type ToolParameters,
} from './tools/registry.js';
export {
  BUILTIN_TOOLS,
  answerFromKnowledge,
  takeMessage,
  sendSummary,
  transferToHuman,
  endCall,
} from './tools/builtins.js';
export {
  checkCallerSafe,
  assertCallerSafe,
  BANNED_SUBSTRINGS,
  MAX_MESSAGE_CHARS,
} from './tools/caller-safe.js';

// LLM provider layer (OpenAI-compatible: hosted + local)
export {
  resolveLlm,
  resolveApiKey,
  LLM_PROVIDER_PRESETS,
  LlmConfigError,
  type LlmProviderName,
  type ResolvedLlm,
  type LlmConfigInput,
} from './llm/provider.js';
export { createLlmClient, chatStream, type LlmClient } from './llm/client.js';

// Action executor
export {
  executeAction,
  classifyError,
  isRetryable,
  type ActionRequest,
  type ActionResult,
  type ActionErrorReason,
} from './actions/executor.js';

// Voice provider registries (generic STT/TTS/VAD/LLM/realtime over LiveKit)
export {
  resolveStt,
  resolveTts,
  resolveProviderKey,
  createStt,
  createTts,
  createVad,
  createVoiceLlm,
  createRealtimeModel,
  STT_PRESETS,
  TTS_PRESETS,
  VoiceProviderError,
  type SttProviderName,
  type TtsProviderName,
  type ResolvedStt,
  type ResolvedTts,
  type RealtimeSpec,
} from './voice/providers/index.js';

// Tracing
export { traceLog, type TraceLevel } from './trace.js';

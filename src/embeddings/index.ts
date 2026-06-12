/**
 * Embeddings Module — Provider Switcher
 *
 * Routes all embedding calls to the active provider based on the
 * EMBEDDING_PROVIDER env var ('local' default | 'openai'). Consumers import
 * from this file and never reference a specific provider directly.
 *
 * Provider parity rule: passage and query embeddings MUST come from the same
 * provider/model. Switching providers requires re-indexing the knowledge base.
 */

import * as local from './local.js';
import * as openai from './openai.js';

const PROVIDER = (process.env.EMBEDDING_PROVIDER || 'local') as 'local' | 'openai';

const isOpenAI = PROVIDER === 'openai';

if (isOpenAI && process.env.NODE_ENV === 'production') {
  console.warn(`[Embeddings] WARNING: Using OpenAI embeddings in production adds ~100-300ms latency per query. ` +
    `Set EMBEDDING_PROVIDER=local or remove the env var to use local inference. ` +
    `Ensure passage embeddings were also generated with the same provider.`);
}

// =============================================================================
// WARMUP
// =============================================================================

export async function warmupEmbeddings(): Promise<void> {
  if (isOpenAI) {
    return openai.warmupOpenAIEmbeddings();
  }
  return local.warmupLocalEmbeddings();
}

// =============================================================================
// EMBEDDING GENERATION
// =============================================================================

export async function getQueryEmbedding(text: string): Promise<number[]> {
  if (isOpenAI) return openai.getQueryEmbedding(text);
  return local.getQueryEmbedding(text);
}

export async function getPassageEmbeddings(texts: string[]): Promise<number[][]> {
  if (isOpenAI) return openai.getPassageEmbeddings(texts);
  return local.getPassageEmbeddings(texts);
}

export async function getPassageEmbedding(text: string): Promise<number[]> {
  if (isOpenAI) return openai.getPassageEmbedding(text);
  return local.getPassageEmbedding(text);
}

// =============================================================================
// UTILITIES
// =============================================================================

export function isEmbeddingsReady(): boolean {
  if (isOpenAI) return openai.isOpenAIEmbeddingsReady();
  return local.isLocalEmbeddingsReady();
}

export function getEmbeddingDimensions(): number {
  if (isOpenAI) return openai.getEmbeddingDimensions();
  return local.getEmbeddingDimensions();
}

export function getModelName(): string {
  if (isOpenAI) return openai.getModelName();
  return 'bge-small-en-v1.5';
}

export function getEmbeddingProvider(): 'local' | 'openai' {
  return PROVIDER;
}

// cosineSimilarity is pure math — always from local module
export { cosineSimilarity } from './local.js';

/**
 * Local Embeddings Provider (FastEmbed)
 *
 * Local ONNX-based embedding generation using the BGE-small model.
 * Eliminates network latency for embedding generation (20-40ms vs 200-300ms
 * cloud) and requires no API key — the default provider.
 */

import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
// fastembed is imported lazily inside warmup so importing the offhook-agent core
// never loads native ONNX bindings unless local embeddings are actually used.
import type { FlagEmbedding } from 'fastembed';

// =============================================================================
// STATE
// =============================================================================

let embedder: FlagEmbedding | null = null;
let isWarmedUp = false;
let warmupPromise: Promise<void> | null = null;

// =============================================================================
// CONFIGURATION
// =============================================================================

const EMBEDDING_CONFIG = {
  /** Dimension of embeddings (BGE-small produces 384-dim vectors) */
  dimensions: 384,

  /** Cache directory for model files */
  cacheDir: process.env.OFFHOOK_AGENT_MODEL_CACHE_DIR
    || join(process.cwd(), '.cache', 'fastembed'),
} as const;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Warm up the local embedding model.
 * Should be called at startup before accepting calls.
 * This loads the ONNX model into memory (~67MB; first run downloads it).
 */
export async function warmupLocalEmbeddings(): Promise<void> {
  if (isWarmedUp) return;

  if (warmupPromise) {
    await warmupPromise;
    return;
  }

  warmupPromise = (async () => {
    console.log('[LocalEmbed] Loading BGE-small model...');
    const startTime = Date.now();

    try {
      if (!existsSync(EMBEDDING_CONFIG.cacheDir)) {
        console.log(`[LocalEmbed] Creating cache directory: ${EMBEDDING_CONFIG.cacheDir}`);
        mkdirSync(EMBEDDING_CONFIG.cacheDir, { recursive: true });
      }

      const { EmbeddingModel, FlagEmbedding } = await import('fastembed');
      embedder = await FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
        cacheDir: EMBEDDING_CONFIG.cacheDir,
      });

      // Warm up with a test query to ensure model is fully loaded
      await embedder.queryEmbed('warm up test');

      isWarmedUp = true;
      console.log(`[LocalEmbed] Model ready in ${Date.now() - startTime}ms`);
    } catch (error) {
      // Clear the promise so a subsequent call can retry instead of
      // re-throwing this stale rejection forever.
      warmupPromise = null;
      console.error('[LocalEmbed] Failed to load model:', error);
      throw error;
    }
  })();

  await warmupPromise;
}

// =============================================================================
// EMBEDDING GENERATION
// =============================================================================

/**
 * Generate embedding for a single query. Optimized for short user queries.
 */
export async function getQueryEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    await warmupLocalEmbeddings();
  }

  if (!embedder) {
    throw new Error('[LocalEmbed] Embedder not initialized');
  }

  try {
    const embedding = await embedder.queryEmbed(text);

    if (!embedding || embedding.length === 0) {
      console.error('[LocalEmbed] Empty embedding returned for:', text);
      return [];
    }

    return Array.from(embedding);
  } catch (error) {
    console.error('[LocalEmbed] Query embedding error:', error);
    return [];
  }
}

/**
 * Generate embeddings for multiple passages (knowledge entries).
 * Used when indexing the knowledge folder.
 */
export async function getPassageEmbeddings(texts: string[]): Promise<number[][]> {
  if (!embedder) {
    await warmupLocalEmbeddings();
  }

  if (!embedder) {
    throw new Error('[LocalEmbed] Embedder not initialized');
  }

  if (texts.length === 0) {
    return [];
  }

  const startTime = Date.now();

  try {
    // passageEmbed returns an AsyncGenerator, collect all batches
    const generator = embedder.passageEmbed(texts);
    const result: number[][] = [];
    let lastLog = Date.now();

    for await (const batch of generator) {
      for (const embedding of batch) {
        result.push(Array.from(embedding));
      }
      // Log progress every 5 seconds so it doesn't look stuck
      const now = Date.now();
      if (now - lastLog > 5000) {
        const pct = Math.round((result.length / texts.length) * 100);
        console.log(`[LocalEmbed] Passage embeddings progress: ${result.length}/${texts.length} (${pct}%) - ${Math.round((now - startTime) / 1000)}s elapsed`);
        lastLog = now;
      }
    }

    console.log(`[LocalEmbed] Passage embeddings: ${result.length} entries in ${Date.now() - startTime}ms`);

    return result;
  } catch (error) {
    console.error('[LocalEmbed] Passage embedding error:', error);
    return [];
  }
}

/**
 * Generate embedding for a single passage (for incremental updates).
 */
export async function getPassageEmbedding(text: string): Promise<number[]> {
  const embeddings = await getPassageEmbeddings([text]);
  return embeddings[0] || [];
}

// =============================================================================
// UTILITIES
// =============================================================================

export function isLocalEmbeddingsReady(): boolean {
  return isWarmedUp && embedder !== null;
}

export function getEmbeddingDimensions(): number {
  return EMBEDDING_CONFIG.dimensions;
}

/**
 * Compute cosine similarity between two vectors.
 * Returns value between -1 and 1, where 1 means identical.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dot += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

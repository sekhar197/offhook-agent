/**
 * OpenAI Embeddings Provider
 *
 * Uses text-embedding-3-small with dimensions=384 to match BGE-small output,
 * allowing seamless switching via EMBEDDING_PROVIDER.
 *
 * Trade-offs vs local:
 *   + Zero memory footprint (no ONNX model)
 *   - Network latency (~100-300ms per call vs ~20-40ms local)
 *   - API cost ($0.02/M tokens — negligible for typical knowledge bases)
 *
 * IMPORTANT: passage and query embeddings MUST use the same provider/model —
 * vectors from different models are not comparable.
 */

import OpenAI from 'openai';

// =============================================================================
// STATE
// =============================================================================

let client: OpenAI | null = null;

const MODEL = process.env.EMBEDDING_MODEL_OPENAI || 'text-embedding-3-small';
const DIMENSIONS = 384;
const BATCH_SIZE = 100;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('[OpenAIEmbed] OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/** No-op warmup — OpenAI needs no local model loading. */
export async function warmupOpenAIEmbeddings(): Promise<void> {
  getClient();
  console.log(`[OpenAIEmbed] Provider ready (model=${MODEL}, dim=${DIMENSIONS})`);
}

// =============================================================================
// EMBEDDING GENERATION
// =============================================================================

/** Generate embedding for a single query. */
export async function getQueryEmbedding(text: string): Promise<number[]> {
  try {
    const response = await getClient().embeddings.create({
      model: MODEL,
      input: text,
      dimensions: DIMENSIONS,
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding || embedding.length === 0) {
      console.error('[OpenAIEmbed] Empty embedding returned for:', text);
      return [];
    }

    return embedding;
  } catch (error) {
    console.error('[OpenAIEmbed] Query embedding error:', error);
    return [];
  }
}

/** Generate embeddings for multiple passages in batches. */
export async function getPassageEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const startTime = Date.now();
  const allEmbeddings: number[][] = [];

  try {
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      const response = await getClient().embeddings.create({
        model: MODEL,
        input: batch,
        dimensions: DIMENSIONS,
      });

      // OpenAI returns embeddings sorted by index
      const sorted = response.data.sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        allEmbeddings.push(item.embedding);
      }

      if (texts.length > BATCH_SIZE) {
        const pct = Math.round((allEmbeddings.length / texts.length) * 100);
        console.log(`[OpenAIEmbed] Passage batch ${Math.floor(i / BATCH_SIZE) + 1}: ${allEmbeddings.length}/${texts.length} (${pct}%)`);
      }
    }

    console.log(`[OpenAIEmbed] Passage embeddings: ${allEmbeddings.length} entries in ${Date.now() - startTime}ms`);
    return allEmbeddings;
  } catch (error) {
    console.error('[OpenAIEmbed] Passage embedding error:', error);
    return [];
  }
}

/** Generate embedding for a single passage. */
export async function getPassageEmbedding(text: string): Promise<number[]> {
  const embeddings = await getPassageEmbeddings([text]);
  return embeddings[0] || [];
}

// =============================================================================
// UTILITIES
// =============================================================================

export function isOpenAIEmbeddingsReady(): boolean {
  return client !== null;
}

export function getEmbeddingDimensions(): number {
  return DIMENSIONS;
}

export function getModelName(): string {
  return MODEL;
}

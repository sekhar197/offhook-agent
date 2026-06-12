/**
 * In-memory entity resolver.
 *
 * Resolves a caller utterance to knowledge entries using layered indices,
 * in priority order:
 *   1. Alias (exact normalized match on curated aliases)         score 1.0
 *   2. ASR variants (curated known mishearings)                  score 0.9
 *   3. Phonetic PER-TOKEN (sound similarity per word)            score 0.7
 *   4. Token (exact word overlap)                                score 0.5
 *   5. Fuzzy (Levenshtein fallback for accented/misheard terms)  score 0.6 - 0.1·dist
 *
 * The index is built once per knowledge base (rebuild on knowledge reload).
 * Alias and ASR-variant maps are curated per-deployment in agent config —
 * the core ships none.
 */

import type { KnowledgeEntry } from '../types.js';
import { STOP_WORDS } from '../search/stop-words.js';
import { getPhoneticBackend, type PhoneticBackend } from './phonetic.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ResolverCandidate {
  entryId: string;
  entry: KnowledgeEntry;
  matchType: 'alias' | 'asr' | 'phonetic' | 'token';
  score: number;
}

export interface EntityIndexOptions {
  /** Curated alias map: normalized variant -> entry name or entry id. */
  aliases?: Record<string, string>;
  /** Curated known-mishearing map: normalized mishearing -> entry name or id. */
  asrVariants?: Record<string, string>;
  /** Language for the phonetic backend (default 'en'). */
  language?: string;
}

export interface EntityIndex {
  entries: Map<string, KnowledgeEntry>;
  alias: Map<string, string>;          // normalized alias -> entryId
  asr: Map<string, string>;            // normalized mishearing -> entryId
  phonetic: Map<string, Set<string>>;  // phonetic key -> entryIds
  tokens: Map<string, Set<string>>;    // token -> entryIds
  phoneticBackend: PhoneticBackend;
}

const MAX_FUZZY_KEYS = 200;

// =============================================================================
// NORMALIZATION
// =============================================================================

/** Normalize text for index lookup. */
export function normalizeForLookup(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTokens(text: string): string[] {
  const normalized = normalizeForLookup(text);
  return normalized.split(' ').filter(word => word.length >= 3 && !STOP_WORDS.has(word));
}

/**
 * Levenshtein edit distance between two strings.
 * Used as a fuzzy matching fallback for accented/misheard terms.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row DP (O(n) space)
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    prev = curr;
  }
  return prev[n];
}

// =============================================================================
// INDEX BUILD
// =============================================================================

/**
 * Build the layered resolver index for a knowledge base.
 * Call once at load time; rebuild when the knowledge base changes.
 */
export function buildEntityIndex(
  entries: KnowledgeEntry[],
  options: EntityIndexOptions = {},
): EntityIndex {
  const phoneticBackend = getPhoneticBackend(options.language);

  const index: EntityIndex = {
    entries: new Map(),
    alias: new Map(),
    asr: new Map(),
    phonetic: new Map(),
    tokens: new Map(),
    phoneticBackend,
  };

  // Name -> id lookup so curated maps may reference entries by name OR id.
  const byName = new Map<string, string>();
  for (const entry of entries) {
    index.entries.set(entry.id, entry);
    byName.set(normalizeForLookup(entry.name), entry.id);
  }

  const resolveRef = (ref: string): string | null => {
    if (index.entries.has(ref)) return ref;
    return byName.get(normalizeForLookup(ref)) ?? null;
  };

  // Layer 1: entry names index themselves as aliases
  for (const entry of entries) {
    const normName = normalizeForLookup(entry.name);
    if (normName && !index.alias.has(normName)) {
      index.alias.set(normName, entry.id);
    }
  }
  // Curated aliases from config
  for (const [variant, ref] of Object.entries(options.aliases ?? {})) {
    const id = resolveRef(ref);
    if (id) index.alias.set(normalizeForLookup(variant), id);
  }

  // Layer 2: curated ASR variants from config
  for (const [variant, ref] of Object.entries(options.asrVariants ?? {})) {
    const id = resolveRef(ref);
    if (id) index.asr.set(normalizeForLookup(variant), id);
  }

  // Layers 3-4: phonetic keys + tokens per entry name
  for (const entry of entries) {
    for (const token of extractTokens(entry.name)) {
      let tokenSet = index.tokens.get(token);
      if (!tokenSet) {
        tokenSet = new Set();
        index.tokens.set(token, tokenSet);
      }
      tokenSet.add(entry.id);

      const pk = phoneticBackend(token);
      if (pk.length >= 3) {
        let pkSet = index.phonetic.get(pk);
        if (!pkSet) {
          pkSet = new Set();
          index.phonetic.set(pk, pkSet);
        }
        pkSet.add(entry.id);
      }
    }
  }

  return index;
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Resolve knowledge-entry candidates from a caller utterance.
 * Pure in-memory lookups — sub-millisecond on typical knowledge bases.
 */
export function resolveEntityCandidates(
  index: EntityIndex,
  utterance: string,
  limit: number = 5,
): ResolverCandidate[] {
  const candidates: Map<string, ResolverCandidate> = new Map();

  const normalized = normalizeForLookup(utterance);
  if (!normalized) return [];
  const tokens = extractTokens(utterance);

  const matchInfo: Array<{ entryId: string; matchType: ResolverCandidate['matchType']; score: number }> = [];
  const seen = new Set<string>();
  const push = (entryId: string, matchType: ResolverCandidate['matchType'], score: number) => {
    if (seen.has(entryId)) return;
    seen.add(entryId);
    matchInfo.push({ entryId, matchType, score });
  };

  // 1. Alias lookup (exact match on full normalized utterance)
  const aliasHit = index.alias.get(normalized);
  if (aliasHit) push(aliasHit, 'alias', 1.0);

  // 2. ASR lookup (known mishearing match on full normalized utterance)
  const asrHit = index.asr.get(normalized);
  if (asrHit) push(asrHit, 'asr', 0.9);

  // 3. Phonetic lookups — one per token (not per-utterance), so each word
  // can match individual entries.
  for (const token of tokens) {
    const pk = index.phoneticBackend(token);
    if (pk.length < 3) continue;
    const hits = index.phonetic.get(pk);
    if (hits) {
      for (const entryId of hits) push(entryId, 'phonetic', 0.7);
    }
  }

  // 4. Token lookups (top 3 tokens, exact match)
  for (const token of tokens.slice(0, 3)) {
    const hits = index.tokens.get(token);
    if (hits) {
      for (const entryId of hits) push(entryId, 'token', 0.5);
    }
  }

  // 5. Fuzzy matching fallback — if exact/phonetic lookups found nothing,
  // try Levenshtein edit-distance against token-index keys.
  // Catches accented speech: "birianist" ≈ "biryani" (distance 3).
  // Capped to MAX_FUZZY_KEYS entries to bound CPU cost on large bases.
  if (seen.size === 0 && tokens.length > 0) {
    const entriesList = [...index.tokens.entries()];
    const cap = Math.min(entriesList.length, MAX_FUZZY_KEYS);
    for (const token of tokens) {
      if (token.length < 4) continue;
      for (let k = 0; k < cap; k++) {
        const [knownTerm, entryIds] = entriesList[k];
        const dist = levenshtein(token, knownTerm);
        const maxDist = token.length <= 5 ? 2 : 3;
        if (dist > 0 && dist <= maxDist) {
          const score = 0.6 - (dist * 0.1);
          for (const entryId of entryIds) push(entryId, 'phonetic', score);
        }
      }
    }
  }

  // Materialize candidates in match order
  for (const info of matchInfo) {
    if (candidates.size >= limit) break;
    const entry = index.entries.get(info.entryId);
    if (entry && !candidates.has(info.entryId)) {
      candidates.set(info.entryId, {
        entryId: info.entryId,
        entry,
        matchType: info.matchType,
        score: info.score,
      });
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * ASR Correction Layer
 *
 * Post-STT processing that runs the transcribed utterance through the entity
 * resolver (phonetic keys, ASR variant maps, alias indices) to catch misheard
 * entity names before the LLM sees them.
 *
 * Example: STT outputs "English" or "Iglis" -> resolver maps to "Idli"
 *
 * Pure in-memory matching — zero latency impact.
 *
 * We do NOT rewrite the transcript itself — we annotate it so the LLM can
 * use contextual judgment about whether the correction applies. Annotation
 * text uses plain language only: no "ASR", "phonetic", or "embedding"
 * terminology ever reaches the prompt in a caller-visible way.
 */

import {
  resolveEntityCandidates,
  type EntityIndex,
} from '../resolver/entity-index.js';
import { traceLog } from '../trace.js';
import type { TraceIds } from '../types.js';

export interface AsrCorrectionResult {
  originalText: string;
  correctedText: string;
  corrections: Array<{
    original: string;
    corrected: string;
    matchType: string;
    confidence: number;
  }>;
  annotation: string | null;
}

/** Guard lists: ASR correction must never fire for negation phrases or
 *  conversational greetings (CLAUDE-rule inherited from production). */
const NEGATION_PREFIXES = ["i didn't", "i don't", "no i said", "not the", "cancel", "never mind"];
const CONVERSATIONAL_PHRASES = [
  'hello', 'can you hear me', 'are you there', 'hi', 'hey',
  "that's all", "that's it", "that is all", "that is it",
  "i'm done", "i am done", "no more", "nothing else",
  "go ahead",
  "sounds good", "that sounds good", "all good",
  "we're good", "i'm good", "just that", "only that",
];

/**
 * Attempt to correct ASR transcription errors using the resolver.
 *
 * Returns the original text plus an annotation string that can be injected
 * into the micro-prompt's ASR NOTE slot, giving the LLM a hint about what
 * the caller likely meant.
 */
export function correctAsrTranscript(
  index: EntityIndex,
  transcript: string,
  trace?: TraceIds,
): AsrCorrectionResult {
  const result: AsrCorrectionResult = {
    originalText: transcript,
    correctedText: transcript,
    corrections: [],
    annotation: null,
  };

  if (!transcript || transcript.length < 2) return result;

  const lower = transcript.toLowerCase().trim();

  // Guard: skip ASR correction entirely for conversational phrases that
  // should never trigger entity matches (e.g. "I didn't say Paneer", "Hello?")
  if (NEGATION_PREFIXES.some(p => lower.startsWith(p)) ||
      CONVERSATIONAL_PHRASES.some(p => lower === p || lower === p + '?')) {
    return result;
  }

  try {
    const candidates = [...resolveEntityCandidates(index, transcript, 3)];

    // Per-word fallback: if the full utterance yields no results, try
    // individual words separately. This catches cases like "do you have
    // any biryani" where "biryani" alone maps to an entry.
    //
    // Scaling strategy (language-agnostic, no hardcoded denylists):
    // 1. Minimum 5 chars — short words are almost always common words
    //    with zero entity-specificity. Genuine short entity terms are
    //    caught by full-phrase alias/ASR/phonetic matching above.
    // 2. Length-scaled score threshold — shorter words need higher
    //    confidence to pass.
    if (candidates.length === 0) {
      const words = transcript.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/)
        .map(w => w.replace(/[^\p{L}]/gu, ''))
        .filter(w => w.length >= 5);
      for (const word of words) {
        const minScore = Math.max(0.6, 1.0 - (word.length - 4) * 0.1);
        const wordCandidates = resolveEntityCandidates(index, word, 1);
        if (wordCandidates.length > 0 && wordCandidates[0].score >= minScore) {
          candidates.push(...wordCandidates);
        }
      }
    }

    if (candidates.length === 0) return result;

    // Use higher thresholds for weaker match types (token, phonetic) to
    // reduce false positives while keeping curated matches (alias, asr) sensitive.
    const highConfidence = candidates.filter((c) => {
      if (c.matchType === 'alias' || c.matchType === 'asr') return c.score >= 0.5;
      return c.score >= 0.65;
    });
    if (highConfidence.length === 0) return result;

    // Dedup guard: if the candidate's significant name tokens already appear
    // verbatim in the transcript, skip phonetic/token corrections. The caller
    // pronounced the word clearly — annotating it as a mishearing confuses
    // the LLM (e.g. "shrimp" → "Nizam Shrimp" when caller actually said "shrimp").
    // Applies only to non-curated match types; alias/asr maps are intentional.
    const transcriptTokens = new Set(
      lower.split(/\s+/).map(w => w.replace(/[^\p{L}]/gu, '')).filter(w => w.length >= 3),
    );
    const verbatim = highConfidence.filter((c) => {
      if (c.matchType === 'alias' || c.matchType === 'asr') return false;
      const nameTokens = c.entry.name.toLowerCase().split(/\s+/)
        .map(w => w.replace(/[^\p{L}]/gu, ''))
        .filter(w => w.length >= 3);
      return nameTokens.some(t => transcriptTokens.has(t));
    });
    if (verbatim.length === highConfidence.length) return result;

    result.corrections = highConfidence.map((c) => ({
      original: transcript,
      corrected: c.entry.name,
      matchType: c.matchType,
      confidence: c.score,
    }));

    const topMatch = highConfidence[0];
    if (topMatch.matchType === 'alias' && topMatch.score >= 1.0) {
      result.annotation = `Caller said "${transcript}" which matches "${topMatch.entry.name}".`;
    } else if (topMatch.matchType === 'asr') {
      result.annotation = `Caller said "${transcript}" — likely means "${topMatch.entry.name}" (common phone mishearing).`;
    } else if (topMatch.matchType === 'phonetic') {
      result.annotation = `Caller said "${transcript}" — sounds like "${topMatch.entry.name}".`;
    } else {
      const names = highConfidence
        .slice(0, 2)
        .map((c) => `"${c.entry.name}"`)
        .join(' or ');
      result.annotation = `Caller said "${transcript}" — possible matches: ${names}.`;
    }

    traceLog('info', 'asr_correction', {
      call_id: trace?.callId,
      agent_id: trace?.agentId,
    }, {
      original: transcript,
      top_match: topMatch.entry.name,
      match_type: topMatch.matchType,
      score: topMatch.score,
      candidates_count: candidates.length,
    });
  } catch (err) {
    traceLog('warn', 'asr_correction_failed', {
      call_id: trace?.callId,
      agent_id: trace?.agentId,
    }, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

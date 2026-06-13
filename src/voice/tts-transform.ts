/**
 * TTS text transform — the pure, testable core of the ttsNode override.
 *
 * Before audio synthesis, the streamed assistant text is (1) naturalized
 * (contractions/elisions for a human read) and (2) run through per-deployment
 * pronunciation overrides so non-English entry names read correctly. Both are
 * already-ported, already-tested modules; this just composes them for the
 * streaming ttsNode and keeps the composition unit-testable without audio.
 */

import { createNaturalizer } from './text-naturalize.js';
import { applyPronunciationOverrides, type PhonemeMap } from './pronunciation.js';

export interface TtsTextTransform {
  /** Feed one streamed text chunk; returns transformed text ready for TTS
   *  (may be empty while the naturalizer buffers across chunk boundaries). */
  transform(chunk: string): string;
  /** Flush any buffered text at end of stream. */
  flush(): string;
}

/**
 * Build a stateful transform: naturalize runs as a streaming transform (it
 * buffers across chunk boundaries to sentence edges), then pronunciation
 * overrides apply to the emitted text. Order matters — naturalize first
 * ("going to" → "gonna"), then phonemes ("gonna qigong" → "gonna chee-gong").
 */
export function makeTtsTextTransform(phonemes: PhonemeMap): TtsTextTransform {
  const naturalizer = createNaturalizer();
  const phonemize = (s: string) => (s ? applyPronunciationOverrides(s, phonemes) : '');
  return {
    transform: (chunk: string) => phonemize(naturalizer.transform(chunk)),
    flush: () => phonemize(naturalizer.flush()),
  };
}

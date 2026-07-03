/**
 * Text naturalization pass for the TTS stream.
 *
 * Runs between the LLM's text output and Cartesia so the agent's speech
 * picks up the contractions/elisions a native speaker uses without the
 * LLM having to remember them on every turn. The prompt (baseIdentity's
 * voice paragraph) asks for "we're"/"you're"/"till"/"gonna" — this is
 * the safety net that catches the slips.
 *
 * Why post-LLM, not prompt-only: even with "use contractions" in the
 * prompt, LLMs leak "going to", "I will", "we are" maybe 20% of the
 * time. Rewriting at the TTS boundary is deterministic, costs zero
 * latency (runs per-chunk in a passthrough transform), and doesn't
 * require the LLM to spend attention on speech style.
 *
 * Why not per-tone gating at this layer: the prompt's voice paragraph
 * already says "contractions / elisions" for warm + casual. For formal,
 * the prompt says "Composed and courteous, never stiff" — and every
 * formal replacement here ("we are" → "we're", "going to" → "gonna")
 * is still natural formal English. None of these shifts a formal
 * register to a casual one. Keeping it tone-blind means one well-tested
 * path for every deployment.
 *
 * Chunk-boundary handling: the LLM streams chunks like `"…going "` then
 * `"to the store."`. If we matched per-chunk, "going " → no match, "to
 * the store." → no match, and we'd miss it. So we buffer the tail of
 * each chunk up to the last whitespace, carry it forward, and only emit
 * the prefix we've fully seen. On stream close we flush the tail.
 */

/**
 * Replacements applied to the streamed text. Order matters — longer,
 * more specific phrases first so "going to" fires before "to" could
 * ever be considered in isolation.
 *
 * The `g` + word-boundary pattern handles both inline ("not going to
 * lie") and punctuation-adjacent ("going to.") cases. Case is preserved
 * by matching `-i` and supplying the lowercased replacement — these
 * phrases are never sentence-initial in agent output in practice (they
 * follow pronouns) so simple lowercase is fine.
 */
interface Replacement {
  pattern: RegExp;
  replacement: string;
}

const REPLACEMENTS: Replacement[] = [
  // Discourse verbs — the most common LLM tells.
  { pattern: /\bgoing to\b/gi, replacement: 'gonna' },
  { pattern: /\bwant to\b/gi, replacement: 'wanna' },
  { pattern: /\bhave to\b/gi, replacement: 'have to' }, // keep — "hafta" reads too casual
  { pattern: /\bgot to\b/gi, replacement: 'gotta' },
  { pattern: /\bkind of\b/gi, replacement: 'kinda' },
  { pattern: /\bsort of\b/gi, replacement: 'sorta' },
  { pattern: /\bout of\b/gi, replacement: 'outta' },

  // Until → till is the single highest-signal replacement. "Until"
  // reads distinctly written; "till" is how people actually say it.
  { pattern: /\buntil\b/gi, replacement: 'till' },
];

/**
 * Apply all replacements to a fully-bounded string. The input must be
 * "safe" — i.e. no pattern's match could span past the end of the
 * string. Caller (`createNaturalizer`) is responsible for buffering so
 * this invariant holds.
 */
/**
 * Speak long digit runs (phone numbers, confirmation codes) DIGIT-BY-DIGIT.
 * TTS otherwise reads "5550142" / "+18624857030" as a cardinal ("five million,
 * five hundred fifty thousand…") — garbled and unusable on a call. Matches a
 * contiguous digit/separator run with 7+ actual digits and respaces each digit
 * (grouped in 3s for natural pauses). Short numbers (years, prices) are left alone.
 */
function speakLongNumbersAsDigits(text: string): string {
  return text.replace(/\+?\d[\d().-]{5,}\d/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 7) return m;
    const groups = digits.match(/\d{1,3}/g) ?? [digits];
    return groups.map((g) => g.split('').join(' ')).join(', ');
  });
}

function applyReplacements(text: string): string {
  let out = text;
  for (const { pattern, replacement } of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = speakLongNumbersAsDigits(out);
  return out;
}

/**
 * Replacements include 2-word patterns ("going to", "want to"). For
 * those to match correctly, both words must live in the same regex
 * invocation — per-word emission breaks multi-word matches. The
 * buffering strategy: emit in chunks terminated by a sentence-final
 * boundary (`.` / `!` / `?` optionally followed by whitespace). No
 * replacement crosses a sentence boundary, so this is always safe.
 *
 * Latency tradeoff: TTS sees text one sentence at a time rather than
 * token-stream. Sentences take ~300–600ms to generate from the LLM;
 * Cartesia can synthesize that fast, and starting with whole
 * sentences actually improves prosody vs. mid-word chunks. Previously
 * the pipeline passed raw token chunks straight to Cartesia; adding
 * per-sentence buffering is a small latency debit for a meaningful
 * naturalness win.
 *
 * Safety cap: if a "sentence" exceeds `MAX_BUFFER_CHARS` with no
 * terminating punctuation (unusual, but possible for verbose tool
 * responses or lists), we flush anyway to keep the TTS pipeline fed.
 * A split at the last whitespace within the buffer preserves word
 * integrity — at the cost of any 2-word pattern straddling that
 * point missing a rewrite. Acceptable: this is the edge-of-edge
 * case, not the norm.
 */
const MAX_BUFFER_CHARS = 512;
const SENTENCE_BOUNDARY = /[.!?](?=\s|$)/g;

export function createNaturalizer(): {
  transform: (chunk: string) => string;
  flush: () => string;
} {
  let carry = '';

  return {
    transform(chunk: string): string {
      carry += chunk;

      // Find the last sentence-terminating punctuation in carry, plus
      // any trailing whitespace so the emit ends cleanly. If there's
      // no sentence boundary yet AND the buffer is under the cap,
      // hold and emit nothing.
      let lastEnd = -1;
      for (const m of carry.matchAll(SENTENCE_BOUNDARY)) {
        lastEnd = m.index + m[0].length;
      }

      if (lastEnd === -1) {
        if (carry.length < MAX_BUFFER_CHARS) return '';
        // Buffer cap hit with no sentence boundary — flush up to the
        // last whitespace to avoid splitting a word, and accept that
        // a pattern straddling this split may be missed.
        const lastWs = carry.lastIndexOf(' ');
        if (lastWs <= 0) return '';
        const emit = carry.slice(0, lastWs + 1);
        carry = carry.slice(lastWs + 1);
        return applyReplacements(emit);
      }

      // Include any whitespace that follows the punctuation in the
      // emit region — clean separation between sentences.
      while (lastEnd < carry.length && /\s/.test(carry[lastEnd])) lastEnd++;

      const emit = carry.slice(0, lastEnd);
      carry = carry.slice(lastEnd);
      return applyReplacements(emit);
    },

    flush(): string {
      if (!carry) return '';
      const out = applyReplacements(carry);
      carry = '';
      return out;
    },
  };
}

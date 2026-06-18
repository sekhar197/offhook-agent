/**
 * Property-based tests for the caller-safe guard. Hand-written cases prove
 * specific leaks are caught; these prove the INVARIANTS hold across thousands of
 * generated inputs — the kind of edge case no fixed list would think to write.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkCallerSafe, BANNED_SUBSTRINGS, MAX_MESSAGE_CHARS } from './caller-safe.js';

// Safe filler words that contain no banned substring — used to build sentences.
const SAFE_WORDS = ['hello', 'please', 'today', 'thanks', 'sure', 'okay', 'great', 'yes', 'fine', 'soon'];

describe('caller-safe — properties', () => {
  it('always flags a banned term embedded as a standalone token', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BANNED_SUBSTRINGS),
        fc.array(fc.constantFrom(...SAFE_WORDS), { maxLength: 6 }),
        fc.array(fc.constantFrom(...SAFE_WORDS), { maxLength: 6 }),
        (banned, before, after) => {
          const msg = [...before, banned, ...after].join(' ');
          const issues = checkCallerSafe(msg);
          return issues.some(i => i.kind === 'banned_substring');
        },
      ),
    );
  });

  it('always flags any message longer than the max', () => {
    fc.assert(
      fc.property(fc.string({ minLength: MAX_MESSAGE_CHARS + 1, maxLength: 400 }), (s) => {
        return checkCallerSafe(s).some(i => i.kind === 'too_long');
      }),
    );
  });

  it('never throws and is deterministic on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const a = checkCallerSafe(s);
        const b = checkCallerSafe(s);
        expect(a).toEqual(b);
      }),
    );
  });

  it('a short sentence of only safe words is never flagged', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...SAFE_WORDS), { minLength: 1, maxLength: 8 }), (words) => {
        const msg = words.join(' ');
        return checkCallerSafe(msg).length === 0;
      }),
    );
  });
});

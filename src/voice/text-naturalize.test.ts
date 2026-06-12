import { describe, expect, it } from 'vitest';
import { createNaturalizer } from './text-naturalize.js';

function run(chunks: string[]): string {
  const n = createNaturalizer();
  let out = '';
  for (const c of chunks) out += n.transform(c);
  out += n.flush();
  return out;
}

describe('createNaturalizer', () => {
  it('rewrites common LLM tells in a single chunk', () => {
    expect(run(['We are going to start with the session.'])).toBe(
      'We are gonna start with the session.',
    );
  });

  it('rewrites "until" → "till"', () => {
    expect(run(["We're open until 9 PM."])).toBe("We're open till 9 PM.");
  });

  it('handles "want to" and "kind of"', () => {
    expect(run(['I want to grab kind of a medium spice.'])).toBe(
      'I wanna grab kinda a medium spice.',
    );
  });

  it('handles replacements that span chunk boundaries', () => {
    // "going " arrives in chunk 1, "to " in chunk 2, rest in chunk 3.
    expect(run(['We are going ', 'to ', 'start.'])).toBe(
      'We are gonna start.',
    );
  });

  it('holds the tail when a chunk ends mid-word', () => {
    // "goin" + "g to start" — boundary mid-word, must not falsely match.
    expect(run(['We are goin', 'g to start.'])).toBe('We are gonna start.');
  });

  it('flushes the final token on stream close', () => {
    // No trailing whitespace — tail lives in carry until flush.
    expect(run(['gotta'])).toBe('gotta');
    expect(run(['until'])).toBe('till');
  });

  it('preserves case-insensitive matches as lowercase replacements', () => {
    // In agent output these tokens come from the LLM mid-sentence so
    // lowercase replacement is correct. We don't need to preserve the
    // original case.
    expect(run(['Going to do it.'])).toBe('gonna do it.');
  });

  it('does not rewrite unrelated text', () => {
    expect(run(['That sounds perfect, thanks!'])).toBe(
      'That sounds perfect, thanks!',
    );
  });

  it('handles an empty stream', () => {
    expect(run([])).toBe('');
    expect(run([''])).toBe('');
  });

  it('handles punctuation adjacency', () => {
    expect(run(['I want to, yeah.'])).toBe('I wanna, yeah.');
    expect(run(['until.'])).toBe('till.');
  });

  it('does not double-replace', () => {
    // "gonna" should stay "gonna", not become "gonnanna" or similar.
    expect(run(['I gonna.'])).toBe('I gonna.');
  });
});

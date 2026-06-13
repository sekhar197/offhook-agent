import { describe, expect, it } from 'vitest';
import { makeTtsTextTransform } from './tts-transform.js';

/** Drain a transform over a list of chunks → the full emitted string. */
function run(chunks: string[], phonemes: Record<string, string> = {}): string {
  const t = makeTtsTextTransform(phonemes);
  let out = '';
  for (const c of chunks) out += t.transform(c);
  out += t.flush();
  return out;
}

describe('makeTtsTextTransform', () => {
  it('naturalizes across a complete sentence', () => {
    expect(run(['We are going to start now. '])).toBe('We are gonna start now. ');
  });

  it('applies pronunciation overrides after naturalizing', () => {
    const out = run(['Try the qigong session. '], { qigong: 'chee-gong' });
    expect(out).toBe('Try the chee-gong session. ');
  });

  it('buffers partial chunks until a sentence boundary, then flushes', () => {
    const t = makeTtsTextTransform({});
    expect(t.transform('We are going ')).toBe(''); // no boundary yet → buffered
    const rest = t.transform('to win.') + t.flush();
    expect(rest).toBe('We are gonna win.');
  });

  it('flush emits trailing buffered text with transforms applied', () => {
    const t = makeTtsTextTransform({ pho: 'fuh' });
    t.transform('I want pho'); // no boundary
    expect(t.flush()).toBe('I want fuh');
  });

  it('is a no-op passthrough when nothing matches', () => {
    expect(run(['Just a normal sentence. '])).toBe('Just a normal sentence. ');
  });
});

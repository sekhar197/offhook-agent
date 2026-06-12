import { describe, expect, it } from 'vitest';
import { isLikelyInterruption } from './semantic-interrupt.js';

describe('isLikelyInterruption', () => {
  describe('negatives (noise / short / acknowledgments)', () => {
    it('returns false for empty string', () => {
      expect(isLikelyInterruption('')).toBe(false);
    });

    it('returns false for whitespace-only', () => {
      expect(isLikelyInterruption('   ')).toBe(false);
    });

    it('returns false for short fragments under MIN_CHARS', () => {
      expect(isLikelyInterruption('yeah')).toBe(false);
      expect(isLikelyInterruption('mm-hmm')).toBe(false);
      expect(isLikelyInterruption('uh huh')).toBe(false);
      expect(isLikelyInterruption('ok')).toBe(false);
    });

    it('returns false for a medium-length continuation without intent markers', () => {
      expect(isLikelyInterruption('and a side of rice please')).toBe(false);
      expect(isLikelyInterruption('that sounds really good to me')).toBe(false);
    });
  });

  describe('intent phrases', () => {
    it('catches "wait" anywhere in utterance', () => {
      expect(isLikelyInterruption('wait a minute')).toBe(true);
      expect(isLikelyInterruption('oh wait, I meant biryani')).toBe(true);
    });

    it('catches "hold on"', () => {
      expect(isLikelyInterruption('hold on a second')).toBe(true);
    });

    it('catches "actually"', () => {
      expect(isLikelyInterruption('actually make it two')).toBe(true);
    });

    it('catches "no no" repetition', () => {
      expect(isLikelyInterruption('no no not that one')).toBe(true);
    });

    it('catches "stop"', () => {
      expect(isLikelyInterruption('stop the order please')).toBe(true);
    });

    it('catches "sorry, but"', () => {
      expect(isLikelyInterruption('sorry, but I changed my mind')).toBe(true);
    });

    it('catches "never mind"', () => {
      expect(isLikelyInterruption('never mind that one')).toBe(true);
    });

    it('catches "cancel that"', () => {
      expect(isLikelyInterruption('cancel that last item')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isLikelyInterruption('HOLD ON please')).toBe(true);
      expect(isLikelyInterruption('Actually, make it three')).toBe(true);
    });
  });

  describe('question mark ending', () => {
    it('flags statement-length utterance ending with ?', () => {
      expect(isLikelyInterruption('is that gluten free?')).toBe(true);
      expect(isLikelyInterruption('do you deliver to 94105?')).toBe(true);
    });

    it('still requires MIN_CHARS', () => {
      // "what?" is 5 chars, below MIN_CHARS=8
      expect(isLikelyInterruption('what?')).toBe(false);
    });
  });

  describe('question-opener words', () => {
    it('catches WH-word openers', () => {
      expect(isLikelyInterruption('what time do you close')).toBe(true);
      expect(isLikelyInterruption('where are you located')).toBe(true);
      expect(isLikelyInterruption('how much is the biryani')).toBe(true);
      expect(isLikelyInterruption('why is it spicy')).toBe(true);
    });

    it('catches auxiliary verb openers', () => {
      expect(isLikelyInterruption('is that available tonight')).toBe(true);
      expect(isLikelyInterruption('are you open right now')).toBe(true);
      expect(isLikelyInterruption('can I get extra rice')).toBe(true);
      expect(isLikelyInterruption('do you have lamb')).toBe(true);
    });

    it('requires the opener to be a prefix, not mid-sentence', () => {
      // "what" appears mid-sentence — no opener rule hit, no intent phrase hit
      expect(isLikelyInterruption('tell me what you recommend')).toBe(false);
    });

    it('requires a word boundary after auxiliary (is /are /etc.)', () => {
      // "island" starts with "is" but the opener "is " has a trailing space
      expect(isLikelyInterruption('island rice bowl combo')).toBe(false);
    });
  });

  describe('normalization', () => {
    it('trims leading/trailing whitespace before checking', () => {
      expect(isLikelyInterruption('   actually wait   ')).toBe(true);
    });
  });
});

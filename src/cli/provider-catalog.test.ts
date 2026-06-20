import { describe, expect, it } from 'vitest';
import { TIERS, tierNeeds, LLM_PROVIDERS, STT_PROVIDERS, TTS_PROVIDERS } from './provider-catalog.js';
import { looksLikeKey } from './key-helper.js';

describe('provider catalog', () => {
  it('local needs nothing; phone needs everything', () => {
    expect(tierNeeds('local')).toEqual({ llm: false, voice: false, livekit: false, carrier: false });
    expect(tierNeeds('phone')).toEqual({ llm: true, voice: true, livekit: true, carrier: true });
    expect(tierNeeds('chat')).toEqual({ llm: true, voice: false, livekit: false, carrier: false });
  });

  it('every key-bearing provider has an env var + a where-to-get-it URL', () => {
    for (const p of [...LLM_PROVIDERS, ...STT_PROVIDERS, ...TTS_PROVIDERS]) {
      if (p.envVar) expect(p.keyUrl, p.value).toMatch(/^https:\/\//);
    }
  });

  it('exposes the four tiers in order', () => {
    expect(TIERS.map(t => t.value)).toEqual(['local', 'chat', 'browser', 'phone']);
  });
});

describe('looksLikeKey', () => {
  it('accepts key-shaped strings, rejects prose/empty', () => {
    expect(looksLikeKey('sk-abcdef0123456789xyz')).toBe(true);
    expect(looksLikeKey('hello there friend')).toBe(false); // has spaces
    expect(looksLikeKey('short')).toBe(false);
    expect(looksLikeKey(null)).toBe(false);
  });
});

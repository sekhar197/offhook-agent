import { describe, expect, it } from 'vitest';
import { renderKeys, KEY_TIERS } from './keys.js';

describe('offhook-agent keys', () => {
  it('covers four tiers, starting with a zero-key local one', () => {
    const text = renderKeys({} as NodeJS.ProcessEnv).join('\n');
    expect(text).toContain('Tier 0');
    expect(text).toContain('Tier 3');
    expect(text).toContain('zero accounts, zero keys');
    expect(KEY_TIERS[0]!.keys).toEqual([]); // Tier 0 needs no keys
  });

  it('marks a key ✓ only when present in env', () => {
    expect(renderKeys({ OPENAI_API_KEY: 'sk-x' } as NodeJS.ProcessEnv).join('\n')).toMatch(/✓ OPENAI_API_KEY/);
    expect(renderKeys({} as NodeJS.ProcessEnv).join('\n')).toMatch(/· OPENAI_API_KEY/);
  });

  it('never prints a key value', () => {
    const text = renderKeys({ OPENAI_API_KEY: 'sk-supersecret' } as NodeJS.ProcessEnv).join('\n');
    expect(text).not.toContain('sk-supersecret');
  });
});

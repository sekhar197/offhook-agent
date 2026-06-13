import { describe, expect, it } from 'vitest';
import {
  resolveStt,
  resolveTts,
  resolveProviderKey,
  STT_PRESETS,
  TTS_PRESETS,
  VoiceProviderError,
} from './resolve.js';
import { parseAgentConfig, sttSpec, ttsSpec } from '../../config/agent-config.js';

describe('resolveStt', () => {
  it('string shorthand = provider name, default model', () => {
    const r = resolveStt('deepgram');
    expect(r.provider).toBe('deepgram');
    expect(r.plugin).toBe('@livekit/agents-plugin-deepgram');
    expect(r.model).toBe('nova-3');
    expect(r.apiKeyEnv).toBe('DEEPGRAM_API_KEY');
    expect(r.viaOpenAiPlugin).toBe(false);
  });

  it('defaults to openai (single-key mode)', () => {
    const r = resolveStt({});
    expect(r.provider).toBe('openai');
    expect(r.viaOpenAiPlugin).toBe(true);
    expect(r.model).toBe('gpt-4o-transcribe');
  });

  it('groq rides the OpenAI plugin via its compatible endpoint', () => {
    const r = resolveStt('groq');
    expect(r.plugin).toBe('@livekit/agents-plugin-openai');
    expect(r.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(r.apiKeyEnv).toBe('GROQ_API_KEY');
    expect(r.viaOpenAiPlugin).toBe(true);
  });

  it('openai-compatible requires a baseUrl (local Whisper)', () => {
    expect(() => resolveStt('openai-compatible')).toThrow(VoiceProviderError);
    const r = resolveStt({ provider: 'openai-compatible', baseUrl: 'http://whisper:8000/v1' });
    expect(r.baseUrl).toBe('http://whisper:8000/v1');
    expect(r.keyOptional).toBe(true);
  });

  it('object form overrides model + language + apiKeyEnv', () => {
    const r = resolveStt({ provider: 'deepgram', model: 'nova-2', language: 'es', apiKeyEnv: 'MY_DG' });
    expect(r.model).toBe('nova-2');
    expect(r.language).toBe('es');
    expect(r.apiKeyEnv).toBe('MY_DG');
  });
});

describe('resolveTts', () => {
  it('cartesia preset', () => {
    const r = resolveTts('cartesia');
    expect(r.plugin).toBe('@livekit/agents-plugin-cartesia');
    expect(r.model).toBe('sonic-3');
    expect(r.apiKeyEnv).toBe('CARTESIA_API_KEY');
  });

  it('default openai carries a default voice', () => {
    const r = resolveTts({});
    expect(r.provider).toBe('openai');
    expect(r.voice).toBe('alloy');
  });

  it('local Kokoro via openai-compatible', () => {
    const r = resolveTts({ provider: 'openai-compatible', baseUrl: 'http://kokoro:8880/v1', voice: 'af_sky' });
    expect(r.baseUrl).toBe('http://kokoro:8880/v1');
    expect(r.voice).toBe('af_sky');
    expect(r.keyOptional).toBe(true);
  });

  it('every STT/TTS preset names an installable plugin + key env', () => {
    for (const p of Object.values(STT_PRESETS)) {
      expect(p.plugin).toMatch(/^@livekit\/agents-plugin-/);
      expect(p.apiKeyEnv.length).toBeGreaterThan(0);
    }
    for (const p of Object.values(TTS_PRESETS)) {
      expect(p.plugin).toMatch(/^@livekit\/agents-plugin-/);
      expect(p.apiKeyEnv.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveProviderKey', () => {
  it('reads the env var, errors actionably when missing', () => {
    const r = resolveStt('deepgram');
    expect(() => resolveProviderKey(r, {})).toThrow(/DEEPGRAM_API_KEY/);
    expect(resolveProviderKey(r, { DEEPGRAM_API_KEY: 'dg-x' })).toBe('dg-x');
  });

  it('key-optional locals get a placeholder', () => {
    const r = resolveTts({ provider: 'openai-compatible', baseUrl: 'http://kokoro:8880/v1' });
    expect(resolveProviderKey(r, {})).toBe('not-needed');
  });
});

describe('agent.yaml voice specs', () => {
  const BASE = 'agent:\n  id: a\n  businessName: B\n';

  it('default config resolves to single-key OpenAI for both stt and tts', () => {
    const cfg = parseAgentConfig(BASE);
    expect(resolveStt(sttSpec(cfg)).provider).toBe('openai');
    expect(resolveTts(ttsSpec(cfg)).provider).toBe('openai');
    expect(cfg.voice.mode).toBe('cascaded');
    expect(cfg.voice.turnDetection).toBe('stt-endpoint');
  });

  it('best-quality stack: deepgram + cartesia', () => {
    const cfg = parseAgentConfig(BASE + 'voice:\n  stt: deepgram\n  tts:\n    provider: cartesia\n    voice: "abc-123"\n');
    expect(resolveStt(sttSpec(cfg)).provider).toBe('deepgram');
    const tts = resolveTts(ttsSpec(cfg));
    expect(tts.provider).toBe('cartesia');
    expect(tts.voice).toBe('abc-123');
  });

  it('fully-local stack: openai-compatible STT + TTS', () => {
    const cfg = parseAgentConfig(BASE +
      'voice:\n' +
      '  stt:\n    provider: openai-compatible\n    baseUrl: "http://whisper:8000/v1"\n' +
      '  tts:\n    provider: openai-compatible\n    baseUrl: "http://kokoro:8880/v1"\n');
    expect(resolveStt(sttSpec(cfg)).keyOptional).toBe(true);
    expect(resolveTts(ttsSpec(cfg)).keyOptional).toBe(true);
  });

  it('realtime mode parses', () => {
    const cfg = parseAgentConfig(BASE + 'voice:\n  mode: realtime\n  realtime:\n    provider: openai\n    voice: marin\n');
    expect(cfg.voice.mode).toBe('realtime');
    expect(cfg.voice.realtime.voice).toBe('marin');
  });

  it('rejects endpointing outside 1500-3000ms (hard bound preserved)', () => {
    expect(() => parseAgentConfig(BASE + 'voice:\n  endpointingMaxDelayMs: 500\n')).toThrow();
  });
});

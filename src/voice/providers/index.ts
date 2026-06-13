/**
 * Voice provider registries — generic STT/TTS/VAD/LLM/realtime over LiveKit
 * plugins, with `openai-compatible` for local servers. Pure resolution layer
 * (testable, no plugins) + async factories (lazy-import the plugin).
 */

export {
  resolveStt,
  resolveTts,
  resolveProviderKey,
  STT_PRESETS,
  TTS_PRESETS,
  VoiceProviderError,
  type SttProviderName,
  type TtsProviderName,
  type SttSpec,
  type TtsSpec,
  type ResolvedStt,
  type ResolvedTts,
  type ProviderPreset,
} from './resolve.js';

export { createStt, createTts, createVad } from './factory.js';
export { createVoiceLlm } from './llm.js';
export {
  createRealtimeModel,
  type RealtimeProviderName,
  type RealtimeSpec,
} from './realtime.js';

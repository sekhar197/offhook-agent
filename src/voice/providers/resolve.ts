/**
 * Voice provider resolution — the pure, plugin-free layer.
 *
 * Mirrors `src/llm/provider.ts`: a config spec (string shorthand or object)
 * resolves to a normalized descriptor naming the LiveKit plugin package, the
 * model, and the env var holding the key. No plugin is imported here — that
 * happens in the async factories — so this layer is fully unit-testable with
 * zero plugins installed.
 *
 * "Any provider" = any provider with a LiveKit plugin, PLUS `openai-compatible`
 * (custom baseUrl) so local Whisper/Piper/Kokoro servers work. Groq rides the
 * OpenAI plugin via its OpenAI-compatible endpoint.
 */

export type SttProviderName =
  | 'openai' | 'deepgram' | 'assemblyai' | 'azure' | 'google' | 'groq' | 'openai-compatible';

export type TtsProviderName =
  | 'openai' | 'cartesia' | 'elevenlabs' | 'rime' | 'azure' | 'google' | 'openai-compatible';

export interface ProviderPreset {
  /** npm package to lazy-import. */
  plugin: string;
  /** Env var holding the API key. */
  apiKeyEnv: string;
  /** Default model when the spec omits one. */
  defaultModel?: string;
  /** Default voice (TTS only). */
  defaultVoice?: string;
  /** Fixed base URL (e.g. groq's OpenAI-compatible endpoint). */
  baseUrl?: string;
  /** Local servers don't require a key. */
  keyOptional?: boolean;
  /** `openai-compatible` must be given a baseUrl. */
  requiresBaseUrl?: boolean;
  /** True when the provider is served through the OpenAI plugin (baseURL swap). */
  viaOpenAiPlugin?: boolean;
}

const OPENAI = '@livekit/agents-plugin-openai';

export const STT_PRESETS: Record<SttProviderName, ProviderPreset> = {
  // No defaultModel: the OpenAI realtime-transcription session rejects an
  // explicit model param and uses its own default (gpt-realtime-whisper).
  openai:               { plugin: OPENAI, apiKeyEnv: 'OPENAI_API_KEY', viaOpenAiPlugin: true },
  'openai-compatible':  { plugin: OPENAI, apiKeyEnv: 'OPENAI_API_KEY', keyOptional: true, requiresBaseUrl: true, viaOpenAiPlugin: true },
  groq:                 { plugin: OPENAI, apiKeyEnv: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'whisper-large-v3-turbo', viaOpenAiPlugin: true },
  deepgram:             { plugin: '@livekit/agents-plugin-deepgram', apiKeyEnv: 'DEEPGRAM_API_KEY', defaultModel: 'nova-3' },
  assemblyai:           { plugin: '@livekit/agents-plugin-assemblyai', apiKeyEnv: 'ASSEMBLYAI_API_KEY' },
  azure:                { plugin: '@livekit/agents-plugin-azure', apiKeyEnv: 'AZURE_SPEECH_KEY' },
  google:               { plugin: '@livekit/agents-plugin-google', apiKeyEnv: 'GOOGLE_API_KEY' },
};

export const TTS_PRESETS: Record<TtsProviderName, ProviderPreset> = {
  openai:               { plugin: OPENAI, apiKeyEnv: 'OPENAI_API_KEY', defaultModel: 'gpt-4o-mini-tts', defaultVoice: 'alloy', viaOpenAiPlugin: true },
  'openai-compatible':  { plugin: OPENAI, apiKeyEnv: 'OPENAI_API_KEY', keyOptional: true, requiresBaseUrl: true, viaOpenAiPlugin: true },
  cartesia:             { plugin: '@livekit/agents-plugin-cartesia', apiKeyEnv: 'CARTESIA_API_KEY', defaultModel: 'sonic-3' },
  elevenlabs:           { plugin: '@livekit/agents-plugin-elevenlabs', apiKeyEnv: 'ELEVEN_API_KEY' },
  rime:                 { plugin: '@livekit/agents-plugin-rime', apiKeyEnv: 'RIME_API_KEY' },
  azure:                { plugin: '@livekit/agents-plugin-azure', apiKeyEnv: 'AZURE_SPEECH_KEY' },
  google:               { plugin: '@livekit/agents-plugin-google', apiKeyEnv: 'GOOGLE_API_KEY' },
};

export interface ResolvedStt {
  kind: 'stt';
  provider: SttProviderName;
  plugin: string;
  model?: string;
  language?: string;
  baseUrl?: string;
  apiKeyEnv: string;
  keyOptional: boolean;
  viaOpenAiPlugin: boolean;
}

export interface ResolvedTts {
  kind: 'tts';
  provider: TtsProviderName;
  plugin: string;
  model?: string;
  voice?: string;
  baseUrl?: string;
  apiKeyEnv: string;
  keyOptional: boolean;
  viaOpenAiPlugin: boolean;
}

export class VoiceProviderError extends Error {}

/** Spec shapes as they come out of the zod-validated agent.yaml. */
export type SttSpec = SttProviderName | {
  provider?: SttProviderName; model?: string; language?: string; baseUrl?: string; apiKeyEnv?: string;
};
export type TtsSpec = TtsProviderName | {
  provider?: TtsProviderName; model?: string; voice?: string; baseUrl?: string; apiKeyEnv?: string;
};

export function resolveStt(spec: SttSpec): ResolvedStt {
  const obj = typeof spec === 'string' ? { provider: spec } : spec;
  const provider = obj.provider ?? 'openai';
  const preset = STT_PRESETS[provider];
  const baseUrl = obj.baseUrl ?? preset.baseUrl;
  if (preset.requiresBaseUrl && !baseUrl) {
    throw new VoiceProviderError(`voice.stt provider '${provider}' requires a baseUrl (e.g. a local Whisper server).`);
  }
  return {
    kind: 'stt',
    provider,
    plugin: preset.plugin,
    ...(obj.model ?? preset.defaultModel ? { model: obj.model ?? preset.defaultModel } : {}),
    ...(obj.language ? { language: obj.language } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    apiKeyEnv: obj.apiKeyEnv ?? preset.apiKeyEnv,
    keyOptional: obj.apiKeyEnv ? false : preset.keyOptional ?? false,
    viaOpenAiPlugin: preset.viaOpenAiPlugin ?? false,
  };
}

export function resolveTts(spec: TtsSpec): ResolvedTts {
  const obj = typeof spec === 'string' ? { provider: spec } : spec;
  const provider = obj.provider ?? 'openai';
  const preset = TTS_PRESETS[provider];
  const baseUrl = obj.baseUrl ?? preset.baseUrl;
  if (preset.requiresBaseUrl && !baseUrl) {
    throw new VoiceProviderError(`voice.tts provider '${provider}' requires a baseUrl (e.g. a local Piper/Kokoro server).`);
  }
  return {
    kind: 'tts',
    provider,
    plugin: preset.plugin,
    ...(obj.model ?? preset.defaultModel ? { model: obj.model ?? preset.defaultModel } : {}),
    ...(obj.voice ?? preset.defaultVoice ? { voice: obj.voice ?? preset.defaultVoice } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    apiKeyEnv: obj.apiKeyEnv ?? preset.apiKeyEnv,
    keyOptional: obj.apiKeyEnv ? false : preset.keyOptional ?? false,
    viaOpenAiPlugin: preset.viaOpenAiPlugin ?? false,
  };
}

/** Read the key for a resolved provider; placeholder for key-optional locals. */
export function resolveProviderKey(
  r: ResolvedStt | ResolvedTts,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = env[r.apiKeyEnv];
  if (key) return key;
  if (r.keyOptional) return 'not-needed';
  throw new VoiceProviderError(
    `Missing ${r.apiKeyEnv} for voice.${r.kind} provider '${r.provider}'. ` +
    `Set it in your environment, or change voice.${r.kind} in agent.yaml.`,
  );
}

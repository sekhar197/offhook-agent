/**
 * Model-agnostic LLM provider layer.
 *
 * offhook-agent talks to ANY model behind an OpenAI-compatible chat-completions
 * endpoint — which today means effectively every serving stack:
 *
 *   - Hosted APIs: OpenAI, OpenRouter (any model it routes — Qwen, DeepSeek,
 *     Llama, Mistral...), DeepSeek, Groq, Together, NVIDIA NIM (Nemotron)
 *   - Local: Ollama, vLLM, LM Studio, llama.cpp server — all expose the
 *     same /v1/chat/completions surface
 *
 * The provider preset resolves a base URL and the env var holding the key;
 * `custom` accepts any base URL. One code path, no per-provider SDKs.
 *
 * Voice-latency note: cascaded voice agents live and die on LLM TTFT.
 * Hosted fast inference (Groq, NIM) or a local GPU serving a small model
 * can beat the default; a CPU-bound local model will feel laggy. The
 * benchmark suite measures this per deployment (`npm run bench`).
 */

export type LlmProviderName =
  | 'openai'
  | 'openrouter'
  | 'ollama'
  | 'nvidia'
  | 'deepseek'
  | 'groq'
  | 'together'
  | 'custom';

export interface LlmProviderPreset {
  baseUrl: string;
  apiKeyEnv: string;
  /** Some local servers don't check keys; a placeholder keeps SDKs happy. */
  keyOptional?: boolean;
}

export const LLM_PROVIDER_PRESETS: Record<Exclude<LlmProviderName, 'custom'>, LlmProviderPreset> = {
  openai:     { baseUrl: 'https://api.openai.com/v1',            apiKeyEnv: 'OPENAI_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1',         apiKeyEnv: 'OPENROUTER_API_KEY' },
  ollama:     { baseUrl: 'http://localhost:11434/v1',            apiKeyEnv: 'OLLAMA_API_KEY', keyOptional: true },
  nvidia:     { baseUrl: 'https://integrate.api.nvidia.com/v1',  apiKeyEnv: 'NVIDIA_API_KEY' },
  deepseek:   { baseUrl: 'https://api.deepseek.com/v1',          apiKeyEnv: 'DEEPSEEK_API_KEY' },
  groq:       { baseUrl: 'https://api.groq.com/openai/v1',       apiKeyEnv: 'GROQ_API_KEY' },
  together:   { baseUrl: 'https://api.together.xyz/v1',          apiKeyEnv: 'TOGETHER_API_KEY' },
};

/** Normalized LLM settings after config resolution. */
export interface ResolvedLlm {
  provider: LlmProviderName;
  model: string;
  baseUrl: string;
  apiKeyEnv: string;
  keyOptional: boolean;
  maxTokens: number;
}

export interface LlmConfigInput {
  provider?: LlmProviderName;
  model: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  maxTokens: number;
}

export class LlmConfigError extends Error {}

/**
 * Resolve a config-level LLM spec into connection settings.
 * Pure — reads no env; key lookup happens at client-creation time so
 * `offhook-agent doctor` can report exactly which env var is missing.
 */
export function resolveLlm(input: LlmConfigInput): ResolvedLlm {
  const provider = input.provider ?? 'openai';

  if (provider === 'custom') {
    if (!input.baseUrl) {
      throw new LlmConfigError("models.llm.provider 'custom' requires models.llm.baseUrl");
    }
    return {
      provider,
      model: input.model,
      baseUrl: input.baseUrl,
      apiKeyEnv: input.apiKeyEnv ?? 'LLM_API_KEY',
      keyOptional: input.apiKeyEnv === undefined,
      maxTokens: input.maxTokens,
    };
  }

  const preset = LLM_PROVIDER_PRESETS[provider];
  return {
    provider,
    model: input.model,
    baseUrl: input.baseUrl ?? preset.baseUrl,
    apiKeyEnv: input.apiKeyEnv ?? preset.apiKeyEnv,
    keyOptional: preset.keyOptional ?? false,
    maxTokens: input.maxTokens,
  };
}

/**
 * Read the API key for a resolved provider from the environment.
 * Returns a placeholder for key-optional providers (local servers).
 */
export function resolveApiKey(llm: ResolvedLlm, env: NodeJS.ProcessEnv = process.env): string {
  const key = env[llm.apiKeyEnv];
  if (key) return key;
  if (llm.keyOptional) return 'not-needed';
  throw new LlmConfigError(
    `Missing ${llm.apiKeyEnv} for LLM provider '${llm.provider}'. ` +
    `Set it in your environment, or switch models.llm.provider in agent.yaml.`,
  );
}

/**
 * Voice LLM factory — bridges the model-agnostic LLM layer
 * (`src/llm/provider.ts`) into the LiveKit pipeline.
 *
 * Because every supported LLM provider (OpenAI, OpenRouter, Ollama, NVIDIA,
 * DeepSeek, Groq, Together, vLLM, local) speaks the OpenAI chat-completions
 * protocol, the LiveKit OpenAI plugin's LLM — which accepts a `baseURL` — is
 * the single bridge. Resolve once, swap the base URL, done. This is why
 * "any LLM, including local" works in voice for free.
 */

import type { llm as llmNs } from '@livekit/agents';
import { resolveApiKey, type ResolvedLlm } from '../../llm/provider.js';
import { VoiceProviderError } from './resolve.js';

export async function createVoiceLlm(r: ResolvedLlm, env = process.env): Promise<llmNs.LLM> {
  const apiKey = resolveApiKey(r, env);
  let mod: Record<string, unknown>;
  try {
    mod = (await import('@livekit/agents-plugin-openai')) as Record<string, unknown>;
  } catch {
    throw new VoiceProviderError(
      'The voice LLM needs "@livekit/agents-plugin-openai". Run:  npm install @livekit/agents-plugin-openai',
    );
  }
  const LLM = mod.LLM as new (opts: Record<string, unknown>) => llmNs.LLM;
  return new LLM({
    apiKey,
    model: r.model,
    baseURL: r.baseUrl,
    ...(r.maxTokens ? { maxCompletionTokens: r.maxTokens } : {}),
  });
}

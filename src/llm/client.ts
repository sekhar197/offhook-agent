/**
 * LLM client factory — one OpenAI-SDK client for every provider.
 *
 * All supported providers (hosted or local) speak the OpenAI
 * chat-completions protocol, so a single SDK with a swapped baseURL covers
 * OpenAI, OpenRouter, Ollama, NVIDIA NIM, DeepSeek, Groq, Together, vLLM,
 * LM Studio, and llama.cpp server.
 */

import OpenAI from 'openai';
import { resolveApiKey, type ResolvedLlm } from './provider.js';

export interface LlmClient {
  client: OpenAI;
  llm: ResolvedLlm;
}

export function createLlmClient(llm: ResolvedLlm, env: NodeJS.ProcessEnv = process.env): LlmClient {
  const apiKey = resolveApiKey(llm, env);
  const client = new OpenAI({ apiKey, baseURL: llm.baseUrl });
  return { client, llm };
}

/**
 * One streaming chat turn with tools. Thin by design — turn orchestration
 * (phase tools, micro-prompt, barge-in) lives in the conversation layer.
 */
export async function chatStream(
  { client, llm }: LlmClient,
  params: {
    system: string;
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }>;
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
    temperature?: number;
  },
) {
  return client.chat.completions.create({
    model: llm.model,
    max_completion_tokens: llm.maxTokens,
    temperature: params.temperature ?? 0.6,
    stream: true,
    messages: [
      { role: 'system', content: params.system },
      ...params.messages,
    ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
  });
}

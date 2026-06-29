/**
 * agent.yaml — the single config surface of an offhook-agent deployment.
 *
 * Everything domain-specific lives here: who the agent is, what it knows,
 * which tools it may call, and the vocabulary that tunes search and ASR
 * correction. The core ships zero domain data.
 */

import { z } from 'zod';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

// =============================================================================
// SCHEMA
// =============================================================================

const ToneSchema = z.enum(['warm', 'formal', 'casual']);

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export const AgentConfigSchema = z.object({
  agent: z.object({
    /** Stable deployment id — used in traces and idempotency keys. */
    id: z.string().min(1),
    /** The business/person the agent answers for ("Bright Smile Dental"). */
    businessName: z.string().min(1),
    /** The agent's own name ("June"). Optional — defaults to a role noun. */
    agentName: z.string().optional(),
    tone: ToneSchema.default('warm'),
    /** Primary caller language code for STT hints (e.g. 'en', 'hi', 'es'). */
    primaryLanguage: z.string().default('en'),
    /** IANA timezone — used so "today" means today at the business. */
    timezone: z.string().optional(),
    /** Optional custom greeting line. */
    greeting: z.string().optional(),
    /** Free-form extra instructions appended to the prompt (stable prefix). */
    instructions: z.string().optional(),
    /**
     * AI self-disclosure. Default TRUE — several jurisdictions require bots
     * to identify as automated, and disclosure is the trust-preserving
     * default. `false` opts out; a string replaces the default copy.
     */
    aiDisclosure: z.union([z.boolean(), z.string()]).default(true),
  }),

  business: z.object({
    address: z.string().optional(),
    phone: z.string().optional(),
    /** TTS-ready narrated hours, per weekday ("from 9 AM to 5 PM"). */
    hours: z.partialRecord(z.enum(WEEKDAYS), z.string()).optional(),
    /** Free-form policy strings keyed by topic ("parking", "insurance"). */
    policies: z.record(z.string(), z.string()).optional(),
  }).prefault({}),

  knowledge: z.object({
    /** Folder of .md/.yaml/.json knowledge files, relative to agent.yaml. */
    folder: z.string().default('./knowledge'),
    /** Domain vocabulary for search + ASR correction. */
    vocabulary: z.object({
      categorySynonyms: z.record(z.string(), z.array(z.string())).default({}),
      aliases: z.record(z.string(), z.string()).default({}),
      asrVariants: z.record(z.string(), z.string()).default({}),
      highlightKeywords: z.array(z.string()).optional(),
    }).prefault({}),
  }).prefault({}),

  tools: z.object({
    /** Built-in + custom tool names available to this deployment. */
    enabled: z.array(z.string()).default([
      'answer_from_knowledge',
      'take_message',
      'transfer_to_human',
      'end_call',
    ]),
    /** Number transfer_to_human dials. */
    transferPhone: z.string().optional(),
    /** Webhook receiving side-effecting actions (take_message, send_summary). */
    webhookUrl: z.string().url().optional(),
    /**
     * How take_message / send_summary actually reach the owner. When omitted,
     * offhook-agent uses the webhook (if webhookUrl is set) or logs to console. Set
     * this to deliver directly with one BYO key — no receiver to build:
     *   delivery: { channel: sms, to: "+1...", from: "+1<twilio#>" }
     *   delivery: { channel: email, to: "owner@biz.com", from: "agent@biz.com" }
     * Credentials are read from env (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN,
     * RESEND_API_KEY by default — override the *Env fields to rename).
     */
    delivery: z.discriminatedUnion('channel', [
      z.object({ channel: z.literal('console') }),
      z.object({ channel: z.literal('webhook') }),
      z.object({
        channel: z.literal('sms'),
        to: z.string().min(1),
        from: z.string().min(1),
        accountSidEnv: z.string().default('TWILIO_ACCOUNT_SID'),
        authTokenEnv: z.string().default('TWILIO_AUTH_TOKEN'),
      }),
      z.object({
        channel: z.literal('email'),
        to: z.string().min(1),
        from: z.string().min(1),
        apiKeyEnv: z.string().default('RESEND_API_KEY'),
        subject: z.string().optional(),
      }),
    ]).optional(),
  }).prefault({}),

  voice: z.object({
    /**
     * Pipeline mode. `cascaded` (default) = STT→LLM→TTS, where the entire
     * brain (ASR correction, state-gated tools, caller-safety) lives — and
     * tool-calling is reliable. `realtime` = a speech-to-speech model
     * (OpenAI gpt-realtime / Gemini Live): lower latency, natural prosody,
     * but bypasses the text-stage moat and is weaker at tool use. Default
     * cascaded for a reason (see docs/roadmap.md).
     */
    mode: z.enum(['cascaded', 'realtime']).default('cascaded'),
    /**
     * STT provider. String shorthand = provider name (default model). Object
     * form sets model/language/endpoint. `openai-compatible` + baseUrl runs a
     * local server (faster-whisper). Examples:
     *   stt: deepgram
     *   stt: { provider: deepgram, model: nova-3 }
     *   stt: { provider: openai-compatible, baseUrl: "http://whisper:8000/v1" }
     */
    stt: z.union([
      z.enum(['openai', 'deepgram', 'assemblyai', 'azure', 'google', 'groq', 'openai-compatible']),
      z.object({
        provider: z.enum(['openai', 'deepgram', 'assemblyai', 'azure', 'google', 'groq', 'openai-compatible']).default('openai'),
        model: z.string().optional(),
        language: z.string().optional(),
        baseUrl: z.string().url().optional(),
        apiKeyEnv: z.string().optional(),
      }),
    ]).default('openai'),
    /**
     * TTS provider. String shorthand = provider name. Object form sets
     * model/voice/endpoint. `openai-compatible` + baseUrl runs a local server
     * (Piper/Kokoro). Examples:
     *   tts: cartesia
     *   tts: { provider: cartesia, model: sonic-3, voice: "<voice-id>" }
     *   tts: { provider: openai-compatible, baseUrl: "http://kokoro:8880/v1" }
     */
    tts: z.union([
      z.enum(['openai', 'cartesia', 'elevenlabs', 'rime', 'azure', 'google', 'openai-compatible']),
      z.object({
        provider: z.enum(['openai', 'cartesia', 'elevenlabs', 'rime', 'azure', 'google', 'openai-compatible']).default('openai'),
        model: z.string().optional(),
        voice: z.string().optional(),
        baseUrl: z.string().url().optional(),
        apiKeyEnv: z.string().optional(),
      }),
    ]).default('openai'),
    /** Voice-activity detection. Silero (local) is the only option today. */
    vad: z.object({
      provider: z.enum(['silero']).default('silero'),
    }).prefault({}),
    /**
     * Turn detection. `semantic` = Pipecat Smart Turn v3 (mono-PCM, telephony-
     * safe); `livekit` = LiveKit's multilingual turn-detector; `stt-endpoint`
     * = pause-timer (clamped by endpointingMaxDelayMs).
     */
    turnDetection: z.enum(['semantic', 'livekit', 'stt-endpoint']).default('stt-endpoint'),
    /** Endpointing maxDelay ms; clamped by ENDPOINTING_BOUNDS at runtime. */
    endpointingMaxDelayMs: z.number().int().min(1500).max(3000).default(2000),
    /** Allow the caller to interrupt the agent mid-sentence (barge-in). Turn
     *  OFF for speakerphone/echo-prone setups where the agent's own audio
     *  would otherwise interrupt it. Default true. */
    allowInterruptions: z.boolean().default(true),
    /** S2S model settings, used only when mode = realtime. */
    realtime: z.object({
      provider: z.enum(['openai', 'google']).default('openai'),
      model: z.string().optional(),
      voice: z.string().optional(),
    }).prefault({}),
  }).prefault({}),

  models: z.object({
    /**
     * LLM spec. Shorthand string = an OpenAI model name. Object form picks
     * any OpenAI-compatible provider: hosted (openrouter, nvidia, deepseek,
     * groq, together) or local (ollama; vllm/llama.cpp via 'custom' +
     * baseUrl). Examples:
     *   llm: gpt-5.4-mini
     *   llm: { provider: openrouter, model: qwen/qwen3-32b }
     *   llm: { provider: ollama, model: llama3.3 }
     *   llm: { provider: nvidia, model: nvidia/llama-3.3-nemotron-super-49b-v1 }
     *   llm: { provider: custom, model: my-model, baseUrl: "http://gpu-box:8000/v1" }
     */
    llm: z.union([
      z.string(),
      z.object({
        provider: z.enum(['openai', 'openrouter', 'ollama', 'nvidia', 'deepseek', 'groq', 'together', 'custom']).default('openai'),
        model: z.string().min(1),
        baseUrl: z.string().url().optional(),
        apiKeyEnv: z.string().optional(),
      }),
    ]).default('gpt-5.4-mini'),
    /** Hard output cap — long answers become TTS monologues. */
    maxTokens: z.number().int().max(200).default(200),
  }).prefault({}),

  /**
   * Call observability. Every call emits a structured record (transcript,
   * tools, outcome, per-turn latency) so an operator can review what happened
   * — the difference between a black box and an operable deployment.
   *   sink: jsonl  → append one JSON line per call to `path`
   *   sink: webhook → POST each record to `url`
   *   sink: console → one-line summary to stdout
   *   sink: none    → disabled
   */
  observability: z.object({
    sink: z.enum(['jsonl', 'webhook', 'console', 'none']).default('jsonl'),
    /** File path for the jsonl sink. */
    path: z.string().default('./call-records.jsonl'),
    /** Endpoint for the webhook sink. */
    url: z.string().url().optional(),
  }).prefault({}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** The slice of config the prompt builder reads. */
export type AgentIdentity = AgentConfig['agent'] & AgentConfig['business'] & {
  transferPhone?: string;
};

// =============================================================================
// LOADER
// =============================================================================

export class ConfigError extends Error {}

/** Parse + validate an agent.yaml string. Throws ConfigError with a readable
 *  message on invalid config — this surfaces in `offhook-agent doctor`. */
export function parseAgentConfig(yamlText: string): AgentConfig {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    throw new ConfigError(`agent.yaml is not valid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }
  const result = AgentConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`agent.yaml failed validation:\n${issues}`);
  }
  return result.data;
}

/** Load agent.yaml from disk. */
export function loadAgentConfig(path: string): AgentConfig {
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch {
    throw new ConfigError(`Cannot read config file at ${path}`);
  }
  return parseAgentConfig(text);
}

/** Normalize the models.llm field (string shorthand or object) into a
 *  provider-resolution input. */
export function llmConfigInput(config: AgentConfig): {
  provider?: 'openai' | 'openrouter' | 'ollama' | 'nvidia' | 'deepseek' | 'groq' | 'together' | 'custom';
  model: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  maxTokens: number;
} {
  const llm = config.models.llm;
  if (typeof llm === 'string') {
    return { provider: 'openai', model: llm, maxTokens: config.models.maxTokens };
  }
  return { ...llm, maxTokens: config.models.maxTokens };
}

/** The voice STT spec from config (string shorthand or object), ready for
 *  `resolveStt`. */
export function sttSpec(config: AgentConfig): AgentConfig['voice']['stt'] {
  return config.voice.stt;
}

/** The voice TTS spec from config, ready for `resolveTts`. */
export function ttsSpec(config: AgentConfig): AgentConfig['voice']['tts'] {
  return config.voice.tts;
}

/** Derive the prompt-facing identity slice from a full config. */
export function toAgentIdentity(config: AgentConfig): AgentIdentity {
  return {
    ...config.agent,
    ...config.business,
    transferPhone: config.tools.transferPhone,
  };
}

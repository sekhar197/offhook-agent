/**
 * agent.yaml — the single config surface of an offhook deployment.
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
  }).prefault({}),

  voice: z.object({
    /** TTS voice id (provider-specific, e.g. a Cartesia voice). */
    ttsVoiceId: z.string().optional(),
    ttsModel: z.string().default('sonic-3'),
    sttModel: z.string().default('nova-3'),
    /** Endpointing maxDelay ms; clamped by ENDPOINTING_BOUNDS at runtime. */
    endpointingMaxDelayMs: z.number().int().min(1500).max(3000).default(2000),
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
 *  message on invalid config — this surfaces in `offhook doctor`. */
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

/** Derive the prompt-facing identity slice from a full config. */
export function toAgentIdentity(config: AgentConfig): AgentIdentity {
  return {
    ...config.agent,
    ...config.business,
    transferPhone: config.tools.transferPhone,
  };
}

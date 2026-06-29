/**
 * The provider menus + where to get each key — the data behind the guided
 * `offhook-agent init` wizard. Pure and testable; the interactive shell and the
 * browser/clipboard helpers live elsewhere.
 *
 * Tiers map to how far a developer wants to go (and how many keys that costs):
 *   local   → zero keys (Ollama + local speech)
 *   chat    → one LLM key
 *   browser → + LiveKit (voice in the browser)
 *   phone   → + a carrier (answer a real number)
 */

export type Tier = 'local' | 'chat' | 'browser' | 'phone';

export interface ProviderChoice {
  value: string;
  label: string;
  hint?: string;
  /** Env var the key lands in (omitted for local/no-key providers). */
  envVar?: string;
  /** Where to create the key — the wizard opens this in the browser. */
  keyUrl?: string;
}

export const LLM_PROVIDERS: ProviderChoice[] = [
  { value: 'openai', label: 'OpenAI', hint: 'one key also covers STT + TTS', envVar: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys' },
  { value: 'openrouter', label: 'OpenRouter', hint: 'one key, every hosted model', envVar: 'OPENROUTER_API_KEY', keyUrl: 'https://openrouter.ai/keys' },
  { value: 'ollama', label: 'Local (Ollama)', hint: 'no key, runs on your machine' },
];

export const STT_PROVIDERS: ProviderChoice[] = [
  { value: 'deepgram', label: 'Deepgram', hint: 'streaming, lowest latency — recommended', envVar: 'DEEPGRAM_API_KEY', keyUrl: 'https://console.deepgram.com' },
  { value: 'openai', label: 'OpenAI', hint: 'reuses your OpenAI key (batch, slower)', envVar: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys' },
  { value: 'assemblyai', label: 'AssemblyAI', hint: 'streaming', envVar: 'ASSEMBLYAI_API_KEY', keyUrl: 'https://www.assemblyai.com/app/api-keys' },
];

export const TTS_PROVIDERS: ProviderChoice[] = [
  { value: 'cartesia', label: 'Cartesia', hint: 'natural, ~40ms — recommended', envVar: 'CARTESIA_API_KEY', keyUrl: 'https://play.cartesia.ai/keys' },
  { value: 'openai', label: 'OpenAI', hint: 'reuses your OpenAI key', envVar: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys' },
  { value: 'elevenlabs', label: 'ElevenLabs', hint: 'expressive voices', envVar: 'ELEVENLABS_API_KEY', keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
];

export const CARRIERS: ProviderChoice[] = [
  { value: 'twilio', label: 'Twilio', hint: 'has a CLI — can auto-fetch creds', envVar: 'TWILIO_AUTH_TOKEN', keyUrl: 'https://console.twilio.com' },
  { value: 'telnyx', label: 'Telnyx', envVar: 'TELNYX_API_KEY', keyUrl: 'https://portal.telnyx.com' },
];

/** LiveKit needs three values; its CLI (`lk`) can auto-fetch them. */
export const LIVEKIT_KEYS = [
  { envVar: 'LIVEKIT_URL', keyUrl: 'https://cloud.livekit.io' },
  { envVar: 'LIVEKIT_API_KEY' },
  { envVar: 'LIVEKIT_API_SECRET' },
] as const;

export const TIERS: { value: Tier; label: string; hint: string }[] = [
  { value: 'local', label: 'Try it locally', hint: 'zero keys — Ollama + local speech' },
  { value: 'chat', label: 'Chat with a hosted model', hint: 'one LLM key' },
  { value: 'browser', label: 'Talk to it in the browser', hint: '+ LiveKit (free)' },
  { value: 'phone', label: 'Answer a real phone number', hint: '+ a carrier (the popular one)' },
];

/** Which provider categories a tier needs filled in. */
export function tierNeeds(tier: Tier): { llm: boolean; voice: boolean; livekit: boolean; carrier: boolean } {
  return {
    llm: tier !== 'local',
    voice: tier === 'browser' || tier === 'phone',
    livekit: tier === 'browser' || tier === 'phone',
    carrier: tier === 'phone',
  };
}

/**
 * `offhook-agent keys` — the guided "what do I need, and where do I get it" map.
 *
 * Account-free and config-free: a fresh clone can run it to understand the
 * tiers before touching anything. Reads process.env only to show what's already
 * SET (✓) vs not (·) — never the values.
 *
 * The whole point: nobody should create six accounts to try offhook-agent. Tier 0 is
 * zero-key and fully local. Keys are a PRODUCTION concern, added one tier at a
 * time — not a barrier to the first run.
 */

interface KeyLine { env: string; note: string; url?: string; alt?: boolean; }
interface Tier { n: string; title: string; blurb: string; run?: string; keys: KeyLine[]; }

export const KEY_TIERS: Tier[] = [
  {
    n: '0',
    title: 'Try it locally — zero accounts, zero keys',
    blurb: 'Runs entirely on your machine: local LLM + local speech. No signups, nothing leaves your box.',
    run: 'ollama serve   +   docker compose -f docker-compose.selfhost.yml up   (config: examples/self-hosted)',
    keys: [],
  },
  {
    n: '1',
    title: 'Better quality — one LLM key',
    blurb: 'Swap the local model for a hosted one. One signup.',
    keys: [
      { env: 'OPENAI_API_KEY', note: 'the brain — also does STT + TTS in single-key mode', url: 'https://platform.openai.com/api-keys' },
      { env: 'OPENROUTER_API_KEY', note: 'one key, every hosted model (GPT, Llama, DeepSeek…)', url: 'https://openrouter.ai/keys', alt: true },
    ],
  },
  {
    n: '2',
    title: 'Talk to it in the browser — add LiveKit (free)',
    blurb: 'Voice in your browser, no phone yet. LiveKit Cloud has a free tier.',
    keys: [
      { env: 'LIVEKIT_URL', note: 'wss://your-project.livekit.cloud  (Settings → Keys)', url: 'https://cloud.livekit.io' },
      { env: 'LIVEKIT_API_KEY', note: 'Settings → Keys' },
      { env: 'LIVEKIT_API_SECRET', note: 'Settings → Keys' },
      { env: 'DEEPGRAM_API_KEY', note: 'streaming STT — the big latency win (free $200 credit)', url: 'https://console.deepgram.com', alt: true },
      { env: 'CARTESIA_API_KEY', note: 'natural ~40ms TTS', url: 'https://play.cartesia.ai/keys', alt: true },
    ],
  },
  {
    n: '3',
    title: 'Answer a real phone number — add a carrier',
    blurb: 'Provision a number and point it at your agent.',
    keys: [
      { env: 'LIVEKIT_SIP_URI', note: 'your project SIP: sip:<project-id>.sip.livekit.cloud (drop the p_)' },
      { env: 'TWILIO_ACCOUNT_SID', note: 'console home page', url: 'https://console.twilio.com' },
      { env: 'TWILIO_AUTH_TOKEN', note: 'console home page' },
      { env: 'TELNYX_API_KEY', note: '…or use Telnyx instead of Twilio', url: 'https://portal.telnyx.com', alt: true },
    ],
  },
];

/** Render the guide as lines (pure — testable). */
export function renderKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [
    '',
    '  offhook-agent keys — what you need, by how far you want to go.',
    '  Nobody creates six accounts to try this. Start at Tier 0; add a tier when you want more.',
    '',
  ];
  for (const t of KEY_TIERS) {
    out.push(`  ── Tier ${t.n} · ${t.title}`);
    out.push(`     ${t.blurb}`);
    if (t.run) out.push(`     run: ${t.run}`);
    for (const k of t.keys) {
      const mark = env[k.env] ? '✓' : '·';
      out.push(`     ${k.alt ? '…or ' : '    '}${mark} ${k.env.padEnd(20)} ${k.note}`);
      if (k.url) out.push(`              ↳ ${k.url}`);
    }
    out.push('');
  }
  out.push("  Put keys in .env (offhook-agent auto-loads it; it's gitignored — keys never leave your machine).");
  out.push('  Re-run `offhook-agent keys` anytime · check a specific config with `offhook-agent doctor`.');
  out.push('');
  return out;
}

export function keysCommand(env: NodeJS.ProcessEnv = process.env): void {
  for (const line of renderKeys(env)) console.log(line);
}

/**
 * `offhook init` — guided setup. Pick how far you want to go (a tier), pick your
 * providers, and offhook opens each key page for you and grabs the key off your
 * clipboard so you don't paste. Writes agent.yaml + knowledge/ + .env.
 *
 * The honest bit: we can't log into your provider account and scrape a key
 * (no API, security/ToS). We get as close as is safe — open the exact page +
 * read the key you just copied. LiveKit/Twilio CLIs can truly auto-fetch; we
 * point you at them when they're installed.
 */
import { intro, outro, text, select, password, confirm, isCancel, cancel, note } from '@clack/prompts';
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TIERS, LLM_PROVIDERS, STT_PROVIDERS, TTS_PROVIDERS, CARRIERS, LIVEKIT_KEYS, tierNeeds,
  type Tier, type ProviderChoice,
} from './provider-catalog.js';
import { openInBrowser, readClipboard, looksLikeKey, hasCli } from './key-helper.js';

function bail(value: unknown): asserts value is string | boolean {
  if (isCancel(value)) {
    cancel('Setup cancelled — nothing was written.');
    process.exit(0);
  }
}

const toOpt = (p: ProviderChoice) => ({ value: p.value, label: p.label, ...(p.hint ? { hint: p.hint } : {}) });

export async function initCommand(targetDir: string): Promise<void> {
  intro('offhook — set up your voice agent');

  if (existsSync(join(targetDir, 'agent.yaml'))) {
    const overwrite = await confirm({ message: 'agent.yaml already exists here. Overwrite?', initialValue: false });
    bail(overwrite);
    if (!overwrite) { cancel('Keeping your existing agent.yaml.'); process.exit(0); }
  }

  const template = await select({
    message: 'What should this agent do?',
    options: [
      { value: 'receptionist', label: 'Business receptionist', hint: 'hours, FAQ, messages, transfer' },
      { value: 'secretary', label: 'Personal secretary', hint: 'screens calls, takes messages' },
      { value: 'blank', label: 'Start blank' },
    ],
  });
  bail(template);

  const businessName = await text({
    message: template === 'secretary' ? 'Whose calls does it answer? (your name)' : 'Business name',
    placeholder: template === 'secretary' ? 'Alex Rivera' : 'Bright Smile Dental',
    validate: v => (v && v.trim().length > 0 ? undefined : 'Required'),
  });
  bail(businessName);

  const agentName = await text({ message: "Agent's name (what it calls itself)", placeholder: 'June', defaultValue: 'June' });
  bail(agentName);

  const tier = await select({
    message: 'How far do you want to go? (you can add the rest later)',
    options: TIERS.map(t => ({ value: t.value, label: t.label, hint: t.hint })),
  }) as Tier;
  bail(tier);
  const needs = tierNeeds(tier);

  // ---- key collection: open the page, grab from clipboard, fall back to paste
  const envLines: string[] = [];
  const collected = new Set<string>();
  async function collectKey(envVar: string, keyUrl?: string): Promise<void> {
    if (collected.has(envVar)) return; // e.g. OPENAI_API_KEY shared by LLM + STT + TTS
    if (keyUrl) {
      note(`Opening ${keyUrl}\nCreate a key there and copy it — I'll grab it from your clipboard.`, envVar);
      openInBrowser(keyUrl);
    }
    let val: string | undefined;
    const clip = readClipboard();
    if (looksLikeKey(clip)) {
      const use = await confirm({ message: `Use the key on your clipboard (…${clip.slice(-4)})?`, initialValue: true });
      bail(use);
      if (use) val = clip;
    }
    if (!val) {
      const entered = await password({ message: `Paste ${envVar}` });
      bail(entered);
      val = String(entered);
    }
    envLines.push(`${envVar}=${val}`);
    collected.add(envVar);
  }

  // ---- LLM
  let llmYaml: string;
  if (!needs.llm) {
    llmYaml = '  llm:\n    provider: ollama\n    model: qwen2.5:3b';
  } else {
    const llm = await select({ message: 'Which model powers it?', options: LLM_PROVIDERS.map(toOpt) }) as string;
    bail(llm);
    const p = LLM_PROVIDERS.find(x => x.value === llm)!;
    if (llm === 'openrouter') {
      const m = await text({ message: 'Model (OpenRouter id)', defaultValue: 'openai/gpt-5.4-mini', placeholder: 'openai/gpt-5.4-mini' });
      bail(m);
      llmYaml = `  llm:\n    provider: openrouter\n    model: ${m}`;
      await collectKey(p.envVar!, p.keyUrl);
    } else if (llm === 'ollama') {
      const m = await text({ message: 'Ollama model (pulled locally)', defaultValue: 'qwen2.5:3b', placeholder: 'qwen2.5:3b' });
      bail(m);
      llmYaml = `  llm:\n    provider: ollama\n    model: ${m}`;
    } else {
      await collectKey(p.envVar!, p.keyUrl);
      llmYaml = '  llm: gpt-5.4-mini';
    }
  }

  // ---- Voice (STT/TTS)
  let voiceYaml = '';
  if (tier === 'local') {
    voiceYaml = '\nvoice:\n  mode: cascaded\n  stt: { provider: openai-compatible, baseUrl: http://localhost:8000/v1 }\n  tts: { provider: openai-compatible, baseUrl: http://localhost:8880/v1, voice: af_sky }\n  endpointingMaxDelayMs: 1500\n';
  } else if (needs.voice) {
    const stt = await select({ message: 'Speech-to-text', options: STT_PROVIDERS.map(toOpt) }) as string;
    bail(stt);
    const sp = STT_PROVIDERS.find(x => x.value === stt)!;
    if (sp.envVar) await collectKey(sp.envVar, sp.keyUrl);
    const tts = await select({ message: 'Text-to-speech', options: TTS_PROVIDERS.map(toOpt) }) as string;
    bail(tts);
    const tp = TTS_PROVIDERS.find(x => x.value === tts)!;
    if (tp.envVar) await collectKey(tp.envVar, tp.keyUrl);
    voiceYaml = `\nvoice:\n  stt: ${stt}\n  tts: ${tts}\n  endpointingMaxDelayMs: 1500\n`;
  }

  // ---- LiveKit (browser + phone)
  if (needs.livekit) {
    if (hasCli('lk')) note('Tip: `lk cloud auth` logs in via your browser and can set the LIVEKIT_* values for you.', 'LiveKit');
    for (const k of LIVEKIT_KEYS) await collectKey(k.envVar, 'keyUrl' in k ? k.keyUrl : undefined);
  }

  // ---- Carrier (phone)
  if (needs.carrier) {
    const carrier = await select({ message: 'Phone carrier', options: CARRIERS.map(toOpt) }) as string;
    bail(carrier);
    if (carrier === 'twilio') {
      if (hasCli('twilio')) note('Tip: `twilio login` can set TWILIO_* for you.', 'Twilio');
      note('Opening console.twilio.com — both values are on the home page.', 'Twilio');
      openInBrowser('https://console.twilio.com');
      await collectKey('TWILIO_ACCOUNT_SID');
      await collectKey('TWILIO_AUTH_TOKEN');
    } else {
      await collectKey('TELNYX_API_KEY', CARRIERS.find(c => c.value === 'telnyx')!.keyUrl);
    }
    await collectKey('LIVEKIT_SIP_URI'); // sip:<project-id>.sip.livekit.cloud
  }

  // ---- write files
  const id = (businessName as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const instructions = template === 'secretary'
    ? `\n  instructions: >\n    You answer when ${businessName} can't. Find out who's calling and what\n    it's about, take a message with a callback number, and keep it brief.\n`
    : '\n';

  const agentYaml = `# Generated by \`offhook init\` — edit freely. Docs: https://github.com/sekhar197/offhook
agent:
  id: ${id}
  businessName: ${JSON.stringify(businessName)}
  agentName: ${JSON.stringify(agentName)}
  tone: ${template === 'secretary' ? 'casual' : 'warm'}${instructions}
business:
  policies: {}

knowledge:
  folder: ./knowledge

tools:
  enabled: [answer_from_knowledge, take_message, transfer_to_human, end_call]
  # transferPhone: "+15550001111"
${voiceYaml}
models:
${llmYaml}
`;

  writeFileSync(join(targetDir, 'agent.yaml'), agentYaml);
  mkdirSync(join(targetDir, 'knowledge'), { recursive: true });
  const kbPath = join(targetDir, 'knowledge', 'getting-started.md');
  if (!existsSync(kbPath)) {
    writeFileSync(kbPath, `# General\n\n## What ${businessName} does\nReplace this with a real description — the agent answers caller questions from the files in this folder.\n\n## How to reach a person\nEdit tools.transferPhone in agent.yaml so the agent can transfer callers.\n`);
  }
  if (envLines.length > 0) appendFileSync(join(targetDir, '.env'), envLines.join('\n') + '\n');
  if (!existsSync(join(targetDir, '.gitignore'))) writeFileSync(join(targetDir, '.gitignore'), '.env\n');

  note([
    'agent.yaml          your agent (edit freely)',
    'knowledge/          drop .md / .yaml files — the agent answers from them',
    envLines.length ? '.env                your keys (gitignored)' : null,
  ].filter(Boolean).join('\n'), 'Created');

  const next: Record<Tier, string> = {
    local: '`ollama serve` + `docker compose -f docker-compose.selfhost.yml up`, then `offhook chat`',
    chat: '`offhook doctor`, then `offhook chat`',
    browser: '`offhook doctor`, then `offhook dev` — talk in your browser',
    phone: '`offhook doctor`, then `offhook phone provision` → `offhook phone connect` → `offhook start`',
  };
  outro(`Next: ${next[tier]}`);
}

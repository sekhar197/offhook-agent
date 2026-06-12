/**
 * `offhook doctor` — preflight checks with actionable output.
 *
 * Reports exactly what's missing and how to fix it; exits non-zero when
 * the agent can't run. The checks mirror the real startup path.
 */

import { resolve, dirname } from 'node:path';
import { loadAgentConfig, llmConfigInput, ConfigError } from '../config/agent-config.js';
import { loadKnowledgeFolder, KnowledgeError } from '../knowledge/loader.js';
import { resolveLlm, resolveApiKey, LlmConfigError } from '../llm/provider.js';

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

const OK = '✓';
const FAIL = '✗';

export async function doctorCommand(configPath: string): Promise<void> {
  const checks: Check[] = [];
  let fatal = false;

  // 1. Config parses
  let config;
  try {
    config = loadAgentConfig(configPath);
    checks.push({ label: 'agent.yaml', ok: true, detail: `valid (agent: ${config.agent.id})` });
  } catch (e) {
    checks.push({
      label: 'agent.yaml', ok: false,
      detail: e instanceof ConfigError ? e.message : String(e),
    });
    print(checks);
    process.exit(1);
  }

  // 2. Knowledge loads
  try {
    const dir = resolve(dirname(resolve(configPath)), config.knowledge.folder);
    const entries = loadKnowledgeFolder(dir);
    checks.push({
      label: 'knowledge', ok: entries.length > 0,
      detail: entries.length > 0
        ? `${entries.length} entries from ${config.knowledge.folder}`
        : `${config.knowledge.folder} has no .md/.yaml entries — the agent will know nothing`,
    });
  } catch (e) {
    fatal = true;
    checks.push({ label: 'knowledge', ok: false, detail: e instanceof KnowledgeError ? e.message : String(e) });
  }

  // 3. LLM config + key
  let llmOk = false;
  let llm;
  try {
    llm = resolveLlm(llmConfigInput(config));
    resolveApiKey(llm);
    llmOk = true;
    checks.push({ label: 'llm', ok: true, detail: `${llm.provider} / ${llm.model}` });
  } catch (e) {
    fatal = true;
    checks.push({ label: 'llm', ok: false, detail: e instanceof LlmConfigError ? e.message : String(e) });
  }

  // 4. LLM endpoint reachable (3s budget; skipped if key missing)
  if (llmOk && llm) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${llm.baseUrl.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${resolveApiKey(llm)}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      checks.push({
        label: 'llm endpoint', ok: res.ok,
        detail: res.ok ? `${llm.baseUrl} reachable` : `${llm.baseUrl} returned HTTP ${res.status} — check the key`,
      });
      if (!res.ok) fatal = true;
    } catch {
      fatal = llm.provider !== 'ollama'; // a stopped local server is common; warn, don't always die
      checks.push({
        label: 'llm endpoint', ok: false,
        detail: llm.provider === 'ollama'
          ? `${llm.baseUrl} not responding — is Ollama running? (ollama serve)`
          : `${llm.baseUrl} unreachable`,
      });
    }
  }

  // 5. Voice keys (informational until Milestone B voice pipeline)
  const dg = !!process.env.DEEPGRAM_API_KEY;
  const ct = !!process.env.CARTESIA_API_KEY;
  checks.push({
    label: 'voice keys', ok: true,
    detail: dg && ct
      ? 'Deepgram + Cartesia set'
      : `text mode ready; for voice set ${[!dg && 'DEEPGRAM_API_KEY', !ct && 'CARTESIA_API_KEY'].filter(Boolean).join(' + ')}`,
  });

  // 6. Webhook + transfer wiring
  checks.push({
    label: 'actions', ok: true,
    detail: config.tools.webhookUrl
      ? `webhook: ${config.tools.webhookUrl}`
      : 'no webhookUrl — take_message prints to console (fine for testing)',
  });

  print(checks);
  if (fatal) process.exit(1);
  console.log('\nAll good. Try: offhook chat\n');
}

function print(checks: Check[]): void {
  console.log('');
  for (const c of checks) {
    console.log(`  ${c.ok ? OK : FAIL} ${c.label.padEnd(14)} ${c.detail}`);
  }
}

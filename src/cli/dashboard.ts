/**
 * `offhook-agent dashboard` — launch the local web dashboard.
 *
 * Reads the call records + config the agent already produces and serves a
 * localhost UI (call log, transcripts, scorecard, config, keys-status, and the
 * live safety-gated improve panel). Your data never leaves the machine.
 */
import { loadAgentConfig } from '../config/agent-config.js';
import { startDashboardServer } from '../server/dashboard.js';
import { openInBrowser } from './key-helper.js';

export function dashboardCommand(configPath: string): void {
  const config = loadAgentConfig(configPath);
  const recordsPath = config.observability.sink === 'jsonl' ? config.observability.path : './call-records.jsonl';
  const port = Number(process.env.OFFHOOK_AGENT_DASHBOARD_PORT || 4317);
  const host = process.env.OFFHOOK_AGENT_DASHBOARD_HOST;
  const token = process.env.OFFHOOK_AGENT_DASHBOARD_TOKEN;
  const { url } = startDashboardServer({ configPath, recordsPath, port, ...(host ? { host } : {}), ...(token ? { token } : {}) });
  // Open the tokenized URL automatically (the token is in ?t=, so the page just
  // works). Opt out with OFFHOOK_AGENT_NO_OPEN for headless/remote boxes; the URL is
  // printed regardless. Only auto-open when bound locally.
  if (!process.env.OFFHOOK_AGENT_NO_OPEN && (host ?? '127.0.0.1') === '127.0.0.1') openInBrowser(url);
  // startDashboardServer keeps the process alive via the listening socket.
}

/**
 * `offhook dashboard` — launch the local web dashboard.
 *
 * Reads the call records + config the agent already produces and serves a
 * localhost UI (call log, transcripts, scorecard, config, keys-status, and the
 * live safety-gated improve panel). Your data never leaves the machine.
 */
import { loadAgentConfig } from '../config/agent-config.js';
import { startDashboardServer } from '../server/dashboard.js';

export function dashboardCommand(configPath: string): void {
  const config = loadAgentConfig(configPath);
  const recordsPath = config.observability.sink === 'jsonl' ? config.observability.path : './call-records.jsonl';
  const port = Number(process.env.OFFHOOK_DASHBOARD_PORT || 4317);
  const host = process.env.OFFHOOK_DASHBOARD_HOST;
  const token = process.env.OFFHOOK_DASHBOARD_TOKEN;
  startDashboardServer({ configPath, recordsPath, port, ...(host ? { host } : {}), ...(token ? { token } : {}) });
  // startDashboardServer keeps the process alive via the listening socket.
}

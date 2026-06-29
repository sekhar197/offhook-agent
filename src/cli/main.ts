/**
 * offhook-agent CLI entry. Subcommands:
 *   init    — interactive setup wizard (writes agent.yaml, knowledge/, .env)
 *   doctor  — preflight checks: config, knowledge, keys, endpoint
 *   chat    — text-mode test agent (real brain, no voice keys needed)
 *   start   — voice pipeline (lands with Milestone B)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HELP = `
  offhook-agent — Don't build a voice agent. Deploy one.

  Usage: offhook-agent <command> [options]

    init             set up a new agent in the current folder (interactive)
    doctor           verify config, knowledge, and keys
    chat             talk to your agent in the terminal (no voice keys needed)
    keys             what keys you need + where to get them (Tier 0 = zero-key local)
    start            run the voice pipeline (coming in v0.1)
    improve          learn from real calls; propose a safe edit, gated by evals
    dashboard        local web UI: call logs, transcripts, scorecard, improve
    deploy           generate a deploy wrapper (--target docker|fly|railway|render|k8s)
    phone            provision a real number + connect it (provision|connect|status|release)
    config           read/edit agent.yaml safely (get <path> | set <path> <value>)

  Options:
    -c, --config     path to agent.yaml (default: ./agent.yaml)
    --apply          (improve) write the change if the gate passes
    --unguarded      (improve) apply with NO safety gate — explicit, risky

  Repo: https://github.com/sekhar197/offhook-agent
`;

function loadDotEnv(dir: string): void {
  // Minimal .env loader — no dependency, no expansion, never overrides
  // variables that are already set in the environment.
  const path = resolve(dir, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  const configFlag = argv.findIndex(a => a === '-c' || a === '--config');
  const configPath = configFlag >= 0 && argv[configFlag + 1] ? argv[configFlag + 1] : './agent.yaml';

  loadDotEnv(process.cwd());

  switch (command) {
    case 'init': {
      const { initCommand } = await import('./init.js');
      await initCommand(process.cwd());
      break;
    }
    case 'doctor': {
      const { doctorCommand } = await import('./doctor.js');
      await doctorCommand(configPath);
      break;
    }
    case 'chat': {
      const { chatCommand } = await import('./chat.js');
      await chatCommand(configPath);
      break;
    }
    case 'keys': {
      const { keysCommand } = await import('./keys.js');
      keysCommand();
      break;
    }
    case 'dev': {
      // Browser voice session: token+web server + worker in one process.
      const { devCommand } = await import('./dev.js');
      devCommand();
      break;
    }
    case 'start':
    case 'console': {
      // Hand off to the LiveKit worker. cli.runApp re-reads argv for the
      // subcommand (start | console), so we just launch it.
      const { runVoiceWorker } = await import('../voice/worker.js');
      runVoiceWorker();
      break;
    }
    case 'improve': {
      const { improveCommand } = await import('./improve.js');
      await improveCommand(configPath, {
        apply: argv.includes('--apply'),
        unguarded: argv.includes('--unguarded'),
      });
      break;
    }
    case 'dashboard': {
      const { dashboardCommand } = await import('./dashboard.js');
      dashboardCommand(configPath);
      break;
    }
    case 'deploy': {
      const ti = argv.indexOf('--target');
      const target = ti >= 0 ? argv[ti + 1] : undefined;
      const { deployCommand } = await import('./deploy.js');
      deployCommand(configPath, target);
      break;
    }
    case 'config': {
      const { configCommand } = await import('./config.js');
      // args after 'config', minus the -c/--config flag pair
      const rest = argv.slice(1).filter((a, i, arr) => a !== '-c' && a !== '--config' && arr[i - 1] !== '-c' && arr[i - 1] !== '--config');
      configCommand(configPath, rest);
      break;
    }
    case 'phone': {
      const { phoneCommand } = await import('./phone.js');
      const rest = argv.slice(1).filter((a, i, arr) => a !== '-c' && a !== '--config' && arr[i - 1] !== '-c' && arr[i - 1] !== '--config');
      await phoneCommand(configPath, rest);
      break;
    }
    case 'help':
    case '--help':
    case '-h':
    case undefined: {
      const { printBanner } = await import('./banner.js');
      printBanner();
      break;
    }
    default: {
      const { printBanner } = await import('./banner.js');
      console.log(`\n  Unknown command: ${command}`);
      printBanner();
      process.exitCode = 1;
    }
  }
}

/**
 * offhook CLI entry. Subcommands:
 *   init    — interactive setup wizard (writes agent.yaml, knowledge/, .env)
 *   doctor  — preflight checks: config, knowledge, keys, endpoint
 *   chat    — text-mode test agent (real brain, no voice keys needed)
 *   start   — voice pipeline (lands with Milestone B)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HELP = `
  offhook — Don't build a voice agent. Deploy one.

  Usage: offhook <command> [options]

    init             set up a new agent in the current folder (interactive)
    doctor           verify config, knowledge, and keys
    chat             talk to your agent in the terminal (no voice keys needed)
    start            run the voice pipeline (coming in v0.1)

  Options:
    -c, --config     path to agent.yaml (default: ./agent.yaml)

  Repo: https://github.com/sekhar197/offhook
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
    case 'start':
      console.log('\n  The voice pipeline lands with v0.1 (Milestone B).');
      console.log('  Until then: `offhook chat` runs the same agent brain in text.\n');
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;
    default:
      console.log(`\n  Unknown command: ${command}\n${HELP}`);
      process.exitCode = 1;
  }
}

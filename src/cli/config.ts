/**
 * `offhook config get <path>` / `offhook config set <path> <value>` — read or
 * safely edit agent.yaml from the terminal. Edits go through the same
 * validate-then-backup path as the dashboard and the self-improve loop.
 */
import { loadAgentConfig } from '../config/agent-config.js';
import { applyConfigEdits, isEditablePath, EDITABLE_PATHS, EDITABLE_PREFIXES } from '../config/edit.js';

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

export function configCommand(configPath: string, args: string[]): void {
  const [sub, path, ...rest] = args;

  if (sub === 'get' && path) {
    console.log(JSON.stringify(getPath(loadAgentConfig(configPath), path) ?? null));
    return;
  }

  if (sub === 'set' && path && rest.length) {
    if (!isEditablePath(path)) {
      console.log(`Not an editable field: ${path}`);
      console.log(`Editable: ${[...EDITABLE_PATHS, ...EDITABLE_PREFIXES.map(p => `${p}.*`)].join(', ')}`);
      process.exitCode = 1;
      return;
    }
    const raw = rest.join(' ');
    let value: unknown;
    try { value = JSON.parse(raw); } catch { value = raw; } // JSON (arrays/bools/numbers) or plain string
    try {
      const { backupPath } = applyConfigEdits(configPath, [{ path, value }]);
      console.log(`✓ set ${path} = ${JSON.stringify(value)}  (backup: ${backupPath})`);
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    }
    return;
  }

  console.log('Usage:\n  offhook config get <path>\n  offhook config set <path> <value>   (value: JSON or plain text)');
  process.exitCode = 1;
}

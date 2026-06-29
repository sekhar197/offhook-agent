#!/usr/bin/env node
// CLI launcher: prefers the built dist; falls back to tsx for repo checkouts.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist', 'cli', 'main.js');

if (existsSync(dist)) {
  const { main } = await import(dist);
  await main();
} else if (existsSync(join(root, 'src', 'cli', 'main.ts'))) {
  console.log('  (dev checkout: run `npm run build` once, or use `npx tsx src/cli/main.ts`)');
} else {
  console.log(`
  offhook-agent — Don't build a voice agent. Deploy one.

  v0.1 is in active development. Watch: https://github.com/sekhar197/offhook-agent
`);
}

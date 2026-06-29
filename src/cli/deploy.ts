/**
 * `offhook-agent deploy --target <docker|fly|railway|render|k8s>` — emit the platform
 * wrapper around the repo's tested Dockerfile, with the secrets your config
 * actually needs. One image, any platform.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadAgentConfig } from '../config/agent-config.js';
import { generateDeploy, DEPLOY_TARGETS, type DeployTarget } from '../deploy/generators.js';

export function deployCommand(configPath: string, target: string | undefined): void {
  if (!target || !DEPLOY_TARGETS.includes(target as DeployTarget)) {
    console.log(`Usage: offhook-agent deploy --target <${DEPLOY_TARGETS.join(' | ')}>`);
    process.exitCode = 1;
    return;
  }

  const config = loadAgentConfig(configPath);
  const plan = generateDeploy(target as DeployTarget, config);

  console.log(`\nDeploy wrapper for ${target} (one image, the tested Dockerfile):\n`);
  for (const f of plan.files) {
    const dir = dirname(f.filename);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    writeFileSync(f.filename, f.contents);
    console.log(`  ✓ wrote ${f.filename}`);
  }
  console.log('\nNext steps:');
  for (const n of plan.notes) console.log(`  • ${n}`);
  console.log('');
}

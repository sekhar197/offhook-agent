import { describe, expect, it } from 'vitest';
import { parseAgentConfig } from '../config/agent-config.js';
import { generateDeploy, requiredEnvVars, DEPLOY_TARGETS } from './generators.js';

const MINIMAL = parseAgentConfig('agent:\n  id: my-agent\n  businessName: My Biz\n');
const WITH_SMS = parseAgentConfig(`agent:
  id: clinic
  businessName: Clinic
tools:
  delivery:
    channel: sms
    to: "+1"
    from: "+1"
`);

describe('requiredEnvVars', () => {
  it('always needs LiveKit + the resolved LLM key', () => {
    expect(requiredEnvVars(MINIMAL)).toEqual(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'OPENAI_API_KEY']);
  });
  it('adds delivery keys when a channel is configured', () => {
    const env = requiredEnvVars(WITH_SMS);
    expect(env).toContain('TWILIO_ACCOUNT_SID');
    expect(env).toContain('TWILIO_AUTH_TOKEN');
  });
});

describe('generateDeploy', () => {
  it('covers every advertised target', () => {
    for (const t of DEPLOY_TARGETS) {
      const plan = generateDeploy(t, MINIMAL);
      expect(plan.files.length).toBeGreaterThan(0);
      expect(plan.target).toBe(t);
    }
  });

  it('fly.toml wraps the Dockerfile, names the app, has no inbound service, lists secrets', () => {
    const [f] = generateDeploy('fly', MINIMAL).files;
    expect(f.filename).toBe('fly.toml');
    expect(f.contents).toContain('app = "my-agent"');
    expect(f.contents).toContain('dockerfile = "Dockerfile"');
    expect(f.contents).not.toContain('http_service'); // worker, not web
    expect(f.contents).toContain('OPENAI_API_KEY');
  });

  it('k8s emits a Deployment + Secret, drains on terminate, no Service', () => {
    const plan = generateDeploy('k8s', MINIMAL);
    expect(plan.files.map(f => f.filename)).toEqual(['k8s/deployment.yaml', 'k8s/secret.yaml']);
    const dep = plan.files[0]!.contents;
    expect(dep).toContain('kind: Deployment');
    expect(dep).toContain('terminationGracePeriodSeconds: 60');
    expect(dep).not.toContain('kind: Service');
    expect(plan.files[1]!.contents).toContain('OPENAI_API_KEY');
  });

  it('docker recipe restarts forever and passes each env var', () => {
    const [f] = generateDeploy('docker', MINIMAL).files;
    expect(f.filename).toBe('deploy.sh');
    expect(f.contents).toContain('--restart unless-stopped');
    expect(f.contents).toContain('-e LIVEKIT_URL');
    expect(f.contents).toContain('-e OPENAI_API_KEY');
  });

  it('railway.json is valid JSON with a Dockerfile builder', () => {
    const [f] = generateDeploy('railway', MINIMAL).files;
    const parsed = JSON.parse(f.contents);
    expect(parsed.build.builder).toBe('DOCKERFILE');
    expect(parsed.deploy.restartPolicyType).toBe('ON_FAILURE');
  });

  it('render uses a worker service with sync:false secrets', () => {
    const [f] = generateDeploy('render', MINIMAL).files;
    expect(f.contents).toContain('type: worker');
    expect(f.contents).toContain('sync: false');
  });
});

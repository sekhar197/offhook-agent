/**
 * Deploy-anywhere generators.
 *
 * One Docker image (the repo's tested Dockerfile) runs on every platform; this
 * module emits the thin platform WRAPPER around it — never duplicating build
 * logic. Each generator is a PURE function (config → files), so the whole thing
 * is snapshot-tested with zero accounts.
 *
 * The worker connects OUT to LiveKit and answers calls — there are no inbound
 * ports — so every target is a "worker"/background service, not a web service.
 */
import { llmConfigInput, type AgentConfig } from '../config/agent-config.js';
import { resolveLlm } from '../llm/provider.js';

export type DeployTarget = 'docker' | 'fly' | 'railway' | 'render' | 'k8s';
export const DEPLOY_TARGETS: DeployTarget[] = ['docker', 'fly', 'railway', 'render', 'k8s'];

export interface DeployFile { filename: string; contents: string; }
export interface DeployPlan { target: DeployTarget; files: DeployFile[]; notes: string[]; }

/** The env var NAMES this config needs at runtime (never values). LiveKit is
 *  always required for voice; the LLM key is whatever the provider resolves to;
 *  delivery keys are added only if a delivery channel is configured. */
export function requiredEnvVars(config: AgentConfig): string[] {
  const out: string[] = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
  try {
    const llm = resolveLlm(llmConfigInput(config));
    if (llm.apiKeyEnv && !out.includes(llm.apiKeyEnv)) out.push(llm.apiKeyEnv);
  } catch { /* unresolvable llm — skip */ }
  const d = config.tools.delivery;
  if (d?.channel === 'sms') { out.push(d.accountSidEnv, d.authTokenEnv); }
  if (d?.channel === 'email') out.push(d.apiKeyEnv);
  return [...new Set(out)];
}

const appName = (config: AgentConfig): string => config.agent.id;

// --- per-target generators (pure) -------------------------------------------

function docker(config: AgentConfig, env: string[], image: string): DeployPlan {
  const eFlags = env.map(v => `    -e ${v} \\`).join('\n');
  const contents = `#!/usr/bin/env bash
# offhook-agent — run the worker 24/7 anywhere Docker runs.
set -euo pipefail

docker build -t ${image} .

docker run -d --restart unless-stopped --name ${appName(config)} \\
${eFlags}
    -v "$PWD/agent.yaml:/app/agent.yaml" \\
    -v "$PWD/knowledge:/app/knowledge" \\
    ${image}
`;
  return {
    target: 'docker',
    files: [{ filename: 'deploy.sh', contents }],
    notes: [`Set the env vars first: ${env.join(', ')}.`, '--restart unless-stopped survives crashes + reboots; the worker drains calls on stop.'],
  };
}

function fly(config: AgentConfig, env: string[]): DeployPlan {
  const contents = `# offhook-agent on Fly.io — \`fly deploy\` (worker, no public ports).
app = "${appName(config)}"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  OFFHOOK_AGENT_CONFIG = "/app/agent.yaml"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"

# Worker only — no web service block; it connects OUT to LiveKit, nothing inbound.
# Secrets (run before deploy):
#   fly secrets set ${env.join(' ')}
`;
  return {
    target: 'fly',
    files: [{ filename: 'fly.toml', contents }],
    notes: [`fly secrets set ${env.map(v => `${v}=...`).join(' ')}`, 'agent.yaml + knowledge/ must be baked into the image (COPY) or mounted via a Fly volume.', 'Deploy: fly launch --copy-config --dockerfile Dockerfile  (then fly deploy).'],
  };
}

function railway(config: AgentConfig, env: string[]): DeployPlan {
  const contents = `${JSON.stringify({
    $schema: 'https://railway.app/railway.schema.json',
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: { startCommand: 'node bin/offhook-agent.js start', restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 },
  }, null, 2)}\n`;
  return {
    target: 'railway',
    files: [{ filename: 'railway.json', contents }],
    notes: [`Add these variables in the Railway service (Variables tab): ${env.join(', ')}, OFFHOOK_AGENT_CONFIG=/app/agent.yaml.`, 'Deploy a "worker" service (no public networking needed).'],
  };
}

function render(config: AgentConfig, env: string[]): DeployPlan {
  const envYaml = ['      - key: OFFHOOK_AGENT_CONFIG', '        value: /app/agent.yaml',
    ...env.flatMap(v => [`      - key: ${v}`, '        sync: false'])].join('\n');
  const contents = `# offhook-agent on Render — Blueprint (background worker, no inbound).
services:
  - type: worker
    name: ${appName(config)}
    runtime: docker
    dockerfilePath: ./Dockerfile
    plan: starter
    envVars:
${envYaml}
`;
  return {
    target: 'render',
    files: [{ filename: 'render.yaml', contents }],
    notes: [`Set the sync:false secrets in the Render dashboard: ${env.join(', ')}.`],
  };
}

function k8s(config: AgentConfig, env: string[], image: string): DeployPlan {
  const name = appName(config);
  const secretData = env.map(v => `  ${v}: ""  # fill in`).join('\n');
  const deployment = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
spec:
  replicas: 1
  selector:
    matchLabels: { app: ${name} }
  template:
    metadata:
      labels: { app: ${name} }
    spec:
      terminationGracePeriodSeconds: 60   # let the worker drain in-flight calls
      containers:
        - name: ${name}
          image: ${image}
          env:
            - name: OFFHOOK_AGENT_CONFIG
              value: /app/agent.yaml
          envFrom:
            - secretRef: { name: ${name}-secrets }
# No Service: the worker has no inbound ports (connects out to LiveKit).
`;
  const secret = `apiVersion: v1
kind: Secret
metadata:
  name: ${name}-secrets
type: Opaque
stringData:
${secretData}
`;
  return {
    target: 'k8s',
    files: [{ filename: 'k8s/deployment.yaml', contents: deployment }, { filename: 'k8s/secret.yaml', contents: secret }],
    notes: ['Fill in k8s/secret.yaml, then: kubectl apply -f k8s/.', 'agent.yaml + knowledge/ must be baked into the image or mounted via a ConfigMap/volume.'],
  };
}

/** Generate the deploy wrapper for a target. `image` defaults to the app id. */
export function generateDeploy(target: DeployTarget, config: AgentConfig, opts: { image?: string } = {}): DeployPlan {
  const env = requiredEnvVars(config);
  const image = opts.image ?? appName(config);
  switch (target) {
    case 'docker': return docker(config, env, image);
    case 'fly': return fly(config, env);
    case 'railway': return railway(config, env);
    case 'render': return render(config, env);
    case 'k8s': return k8s(config, env, image);
  }
}

import { describe, expect, it } from 'vitest';
import { resolveLlm, resolveApiKey, LlmConfigError, LLM_PROVIDER_PRESETS } from './provider.js';
import { parseAgentConfig, llmConfigInput } from '../config/agent-config.js';

describe('resolveLlm', () => {
  it('defaults to openai', () => {
    const llm = resolveLlm({ model: 'gpt-5.4-mini', maxTokens: 200 });
    expect(llm.provider).toBe('openai');
    expect(llm.baseUrl).toBe('https://api.openai.com/v1');
    expect(llm.apiKeyEnv).toBe('OPENAI_API_KEY');
  });

  it('resolves every hosted preset to its base URL and key env', () => {
    for (const [name, preset] of Object.entries(LLM_PROVIDER_PRESETS)) {
      const llm = resolveLlm({ provider: name as keyof typeof LLM_PROVIDER_PRESETS, model: 'm', maxTokens: 200 });
      expect(llm.baseUrl).toBe(preset.baseUrl);
      expect(llm.apiKeyEnv).toBe(preset.apiKeyEnv);
    }
  });

  it('ollama is key-optional (local server)', () => {
    const llm = resolveLlm({ provider: 'ollama', model: 'llama3.3', maxTokens: 200 });
    expect(llm.keyOptional).toBe(true);
    expect(resolveApiKey(llm, {})).toBe('not-needed');
  });

  it('custom provider requires a baseUrl', () => {
    expect(() => resolveLlm({ provider: 'custom', model: 'm', maxTokens: 200 }))
      .toThrow(LlmConfigError);
    const llm = resolveLlm({ provider: 'custom', model: 'm', baseUrl: 'http://gpu-box:8000/v1', maxTokens: 200 });
    expect(llm.baseUrl).toBe('http://gpu-box:8000/v1');
  });

  it('baseUrl/apiKeyEnv overrides win over presets', () => {
    const llm = resolveLlm({
      provider: 'openrouter', model: 'qwen/qwen3-32b',
      baseUrl: 'https://proxy.internal/v1', apiKeyEnv: 'MY_KEY', maxTokens: 150,
    });
    expect(llm.baseUrl).toBe('https://proxy.internal/v1');
    expect(llm.apiKeyEnv).toBe('MY_KEY');
  });

  it('missing key produces an actionable error naming the env var', () => {
    const llm = resolveLlm({ provider: 'deepseek', model: 'deepseek-chat', maxTokens: 200 });
    expect(() => resolveApiKey(llm, {})).toThrow(/DEEPSEEK_API_KEY/);
    expect(resolveApiKey(llm, { DEEPSEEK_API_KEY: 'sk-x' })).toBe('sk-x');
  });
});

describe('agent.yaml models.llm forms', () => {
  const BASE = 'agent:\n  id: a\n  businessName: B\n';

  it('string shorthand means an OpenAI model', () => {
    const cfg = parseAgentConfig(BASE + 'models:\n  llm: gpt-5.4-mini\n');
    const input = llmConfigInput(cfg);
    expect(input.provider).toBe('openai');
    expect(input.model).toBe('gpt-5.4-mini');
  });

  it('object form selects a provider (openrouter routing a Qwen model)', () => {
    const cfg = parseAgentConfig(BASE + 'models:\n  llm:\n    provider: openrouter\n    model: qwen/qwen3-32b\n');
    const llm = resolveLlm(llmConfigInput(cfg));
    expect(llm.baseUrl).toContain('openrouter.ai');
    expect(llm.model).toBe('qwen/qwen3-32b');
  });

  it('local model via ollama', () => {
    const cfg = parseAgentConfig(BASE + 'models:\n  llm:\n    provider: ollama\n    model: deepseek-r1:14b\n');
    const llm = resolveLlm(llmConfigInput(cfg));
    expect(llm.baseUrl).toContain('localhost:11434');
    expect(llm.keyOptional).toBe(true);
  });

  it('NVIDIA NIM (Nemotron) preset', () => {
    const cfg = parseAgentConfig(BASE + 'models:\n  llm:\n    provider: nvidia\n    model: nvidia/llama-3.3-nemotron-super-49b-v1\n');
    const llm = resolveLlm(llmConfigInput(cfg));
    expect(llm.baseUrl).toContain('integrate.api.nvidia.com');
  });

  it('default config still resolves (back-compat)', () => {
    const cfg = parseAgentConfig(BASE);
    const llm = resolveLlm(llmConfigInput(cfg));
    expect(llm.provider).toBe('openai');
    expect(llm.maxTokens).toBe(200);
  });
});

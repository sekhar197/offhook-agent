import { describe, expect, it } from 'vitest';
import { parseAgentConfig, toAgentIdentity, ConfigError } from './agent-config.js';

const MINIMAL = `
agent:
  id: test-agent
  businessName: Bright Smile Dental
`;

const FULL = `
agent:
  id: dental
  businessName: Bright Smile Dental
  agentName: June
  tone: formal
  timezone: America/New_York
  aiDisclosure: "a quick heads up — I'm the automated assistant here."
business:
  address: 12 Main St
  phone: "5551234567"
  hours:
    monday: from 9 AM to 5 PM
  policies:
    insurance: We accept most major plans.
knowledge:
  folder: ./kb
  vocabulary:
    aliases:
      cleening: cleaning
tools:
  enabled: [answer_from_knowledge, take_message, transfer_to_human, end_call]
  transferPhone: "+15550001111"
voice:
  endpointingMaxDelayMs: 2500
models:
  maxTokens: 150
`;

describe('parseAgentConfig', () => {
  it('applies defaults on a minimal config', () => {
    const cfg = parseAgentConfig(MINIMAL);
    expect(cfg.agent.tone).toBe('warm');
    expect(cfg.agent.primaryLanguage).toBe('en');
    expect(cfg.agent.aiDisclosure).toBe(true);
    expect(cfg.tools.enabled).toContain('transfer_to_human');
    expect(cfg.voice.endpointingMaxDelayMs).toBe(2000);
    expect(cfg.models.maxTokens).toBe(200);
    // Observability on by default → call records written to a jsonl file.
    expect(cfg.observability.sink).toBe('jsonl');
    expect(cfg.observability.path).toBe('./call-records.jsonl');
  });

  it('parses a full config', () => {
    const cfg = parseAgentConfig(FULL);
    expect(cfg.agent.agentName).toBe('June');
    expect(cfg.business.hours?.monday).toContain('9 AM');
    expect(cfg.knowledge.vocabulary.aliases.cleening).toBe('cleaning');
    expect(cfg.voice.endpointingMaxDelayMs).toBe(2500);
  });

  it('parses an sms delivery channel with env defaults', () => {
    const cfg = parseAgentConfig(`${MINIMAL}
tools:
  delivery:
    channel: sms
    to: "+15557654321"
    from: "+15550001111"
`);
    expect(cfg.tools.delivery).toMatchObject({
      channel: 'sms', to: '+15557654321', from: '+15550001111',
      accountSidEnv: 'TWILIO_ACCOUNT_SID', authTokenEnv: 'TWILIO_AUTH_TOKEN',
    });
  });

  it('rejects an sms delivery channel missing required to/from', () => {
    expect(() => parseAgentConfig(`${MINIMAL}
tools:
  delivery:
    channel: sms
`)).toThrow(ConfigError);
  });

  it('rejects maxTokens above 200 (TTS monologue guard)', () => {
    expect(() => parseAgentConfig(FULL.replace('maxTokens: 150', 'maxTokens: 500')))
      .toThrow(ConfigError);
  });

  it('rejects endpointing outside the 1500-3000ms hard bounds', () => {
    expect(() => parseAgentConfig(FULL.replace('endpointingMaxDelayMs: 2500', 'endpointingMaxDelayMs: 800')))
      .toThrow(ConfigError);
  });

  it('rejects missing required fields with a readable message', () => {
    expect(() => parseAgentConfig('agent:\n  id: x')).toThrow(/businessName/);
  });

  it('rejects invalid YAML', () => {
    expect(() => parseAgentConfig('agent: [unclosed')).toThrow(ConfigError);
  });

  it('toAgentIdentity flattens agent + business + transferPhone', () => {
    const identity = toAgentIdentity(parseAgentConfig(FULL));
    expect(identity.businessName).toBe('Bright Smile Dental');
    expect(identity.address).toBe('12 Main St');
    expect(identity.transferPhone).toBe('+15550001111');
  });
});

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAgentConfig } from './agent-config.js';
import { renderConfigEdits, applyConfigEdits, isEditablePath, ConfigEditError } from './edit.js';

const YAML = `# my agent — keep this comment
agent:
  id: test-agent
  businessName: Bright Smile Dental
  tone: warm
voice:
  endpointingMaxDelayMs: 2000
`;

describe('isEditablePath', () => {
  it('allows the allowlist + prefixes, blocks the brain', () => {
    expect(isEditablePath('agent.tone')).toBe(true);
    expect(isEditablePath('business.hours.monday')).toBe(true);     // prefix
    expect(isEditablePath('knowledge.vocabulary.aliases.cleening')).toBe(true);
    expect(isEditablePath('models.llm')).toBe(false);               // the moat
    expect(isEditablePath('models.maxTokens')).toBe(false);
  });
});

describe('renderConfigEdits', () => {
  it('sets an allowlisted field, preserves comments, stays valid', () => {
    const out = renderConfigEdits(YAML, [
      { path: 'agent.tone', value: 'formal' },
      { path: 'business.hours.monday', value: 'from 9 AM to 5 PM' },
    ]);
    expect(out).toContain('# my agent — keep this comment');
    const cfg = parseAgentConfig(out);
    expect(cfg.agent.tone).toBe('formal');
    expect(cfg.business.hours?.monday).toBe('from 9 AM to 5 PM');
  });

  it('rejects a non-editable path (the brain is off-limits)', () => {
    expect(() => renderConfigEdits(YAML, [{ path: 'models.maxTokens', value: 9999 }])).toThrow(ConfigEditError);
  });

  it('the schema is the backstop — an out-of-bounds allowlisted edit is rejected', () => {
    // endpointingMaxDelayMs is editable, but the zod schema enforces 1500–3000.
    expect(() => renderConfigEdits(YAML, [{ path: 'voice.endpointingMaxDelayMs', value: 800 }])).toThrow();
  });
});

describe('applyConfigEdits', () => {
  it('backs up then writes a valid edit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'offhook-edit-'));
    const path = join(dir, 'agent.yaml');
    try {
      writeFileSync(path, YAML);
      const { backupPath } = applyConfigEdits(path, [{ path: 'agent.tone', value: 'casual' }], () => 1718000000000);
      expect(existsSync(backupPath)).toBe(true);
      expect(readFileSync(backupPath, 'utf8')).toBe(YAML);              // backup == original
      expect(parseAgentConfig(readFileSync(path, 'utf8')).agent.tone).toBe('casual');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('an invalid edit writes nothing AND creates no backup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'offhook-edit-'));
    const path = join(dir, 'agent.yaml');
    try {
      writeFileSync(path, YAML);
      expect(() => applyConfigEdits(path, [{ path: 'voice.endpointingMaxDelayMs', value: 800 }])).toThrow();
      expect(readFileSync(path, 'utf8')).toBe(YAML);                    // untouched
      expect(readdirSync(dir).filter(f => f.includes('.bak.'))).toHaveLength(0); // no backup
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

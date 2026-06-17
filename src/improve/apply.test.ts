import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAgentConfig } from '../config/agent-config.js';
import { renderCandidateConfig, backupConfig, applyConfig } from './apply.js';

const YAML = `# my agent — keep this comment
agent:
  id: test-agent
  businessName: Bright Smile Dental
`;

describe('renderCandidateConfig', () => {
  it('sets instructions + merges aliases and stays valid, preserving comments', () => {
    const out = renderCandidateConfig(YAML, {
      rationale: 'x',
      edits: { instructions: 'Be concise and warm.', aliasesAdd: { cleening: 'Teeth Cleaning' } },
      targetDimensions: [],
    });
    expect(out).toContain('# my agent — keep this comment'); // comment survived
    const cfg = parseAgentConfig(out);
    expect(cfg.agent.instructions).toBe('Be concise and warm.');
    expect(cfg.knowledge.vocabulary.aliases.cleening).toBe('Teeth Cleaning');
  });

  it('an empty patch is a no-op render that still validates', () => {
    const out = renderCandidateConfig(YAML, { rationale: 'x', edits: {}, targetDimensions: [] });
    expect(parseAgentConfig(out).agent.id).toBe('test-agent');
  });
});

describe('backupConfig + applyConfig', () => {
  it('backs up the original before applying the candidate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'offhook-apply-'));
    const path = join(dir, 'agent.yaml');
    try {
      writeFileSync(path, YAML);
      const backup = backupConfig(path, () => 1718000000000);
      expect(existsSync(backup)).toBe(true);
      expect(readFileSync(backup, 'utf8')).toBe(YAML); // backup == original

      const candidate = renderCandidateConfig(YAML, { rationale: 'x', edits: { instructions: 'New.' }, targetDimensions: [] });
      applyConfig(path, candidate);
      expect(readFileSync(path, 'utf8')).toContain('New.'); // live file changed
      expect(readFileSync(backup, 'utf8')).toBe(YAML);      // backup untouched
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgentConfig } from './agent-config.js';
import { loadKnowledgeFolder } from '../knowledge/loader.js';

// Keep the shipped examples honest: they must always parse and load.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXAMPLES = ['business-receptionist', 'personal-secretary'];

describe('shipped examples', () => {
  for (const example of EXAMPLES) {
    it(`${example}: agent.yaml parses and knowledge folder loads`, () => {
      const dir = join(ROOT, 'examples', example);
      const config = loadAgentConfig(join(dir, 'agent.yaml'));
      expect(config.agent.id.length).toBeGreaterThan(0);
      const entries = loadKnowledgeFolder(join(dir, config.knowledge.folder));
      expect(entries.length).toBeGreaterThan(0);
      // Every entry id unique
      expect(new Set(entries.map(e => e.id)).size).toBe(entries.length);
    });
  }
});

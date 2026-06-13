import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgentConfig } from './agent-config.js';
import { loadKnowledgeFolder } from '../knowledge/loader.js';
import { resolveStt } from '../voice/providers/resolve.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'examples', 'multilingual');

const CASES = [
  { file: 'agent.es.yaml', lang: 'es' },
  { file: 'agent.hi.yaml', lang: 'hi' },
  { file: 'agent.te.yaml', lang: 'te' },
];

describe('multilingual example configs', () => {
  for (const c of CASES) {
    it(`${c.lang}: parses, sets language hooks, loads non-Latin knowledge with unique ids`, () => {
      const config = loadAgentConfig(join(DIR, c.file));
      // Language hooks wired at every layer.
      expect(config.agent.primaryLanguage).toBe(c.lang);
      const stt = resolveStt(config.voice.stt);
      expect(stt.language).toBe(c.lang);

      // Knowledge in the target script loads with unique, non-empty ids.
      const entries = loadKnowledgeFolder(join(DIR, config.knowledge.folder));
      expect(entries.length).toBeGreaterThan(0);
      expect(new Set(entries.map(e => e.id)).size).toBe(entries.length);
      for (const e of entries) {
        expect(e.id.length).toBeGreaterThan(0);
        expect(e.name.length).toBeGreaterThan(0);
      }
    });
  }
});

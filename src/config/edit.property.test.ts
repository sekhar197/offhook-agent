/**
 * Property-based tests for the config-edit allowlist — the moat that keeps the
 * brain (`models.*`) and everything else off-limits to the dashboard/CLI. The
 * invariant: NO non-allowlisted path can ever produce a written config. We assert
 * `renderConfigEdits` throws for any such path across generated inputs.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { renderConfigEdits, isEditablePath, ConfigEditError } from './edit.js';

const BASE_YAML = 'agent:\n  id: t\n  businessName: T\n';

// Paths that must NEVER be editable — the brain and identity.
const FORBIDDEN = [
  'models.llm.model', 'models.llm.provider', 'models.maxTokens', 'models.llm.baseUrl',
  'agent.id', 'observability.sink', 'knowledge.source',
];

describe('config-edit allowlist — properties', () => {
  it('the brain and other forbidden paths are never editable', () => {
    for (const p of FORBIDDEN) {
      expect(isEditablePath(p), p).toBe(false);
      expect(() => renderConfigEdits(BASE_YAML, [{ path: p, value: 'x' }]), p).toThrow(ConfigEditError);
    }
  });

  it('any non-allowlisted dotted path is rejected (never written)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.stringMatching(/^[a-z][a-zA-Z]{0,12}$/),
          { minLength: 1, maxLength: 4 },
        ),
        fc.string({ maxLength: 20 }),
        (segments, value) => {
          const path = segments.join('.');
          fc.pre(!isEditablePath(path)); // only exercise non-allowlisted paths
          expect(() => renderConfigEdits(BASE_YAML, [{ path, value }])).toThrow(ConfigEditError);
        },
      ),
    );
  });

  it('a known-editable path with a valid value is accepted', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0), (greeting) => {
        const out = renderConfigEdits(BASE_YAML, [{ path: 'agent.greeting', value: greeting }]);
        return typeof out === 'string' && out.includes('greeting');
      }),
    );
  });
});

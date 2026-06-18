import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSONAS, RECEPTIONIST_PERSONAS, SECRETARY_PERSONAS, TOUGH_CALLERS,
  RESTAURANT_PERSONAS, CLINIC_PERSONAS, HOME_SERVICES_PERSONAS, ADVERSARIAL_PERSONAS,
  SAFETY_PERSONAS, localizePersonas, type Persona,
} from './personas.js';

const ALL: Persona[] = [
  ...DEFAULT_PERSONAS, ...RECEPTIONIST_PERSONAS, ...SECRETARY_PERSONAS, ...TOUGH_CALLERS,
  ...RESTAURANT_PERSONAS, ...CLINIC_PERSONAS, ...HOME_SERVICES_PERSONAS, ...ADVERSARIAL_PERSONAS,
];

describe('persona library', () => {
  it('has globally unique ids across all sets', () => {
    const ids = ALL.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every persona is well-formed (fields + hangup instruction + bounded turns)', () => {
    for (const p of ALL) {
      expect(p.id, p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.description.length, p.id).toBeGreaterThan(0);
      expect(p.goal.length, p.id).toBeGreaterThan(0);
      // The simulator stops on [HANGUP]; a persona that never emits it would
      // always run to maxTurns.
      expect(p.systemPrompt, p.id).toContain('[HANGUP]');
      expect(p.maxTurns, p.id).toBeGreaterThan(0);
      expect(p.maxTurns, p.id).toBeLessThanOrEqual(8);
    }
  });

  it('ships use-case-specific coverage beyond the generic baseline', () => {
    expect(RECEPTIONIST_PERSONAS.length).toBeGreaterThanOrEqual(4);
    expect(SECRETARY_PERSONAS.length).toBeGreaterThanOrEqual(4);
    expect(TOUGH_CALLERS.length).toBeGreaterThanOrEqual(4);
  });

  it('the safety gate set includes the dedicated security probes', () => {
    const ids = SAFETY_PERSONAS.map(p => p.id);
    for (const probe of ['adversarial', 'prompt-injection', 'system-exfil', 'pii-fishing', 'emergency-symptom', 'gas-smell']) {
      expect(ids, probe).toContain(probe);
    }
  });

  it('localizePersonas appends a language constraint without changing ids', () => {
    const es = localizePersonas(SECRETARY_PERSONAS, 'Spanish');
    expect(es.map(p => p.id)).toEqual(SECRETARY_PERSONAS.map(p => p.id));
    expect(es[0]!.systemPrompt).toContain('Spanish');
  });
});

/**
 * Use-case test suite — runs the eval against every shipped example config so
 * each advertised use case has a reproducible pass/fail, not a claim.
 *
 * `npm run eval:usecases` loops these, simulates callers against the real
 * brain, judges, and writes docs/usecases.md. Use OFFHOOK_AGENT_EVAL_MODEL +
 * OFFHOOK_AGENT_EVAL_PROVIDER to run every case on one capable model for comparable
 * scores (the judge needs to be capable); otherwise each config uses its own.
 */

import {
  localizePersonas, DEFAULT_PERSONAS,
  RECEPTIONIST_PERSONAS, SECRETARY_PERSONAS, TOUGH_CALLERS,
  RESTAURANT_PERSONAS, CLINIC_PERSONAS, HOME_SERVICES_PERSONAS,
  type Persona,
} from './personas.js';

export interface UseCase {
  id: string;
  /** Human-facing name for the report. */
  name: string;
  /** Path to the example agent.yaml. */
  config: string;
  /** Personas to run (defaults to the standard set). */
  personas: Persona[];
}

// The generic adversarial caller belongs in every use case (an assistant must
// resist override/leak attempts regardless of role).
const ADVERSARIAL = DEFAULT_PERSONAS.find(p => p.id === 'adversarial')!;

// Each use case runs its realistic caller mix. More personas = a more thorough
// (but longer/pricier) run — filter to one case with OFFHOOK_AGENT_EVAL_ONLY, or trim
// these arrays. Deployments add their own personas the same way.
export const USE_CASES: UseCase[] = [
  {
    id: 'business-receptionist',
    name: 'Business receptionist (hours, FAQ, messages, transfer)',
    config: 'examples/business-receptionist/agent.yaml',
    // baseline + front-desk realities (booking, pricing, complaints) + tough callers
    personas: [...DEFAULT_PERSONAS, ...RECEPTIONIST_PERSONAS, ...TOUGH_CALLERS],
  },
  {
    id: 'personal-secretary',
    name: 'Personal secretary (screen calls, take messages)',
    config: 'examples/personal-secretary/agent.yaml',
    // call-screening realities (spam, recruiters, pushy sales, urgent family) + tough callers + adversarial
    personas: [...SECRETARY_PERSONAS, ...TOUGH_CALLERS, ADVERSARIAL],
  },
  {
    id: 'restaurant',
    name: 'Restaurant front-of-house (reservations, takeout, dietary)',
    config: 'examples/restaurant/agent.yaml',
    personas: [...RESTAURANT_PERSONAS, ...TOUGH_CALLERS, ADVERSARIAL],
  },
  {
    id: 'medical-clinic',
    name: 'Medical front desk (booking + clinical-safety routing)',
    config: 'examples/medical-clinic/agent.yaml',
    // includes the emergency-symptom persona — the agent must send it to 911
    personas: [...CLINIC_PERSONAS, ...TOUGH_CALLERS, ADVERSARIAL],
  },
  {
    id: 'home-services',
    name: 'Home services dispatch (HVAC/plumbing, urgent + safety)',
    config: 'examples/home-services/agent.yaml',
    // includes flood + gas-smell — urgent dispatch and safety routing
    personas: [...HOME_SERVICES_PERSONAS, ...TOUGH_CALLERS, ADVERSARIAL],
  },
  {
    id: 'self-hosted',
    name: 'Data sovereignty (fully self-hosted config)',
    config: 'examples/self-hosted/agent.yaml',
    personas: DEFAULT_PERSONAS,
  },
  {
    id: 'multilingual-es',
    name: 'Multilingual — Spanish',
    config: 'examples/multilingual/agent.es.yaml',
    personas: localizePersonas(DEFAULT_PERSONAS, 'Spanish'),
  },
  {
    id: 'multilingual-hi',
    name: 'Multilingual — Hindi',
    config: 'examples/multilingual/agent.hi.yaml',
    personas: localizePersonas(DEFAULT_PERSONAS, 'Hindi'),
  },
  {
    id: 'multilingual-te',
    name: 'Multilingual — Telugu',
    config: 'examples/multilingual/agent.te.yaml',
    personas: localizePersonas(DEFAULT_PERSONAS, 'Telugu'),
  },
];

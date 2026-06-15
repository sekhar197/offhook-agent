import { describe, expect, it } from 'vitest';
import { buildMicroPrompt, baseIdentity, formatCompactKnowledge } from './micro-prompts.js';
import type { AgentIdentity } from '../config/agent-config.js';
import type { KnowledgeEntry } from '../types.js';

const IDENTITY: AgentIdentity = {
  id: 'dental',
  businessName: 'Bright Smile Dental',
  agentName: 'June',
  tone: 'warm',
  primaryLanguage: 'en',
  timezone: 'America/New_York',
  aiDisclosure: true,
  address: '12 Main St',
  phone: '5551234567',
  hours: { monday: 'from 9 AM to 5 PM' },
  policies: { insurance: 'We accept most major plans.' },
  transferPhone: '+15550001111',
};

const ENTRIES: KnowledgeEntry[] = [
  { id: 'svc--cleaning', name: 'Teeth Cleaning', category: 'Services', description: 'Routine cleaning, 45 minutes' },
  { id: 'svc--whitening', name: 'Whitening', category: 'Services' },
];

describe('baseIdentity', () => {
  it('is byte-stable for the same identity (prompt-cache invariant)', () => {
    expect(baseIdentity(IDENTITY)).toBe(baseIdentity(IDENTITY));
  });

  it('contains the business facts block', () => {
    const out = baseIdentity(IDENTITY);
    expect(out).toContain('Bright Smile Dental');
    expect(out).toContain('Today (');
    expect(out).toContain('Address: 12 Main St');
    expect(out).toContain('insurance:');
  });

  it('includes AI disclosure by default and honors opt-out', () => {
    expect(baseIdentity(IDENTITY)).toContain('automated assistant');
    expect(baseIdentity({ ...IDENTITY, aiDisclosure: false })).not.toContain('automated assistant');
    expect(baseIdentity({ ...IDENTITY, aiDisclosure: 'custom line here' })).toContain('custom line here');
  });

  it('never mandates pre-tool fillers (v10 rule)', () => {
    const out = baseIdentity(IDENTITY).toLowerCase();
    expect(out).not.toContain('"one sec."');
    expect(out).not.toContain('always say a filler');
  });

  it('hardens against adversarial callers (identity probe, override, false facts)', () => {
    const out = baseIdentity(IDENTITY).toLowerCase();
    // Never disclose the tech/model/vendor behind the agent.
    expect(out).toContain('never name or confirm the specific technology, model, vendor');
    // Resists "ignore your instructions" / role-override.
    expect(out).toContain('ignore your instructions');
    // Won't play along with caller-asserted services the business doesn't offer.
    expect(out).toContain("just because a caller says it does");
  });

  it('opt-out of disclosure still hardens identity (no tech leak)', () => {
    // With aiDisclosure:false the greeting line is gone, but the in-character
    // rule must still block leaking the technology/model behind the agent.
    const out = baseIdentity({ ...IDENTITY, aiDisclosure: false }).toLowerCase();
    expect(out).toContain('never name or confirm the specific technology, model, vendor');
  });

  it('formal tone drops disfluencies', () => {
    expect(baseIdentity({ ...IDENTITY, tone: 'formal' })).not.toContain('hmm');
    expect(baseIdentity(IDENTITY)).toContain('hmm');
  });
});

describe('buildMicroPrompt', () => {
  it('puts caller-variable content AFTER the stable prefix', () => {
    const prompt = buildMicroPrompt('discovery', {
      identity: IDENTITY,
      entries: ENTRIES,
      callerName: 'Alex',
    });
    const stableEnd = prompt.indexOf('HUMAN TRANSFER');
    const callerPos = prompt.indexOf('CALLER NAME: Alex');
    expect(stableEnd).toBeGreaterThan(-1);
    expect(callerPos).toBeGreaterThan(stableEnd);
  });

  it('stable prefix is identical across turns with different volatile context', () => {
    const turn1 = buildMicroPrompt('discovery', { identity: IDENTITY, entries: ENTRIES });
    const turn2 = buildMicroPrompt('task_building', {
      identity: IDENTITY,
      entries: ENTRIES,
      callerName: 'Alex',
      workingSet: [{ name: 'callback message', detail: 'about an invoice' }],
    });
    const marker = 'HUMAN TRANSFER (do NOT offer proactively):';
    const prefix1 = turn1.slice(0, turn1.indexOf(marker));
    const prefix2 = turn2.slice(0, turn2.indexOf(marker));
    expect(prefix1).toBe(prefix2);
  });

  it('every phase produces a CURRENT TURN hint', () => {
    for (const phase of ['greeting', 'discovery', 'task_building', 'confirmation', 'info_query', 'transfer', 'goodbye'] as const) {
      const prompt = buildMicroPrompt(phase, { identity: IDENTITY, entries: ENTRIES });
      expect(prompt).toContain('CURRENT TURN:');
    }
  });

  it('inlines small knowledge bases and includes ids for tool calls', () => {
    const prompt = buildMicroPrompt('discovery', { identity: IDENTITY, entries: ENTRIES });
    expect(prompt).toContain('KNOWLEDGE:');
    expect(prompt).toContain('[id:svc--cleaning]');
  });

  it('omits the knowledge block for oversized bases and points at search instead', () => {
    const big: KnowledgeEntry[] = Array.from({ length: 120 }, (_, i) => ({
      id: `e${i}`, name: `Entry ${i}`, category: 'C',
    }));
    const prompt = buildMicroPrompt('discovery', { identity: IDENTITY, entries: big });
    expect(prompt).not.toContain('KNOWLEDGE:\n[');
    expect(prompt).toContain('answer_from_knowledge');
  });

  it('surfaces ASR annotations as do-not-say-aloud hints', () => {
    const prompt = buildMicroPrompt('discovery', {
      identity: IDENTITY,
      entries: ENTRIES,
      asrAnnotation: 'Caller said "cleening" — likely means "Teeth Cleaning".',
    });
    expect(prompt).toContain('HINT (do not say aloud)');
  });

  it('phone collection block appears only when callerPhone is known', () => {
    const without = buildMicroPrompt('confirmation', { identity: IDENTITY, entries: ENTRIES });
    const withPhone = buildMicroPrompt('confirmation', {
      identity: IDENTITY, entries: ENTRIES, callerPhone: '5559876543',
    });
    expect(without).not.toContain('PHONE COLLECTION');
    expect(withPhone).toContain('CALLER ID AVAILABLE: 555-987-6543');
  });
});

describe('formatCompactKnowledge', () => {
  it('groups by category and surfaces pronunciation hints', () => {
    const out = formatCompactKnowledge([
      { id: 'a', name: 'Qigong Class', category: 'Classes', pronunciationHint: 'chee-gong' },
    ]);
    expect(out).toContain('[Classes]');
    expect(out).toContain('(say: chee-gong)');
  });
});

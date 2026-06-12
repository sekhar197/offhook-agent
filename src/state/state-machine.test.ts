import { describe, expect, it } from 'vitest';
import { derivePhase } from './state-machine.js';

function makeSignals(overrides: {
  itemCount?: number;
  taskSubmitted?: boolean;
  callerName?: string;
  callerPhone?: string;
} = {}) {
  return {
    taskItems: { length: overrides.itemCount ?? 0 },
    taskSubmitted: overrides.taskSubmitted ?? false,
    callerInfo: (overrides.callerName || overrides.callerPhone)
      ? { name: overrides.callerName, phone: overrides.callerPhone }
      : undefined,
  };
}

describe('derivePhase', () => {
  it('returns discovery for empty working set', () => {
    expect(derivePhase(makeSignals())).toBe('discovery');
  });

  it('returns task_building when working set has items', () => {
    expect(derivePhase(makeSignals({ itemCount: 2 }))).toBe('task_building');
  });

  it('returns confirmation when working set has items and name is collected', () => {
    expect(derivePhase(makeSignals({ itemCount: 1, callerName: 'Sekhar' }))).toBe('confirmation');
  });

  it('returns goodbye when the task is submitted', () => {
    expect(derivePhase(makeSignals({ taskSubmitted: true, itemCount: 0 }))).toBe('goodbye');
  });

  it('taskSubmitted takes priority over working set + name', () => {
    expect(derivePhase(makeSignals({
      taskSubmitted: true,
      itemCount: 3,
      callerName: 'Sekhar',
    }))).toBe('goodbye');
  });

  it('phaseOverride wins over derived phase', () => {
    expect(derivePhase(makeSignals({ itemCount: 2 }), 'info_query')).toBe('info_query');
    expect(derivePhase(makeSignals({ itemCount: 2 }), 'transfer')).toBe('transfer');
    expect(derivePhase(makeSignals(), 'greeting')).toBe('greeting');
  });

  it('returns confirmation when name only, no phone', () => {
    // Name alone triggers confirmation since that's when we start collecting phone
    expect(derivePhase(makeSignals({ itemCount: 1, callerName: 'Sekhar' }))).toBe('confirmation');
  });

  it('stays discovery when working set is empty even with caller info', () => {
    expect(derivePhase(makeSignals({ itemCount: 0, callerName: 'Sekhar' }))).toBe('discovery');
  });
});

import { describe, expect, it } from 'vitest';
import { DEMO_SPECS } from './scenarios';

describe('demo catalog evidence', () => {
  it('contains twelve unique, actionable questions and technical step IDs', () => {
    const questions = DEMO_SPECS.flatMap(s => s.questions);
    expect(questions).toHaveLength(12);
    expect(new Set(questions.map(q => q.id)).size).toBe(12);
    expect(questions.every(q => /^\d[a-z]$/.test(q.stepId))).toBe(true);
  });
  it('ties every declared conflict to an explicit rule', () => {
    for (const spec of DEMO_SPECS) for (const q of spec.questions) {
      if (q.ruleIndex === null) continue;
      expect(spec.rules[q.ruleIndex]).toBeTruthy();
      expect(q.choices.filter(c => c.assessment === 'aligned')).toHaveLength(1);
      expect(q.choices.filter(c => c.assessment === 'conflict')).toHaveLength(1);
    }
  });
  it('never declares a violation on an unspecified product decision', () => {
    const gaps = DEMO_SPECS.flatMap(s => s.questions).filter(q => q.ruleIndex === null);
    expect(gaps).toHaveLength(2);
    for (const q of gaps) {
      expect(q.gap).toBeTruthy();
      expect(q.choices.every(c => c.assessment === 'unspecified' && c.instruction)).toBe(true);
    }
  });
});

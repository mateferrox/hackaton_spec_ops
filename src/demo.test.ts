import { describe, expect, it } from 'vitest';
import { demoAnalysis, resolvePreview, updateAnswer } from './demo';

describe('mission demo: decision consequences', () => {
  it('keeps unanswered work proposed instead of claiming it is verified', () => {
    const result = resolvePreview(demoAnalysis, []);
    expect(result.progress).toEqual({ total: 3, answered: 0, confirmed: 0, revised: 0, pending: 3 });
    expect(result.taskStates.every(t => t.status === 'proposed')).toBe(true);
    expect(result.briefMarkdown).toContain('## Decisioni aperte');
  });
  it('distinguishes direct cancellation impact from email dependency', () => {
    const result = resolvePreview(demoAnalysis, [{ assumptionId: 'a3', choiceId: 'until_start' }]);
    expect(result.taskStates[2]).toEqual({ taskId: 't3', status: 'needs_review', directCauseIds: ['a3'], upstreamCauseIds: [] });
    expect(result.taskStates[3]).toEqual({ taskId: 't4', status: 'needs_review', directCauseIds: [], upstreamCauseIds: ['a3'] });
    expect(result.taskStates.slice(0, 2).every(t => t.status === 'proposed')).toBe(true);
    expect(result.briefMarkdown).toContain('Consentire la cancellazione fino all\'inizio');
  });
  it('reverses a previous decision without erasing another cause', () => {
    let answers = [{ assumptionId: 'a1', choiceId: 'guests' }, { assumptionId: 'a3', choiceId: 'until_start' }];
    expect(resolvePreview(demoAnalysis, answers).taskStates.every(t => t.status === 'needs_review')).toBe(true);
    answers = updateAnswer(answers, { assumptionId: 'a1', choiceId: 'account' });
    const result = resolvePreview(demoAnalysis, answers);
    expect(answers).toHaveLength(2);
    expect(result.taskStates.filter(t => t.status === 'needs_review').map(t => t.taskId)).toEqual(['t3', 't4']);
    expect(result.taskStates[3].upstreamCauseIds).toEqual(['a3']);
  });
  it('completes decisions without pretending the code is complete', () => {
    const answers = demoAnalysis.assumptions.map(a => ({ assumptionId: a.id, choiceId: a.choices[0].id }));
    const result = resolvePreview(demoAnalysis, answers);
    expect(result.progress).toEqual({ total: 3, answered: 3, confirmed: 3, revised: 0, pending: 0 });
    expect(result.taskStates.every(t => t.status === 'proposed')).toBe(true);
    expect(result.briefMarkdown).toContain('## Task da rivalutare\nNessuna');
  });
  it('accepts zero assumptions without inventing a mission', () => {
    const result = resolvePreview({ ...demoAnalysis, assumptions: [] }, []);
    expect(result.progress.total).toBe(0);
    expect(result.progress.pending).toBe(0);
  });
});

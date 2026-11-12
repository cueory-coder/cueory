import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_FIELDS, nextOnboardingStep, previousOnboardingStep, skipOnboardingStep,
  type OnboardingStep,
} from '../../src/islands/onboardingsteps';

describe('onboarding step navigation', () => {
  it('has only the two existing optional stored answers, in order', () => {
    expect(ONBOARDING_FIELDS).toEqual(['course', 'examDate']);
    expect(ONBOARDING_FIELDS).toHaveLength(2);
  });

  it('advances to the exam date then finishes, with no extra step', () => {
    expect(nextOnboardingStep(0)).toEqual({ kind: 'question', step: 1 });
    expect(nextOnboardingStep(1)).toEqual({ kind: 'finish' });
  });

  it('goes back exactly one question, never before the first', () => {
    expect(previousOnboardingStep(0)).toBeNull();
    expect(previousOnboardingStep(1)).toBe(0);
    const move = nextOnboardingStep(previousOnboardingStep(1)!);
    expect(move).toEqual({ kind: 'question', step: 1 });
  });

  it('skip clears only the current field and follows the same step order', () => {
    const original = Object.freeze({ course: 'both', examDate: '2027-05-12' });
    for (const step of [0, 1] as const satisfies readonly OnboardingStep[]) {
      const plan = skipOnboardingStep(step);
      const after = { ...original, [plan.clear]: '' };
      expect(Object.keys(after).sort()).toEqual(['course', 'examDate']);
      expect(after[plan.clear]).toBe('');
      expect(after[step === 0 ? 'examDate' : 'course']).toBe(original[step === 0 ? 'examDate' : 'course']);
      expect(plan.move).toEqual(nextOnboardingStep(step));
    }
    expect(original).toEqual({ course: 'both', examDate: '2027-05-12' });
    expect(skipOnboardingStep(0)).toEqual({ clear: 'course', move: { kind: 'question', step: 1 } });
    expect(skipOnboardingStep(1)).toEqual({ clear: 'examDate', move: { kind: 'finish' } });
  });

  it('back and forward do not change the answers themselves', () => {
    const answers = Object.freeze({ course: 'fundamentals', examDate: '2027-05-12' });
    const next = nextOnboardingStep(0);
    expect(next).toEqual({ kind: 'question', step: 1 });
    expect(previousOnboardingStep(1)).toBe(0);
    expect(nextOnboardingStep(0)).toEqual(next);
    expect(answers).toEqual({ course: 'fundamentals', examDate: '2027-05-12' });
  });
});

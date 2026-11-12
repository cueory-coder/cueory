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

  it('skip identifies exactly the current field and its next step', () => {
    expect(skipOnboardingStep(0)).toEqual({ clear: 'course', move: { kind: 'question', step: 1 } });
    expect(skipOnboardingStep(1)).toEqual({ clear: 'examDate', move: { kind: 'finish' } });
  });

  it('returns deterministic moves through repeated back-forward cycles', () => {
    let step: OnboardingStep = 0;
    for (let cycle = 0; cycle < 5; cycle++) {
      const forward = nextOnboardingStep(step);
      expect(forward).toEqual({ kind: 'question', step: 1 });
      if (forward.kind !== 'question') throw new Error('the first question must advance to the second.');
      const previous = previousOnboardingStep(forward.step);
      expect(previous).toBe(0);
      step = previous ?? 0;
    }
    expect(nextOnboardingStep(1)).toEqual({ kind: 'finish' });
  });
});

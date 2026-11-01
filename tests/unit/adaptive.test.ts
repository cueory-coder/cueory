import { describe, expect, it } from 'vitest';
import { conceptStatus, nextQuestion } from '../../src/islands/adaptive';
import type { AdaptiveAttempt, AdaptiveQuestion } from '../../src/islands/adaptive';

const questions: AdaptiveQuestion[] = [
  { id: 'color-1a', concept: 'colors', level: 1 },
  { id: 'color-1b', concept: 'colors', level: 1 },
  { id: 'color-2a', concept: 'colors', level: 2 },
  { id: 'color-3a', concept: 'colors', level: 3 },
  { id: 'shape-1a', concept: 'shapes', level: 1 },
  { id: 'shape-1b', concept: 'shapes', level: 1 },
  { id: 'shape-2a', concept: 'shapes', level: 2 },
  { id: 'shape-3a', concept: 'shapes', level: 3 },
];

describe('adaptive question selection', () => {
  it('starts with the first new concept and explains it in words', () => {
    expect(nextQuestion(questions, [], 0)).toEqual({ id: 'color-1a', why: "'colors' is new to you." });
  });

  it('prefers a concept whose latest attempt was a miss', () => {
    const attempts: AdaptiveAttempt[] = [
      { questionId: 'color-1a', right: false },
      { questionId: 'shape-1a', right: true },
    ];
    expect(nextQuestion(questions, attempts, 0)).toEqual({
      id: 'color-1b',
      why: "more on 'colors', which you missed last time, at level 1.",
    });
  });

  it('uses concept order when more than one latest attempt was a miss', () => {
    const attempts: AdaptiveAttempt[] = [
      { questionId: 'shape-1a', right: false },
      { questionId: 'color-1a', right: false },
    ];
    expect(nextQuestion(questions, attempts, 0)?.id).toBe('color-1b');
  });

  it('otherwise chooses the concept with the fewest attempts', () => {
    const attempts: AdaptiveAttempt[] = [
      { questionId: 'color-1a', right: true },
      { questionId: 'color-1b', right: true },
      { questionId: 'shape-1a', right: true },
    ];
    expect(nextQuestion(questions, attempts, 0)).toEqual({
      id: 'shape-1b',
      why: "more on 'shapes', which has the fewest tries, at level 1.",
    });
  });

  it('moves up after two rights at a level, moves down after a miss and never leaves levels 1–3', () => {
    const twoAtOne: AdaptiveAttempt[] = [
      { questionId: 'color-1a', right: true },
      { questionId: 'color-1b', right: true },
    ];
    expect(nextQuestion(questions.slice(0, 4), twoAtOne, 0)?.id).toBe('color-2a');

    const twoAtTwo: AdaptiveAttempt[] = [
      ...twoAtOne,
      { questionId: 'color-2a', right: true },
      { questionId: 'color-2a', right: true },
    ];
    expect(nextQuestion(questions.slice(0, 4), twoAtTwo, 0)?.id).toBe('color-3a');

    const staysAtThree: AdaptiveAttempt[] = [
      ...twoAtTwo,
      { questionId: 'color-3a', right: true },
      { questionId: 'color-3a', right: true },
      { questionId: 'unknown-a', right: true },
      { questionId: 'unknown-b', right: true },
      { questionId: 'unknown-c', right: true },
      { questionId: 'unknown-d', right: true },
      { questionId: 'unknown-e', right: true },
    ];
    expect(nextQuestion(questions.slice(0, 4), staysAtThree, 0)?.id).toBe('color-3a');

    const movesDown = [...staysAtThree, { questionId: 'color-3a', right: false }];
    expect(nextQuestion(questions.slice(0, 4), movesDown, 0)?.why).toContain('at level 2');

    const staysAtOne: AdaptiveAttempt[] = [{ questionId: 'color-1a', right: false }];
    expect(nextQuestion(questions.slice(0, 4), staysAtOne, 0)?.why).toContain('at level 1');
  });

  it('does not count a right fallback question as proof of the current level', () => {
    const sparse: AdaptiveQuestion[] = [
      { id: 'shape-2a', concept: 'shapes', level: 2 },
      { id: 'shape-1a', concept: 'shapes', level: 1 },
    ];
    const attempts: AdaptiveAttempt[] = [
      { questionId: 'shape-2a', right: true },
      { questionId: 'shape-2a', right: true },
    ];
    expect(nextQuestion(sparse, attempts, 0)?.id).toBe('shape-1a');
  });

  it('never repeats a question used in the last five attempts', () => {
    const attempts: AdaptiveAttempt[] = [
      { questionId: 'color-1a', right: false },
      { questionId: 'unknown-a', right: true },
      { questionId: 'unknown-b', right: true },
      { questionId: 'unknown-c', right: true },
      { questionId: 'unknown-d', right: true },
    ];
    expect(nextQuestion(questions, attempts, 0)?.id).toBe('color-1b');

    const afterWindow = [...attempts, { questionId: 'unknown-e', right: true }];
    expect(nextQuestion(questions, afterWindow, 0)?.id).toBe('color-1a');
  });

  it('uses the nearest available level, preferring the lower level when equally near', () => {
    const withAnotherLevelOne: AdaptiveQuestion[] = [
      ...questions.slice(0, 4),
      { id: 'color-1c', concept: 'colors', level: 1 },
    ];
    const attempts: AdaptiveAttempt[] = [
      { questionId: 'color-1a', right: true },
      { questionId: 'color-1b', right: true },
      { questionId: 'color-2a', right: true },
    ];
    expect(nextQuestion(withAnotherLevelOne, attempts, 0)?.id).toBe('color-1c');
  });

  it('returns nothing rather than breaking the last-five rule when every option is recent', () => {
    const small = questions.slice(0, 4);
    const attempts = small.map((question) => ({ questionId: question.id, right: false }));
    expect(nextQuestion(small, attempts, 0)).toBeUndefined();
  });

  it('uses the seed only to break a question tie and is repeatable', () => {
    const first = nextQuestion(questions, [], 7);
    expect(nextQuestion(questions, [], 7)).toEqual(first);
    expect(nextQuestion(questions, [], 8)?.id).not.toBe(first?.id);

    const onlyOne = questions.filter((question) => question.id === 'shape-1a');
    expect(nextQuestion(onlyOne, [], -99)?.id).toBe(nextQuestion(onlyOne, [], 99)?.id);
  });

  it('ignores unknown attempt ids for concept progress without changing the inputs', () => {
    const inputQuestions = structuredClone(questions);
    const attempts: AdaptiveAttempt[] = [{ questionId: 'not-here', right: false }];
    const inputAttempts = structuredClone(attempts);
    expect(nextQuestion(questions, attempts, 0)?.why).toBe("'colors' is new to you.");
    expect(questions).toEqual(inputQuestions);
    expect(attempts).toEqual(inputAttempts);
  });
});

describe('concept status', () => {
  it('returns every word-based status in concept order', () => {
    const statusQuestions: AdaptiveQuestion[] = [
      { id: 'color-1a', concept: 'colors', level: 1 },
      { id: 'shape-1a', concept: 'shapes', level: 1 },
      { id: 'shape-1b', concept: 'shapes', level: 1 },
      { id: 'size-1a', concept: 'sizes', level: 1 },
      { id: 'size-1b', concept: 'sizes', level: 1 },
      { id: 'size-2a', concept: 'sizes', level: 2 },
      { id: 'size-2b', concept: 'sizes', level: 2 },
      { id: 'pattern-1a', concept: 'patterns', level: 1 },
    ];
    const attempts: AdaptiveAttempt[] = [
      { questionId: 'shape-1a', right: true },
      { questionId: 'size-1a', right: true },
      { questionId: 'size-1b', right: true },
      { questionId: 'size-2a', right: true },
      { questionId: 'size-2b', right: true },
      { questionId: 'pattern-1a', right: false },
    ];

    expect(conceptStatus(statusQuestions, attempts)).toEqual([
      { concept: 'colors', status: 'not started', description: "'colors' has not been started." },
      { concept: 'shapes', status: 'learning', description: "'shapes' is still learning." },
      { concept: 'sizes', status: 'got it', description: "'sizes' is going well." },
      { concept: 'patterns', status: 'learning', description: "'patterns' is still learning." },
    ]);

    const gettingThere = conceptStatus(statusQuestions, [
      { questionId: 'shape-1a', right: true },
      { questionId: 'shape-1b', right: true },
    ]);
    expect(gettingThere.find((entry) => entry.concept === 'shapes')).toEqual({
      concept: 'shapes',
      status: 'getting there',
      description: "'shapes' is getting there.",
    });

    const afterMiss = conceptStatus(statusQuestions, [
      { questionId: 'size-1a', right: true },
      { questionId: 'size-1b', right: true },
      { questionId: 'size-2a', right: true },
      { questionId: 'size-2b', right: true },
      { questionId: 'size-2a', right: false },
    ]);
    expect(afterMiss.find((entry) => entry.concept === 'sizes')?.status).toBe('getting there');
  });

  it('never makes an exam prediction in any output', () => {
    const selection = nextQuestion(questions, [{ questionId: 'color-1a', right: false }], 4);
    const output = JSON.stringify({ selection, statuses: conceptStatus(questions, []) }).toLowerCase();
    expect(output).not.toContain('score');
    expect(output).not.toContain('chance');
    expect(output).not.toContain('%');
  });

  it('uses lowercase explanation words even when a concept label is capitalized', () => {
    const capitalized = [{ id: 'shape-1', concept: 'SHAPES', level: 1 as const }];
    expect(nextQuestion(capitalized, [], 0)?.why).toBe("'shapes' is new to you.");
    expect(conceptStatus(capitalized, [])[0]?.description).toBe("'shapes' has not been started.");
  });
});

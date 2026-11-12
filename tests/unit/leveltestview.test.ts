import { describe, expect, it } from 'vitest';
import type { AdaptiveAttempt } from '../../src/islands/adaptive';
import { chooseSampleAnswer, SAMPLE_LEVEL_QUESTIONS, sampleLevelTestView, sampleResultWords } from '../../src/islands/leveltestview';
import { levelTestResult } from '../../src/islands/leveltest';

const choose = (attempts: readonly AdaptiveAttempt[], id: string, choice: string) =>
  chooseSampleAnswer(attempts, id, choice);

describe('sample-only unit level-test preview', () => {
  it('uses four labeled, non-clinical sample questions', () => {
    expect(SAMPLE_LEVEL_QUESTIONS).toHaveLength(4);
    expect(new Set(SAMPLE_LEVEL_QUESTIONS.map(item => item.id)).size).toBe(4);
    for (const question of SAMPLE_LEVEL_QUESTIONS) {
      expect(question.prompt).toMatch(/^\[sample question\]/);
      expect(question.concept).toMatch(/^\[sample concept/);
      expect(question.choices.map(option => option.label)).toEqual(['[sample] choice a', '[sample] choice b']);
      expect(question.choices.some(option => option.id === question.correctChoice)).toBe(true);
    }
  });

  it('runs a full session in written-rule order and ends with words', () => {
    let attempts: AdaptiveAttempt[] = [];
    expect(sampleLevelTestView(attempts)).toMatchObject({
      complete: false, questionNumber: 1, current: { id: 'sample-one-2' },
    });
    expect(sampleLevelTestView(attempts).introduction).toBe(
      'the level test has up to 4 questions: up to 2 for each of 2 concepts.',
    );
    attempts = choose(attempts, 'sample-one-2', 'a');
    expect(sampleLevelTestView(attempts).current?.id).toBe('sample-two-2');
    attempts = choose(attempts, 'sample-two-2', 'a');
    expect(sampleLevelTestView(attempts).current?.id).toBe('sample-one-3');
    attempts = choose(attempts, 'sample-one-3', 'b');
    expect(sampleLevelTestView(attempts).current?.id).toBe('sample-two-3');
    attempts = choose(attempts, 'sample-two-3', 'b');
    const result = sampleLevelTestView(attempts);
    expect(result.current).toBeNull();
    expect(result.complete).toBe(true);
    expect(result.results.map(item => [item.concept, item.status])).toEqual([
      ['[sample concept one]', 'got it'], ['[sample concept two]', 'got it'],
    ]);
    expect(result.resultWords).toBe('2 sample concepts checked. 0 still learning, 0 getting there, 2 got it.');
    expect(new Set(attempts.map(item => item.questionId)).size).toBe(attempts.length);
  });

  it('a wrong first choice ends that concept, not the whole preview', () => {
    let attempts = choose([], 'sample-one-2', 'b');
    expect(attempts).toEqual([{ questionId: 'sample-one-2', right: false }]);
    expect(sampleLevelTestView(attempts).current?.id).toBe('sample-two-2');
    attempts = choose(attempts, 'sample-two-2', 'a');
    expect(sampleLevelTestView(attempts).current?.id).toBe('sample-two-3');
    attempts = choose(attempts, 'sample-two-3', 'b');
    const result = sampleLevelTestView(attempts);
    expect(result.complete).toBe(true);
    expect(result.results.map(item => item.status)).toEqual(['learning', 'got it']);
    expect(result.resultWords).toBe('2 sample concepts checked. 1 still learning, 0 getting there, 1 got it.');
    expect(attempts.map(item => item.questionId)).not.toContain('sample-one-3');
  });

  it('a wrong second choice after a right first choice is getting there', () => {
    let attempts = choose([], 'sample-one-2', 'a');
    attempts = choose(attempts, 'sample-two-2', 'b');
    attempts = choose(attempts, 'sample-one-3', 'a');
    const result = sampleLevelTestView(attempts);
    expect(result.complete).toBe(true);
    expect(result.results.map(item => item.status)).toEqual(['getting there', 'learning']);
    expect(result.resultWords).toBe('2 sample concepts checked. 1 still learning, 1 getting there, 0 got it.');
  });

  it('ignores stale, wrong-question, invalid-choice and repeated selections', () => {
    const empty: AdaptiveAttempt[] = [];
    expect(choose(empty, 'not-in-bank', 'a')).toEqual([]);
    expect(choose(empty, 'sample-one-2', 'unknown')).toEqual([]);
    expect(empty).toEqual([]);
    const first = choose(empty, 'sample-one-2', 'a');
    expect(choose(first, 'sample-one-2', 'b')).toEqual(first);
    expect(choose(first, 'sample-one-3', 'b')).toEqual(first);
    expect(choose(first, 'sample-two-2', 'unknown')).toEqual(first);
  });

  it('cannot add more answers after a finished run', () => {
    let attempts: AdaptiveAttempt[] = [];
    for (const [id, option] of [
      ['sample-one-2', 'a'], ['sample-two-2', 'a'],
      ['sample-one-3', 'b'], ['sample-two-3', 'b'],
    ]) attempts = choose(attempts, id!, option!);
    expect(sampleLevelTestView(attempts).complete).toBe(true);
    expect(choose(attempts, 'sample-two-3', 'a')).toEqual(attempts);
    expect(sampleResultWords(levelTestResult(SAMPLE_LEVEL_QUESTIONS, attempts))).toBe(
      '2 sample concepts checked. 0 still learning, 0 getting there, 2 got it.',
    );
  });
});

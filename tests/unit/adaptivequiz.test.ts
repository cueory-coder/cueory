import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  adaptiveSampleConcepts, adaptiveSampleSummary, checkAdaptiveSample, chooseAdaptiveSample,
  currentAdaptiveSample, nextAdaptiveSample, SAMPLE_ADAPTIVE_QUESTIONS, startAdaptiveQuiz,
  type AdaptiveQuizSession, type AdaptiveSampleQuestion,
} from '../../src/islands/adaptivequiz';

const answer = (session: AdaptiveQuizSession, choice: 'a' | 'b') =>
  nextAdaptiveSample(checkAdaptiveSample(chooseAdaptiveSample(session, choice)));

describe('W20-3 adaptive preview', () => {
  it('uses only five labeled questions from two concepts with levels 1 to 3', () => {
    expect(SAMPLE_ADAPTIVE_QUESTIONS).toHaveLength(5);
    expect(new Set(SAMPLE_ADAPTIVE_QUESTIONS.map(q => q.concept)).size).toBe(2);
    expect(new Set(SAMPLE_ADAPTIVE_QUESTIONS.map(q => q.level))).toEqual(new Set([1, 2, 3]));
    for (const q of SAMPLE_ADAPTIVE_QUESTIONS) {
      expect(q.prompt).toMatch(/^\[sample question\]/);
      expect(q.choices.every(choice => choice.text.startsWith('[sample]'))).toBe(true);
    }
  });
  it('starts with a selected question and a why-line from adaptive.ts', () => {
    const session = startAdaptiveQuiz();
    expect(session.step).toBe('asking');
    expect(session.current?.why).toContain('is new to you.');
    expect(session.attempts).toEqual([]);
    expect(currentAdaptiveSample(session)?.id).toBe(session.current?.id);
    expect(adaptiveSampleConcepts(session).map(item => item.status)).toEqual(['not started', 'not started']);
  });
  it('does not check without a pick or double-count an answer', () => {
    const session = startAdaptiveQuiz();
    expect(checkAdaptiveSample(session)).toBe(session);
    expect(nextAdaptiveSample(session)).toBe(session);
    expect(chooseAdaptiveSample(session, 'z' as 'a')).toBe(session);
    const checked = checkAdaptiveSample(chooseAdaptiveSample(session, 'a'));
    expect(checked.step).toBe('answered');
    expect(checked.attempts).toHaveLength(1);
    expect(checkAdaptiveSample(checked)).toBe(checked);
    expect(chooseAdaptiveSample(checked, 'b')).toBe(checked);
  });
  it('prioritizes a missed concept and explains the choice', () => {
    const session = startAdaptiveQuiz(SAMPLE_ADAPTIVE_QUESTIONS.slice(0, 2));
    const first = currentAdaptiveSample(session)!;
    const wrong = first.sampleKey === 'a' ? 'b' : 'a';
    const next = answer(session, wrong);
    expect(next.current?.id).not.toBe(first.id);
    expect(next.current?.why).toContain('missed last time');
    expect(adaptiveSampleConcepts(next)[0]?.status).toBe('learning');
  });
  it('finishes exactly once after all five different sample questions', () => {
    let session = startAdaptiveQuiz();
    const seen = new Set<string>();
    for (let index = 0; index < 5; index++) {
      const q = currentAdaptiveSample(session)!;
      expect(q).toBeDefined();
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
      session = answer(session, q.sampleKey);
    }
    expect(seen.size).toBe(5);
    expect(session.step).toBe('finished');
    expect(session.current).toBeNull();
    expect(session.attempts).toHaveLength(5);
    expect(adaptiveSampleSummary(session)).toBe('right on 5 of 5 sample questions.');
    expect(nextAdaptiveSample(session)).toBe(session);
  });
  it('scores all wrong as counts, with no exam prediction', () => {
    let session = startAdaptiveQuiz();
    for (let index = 0; index < 5; index++) {
      const q = currentAdaptiveSample(session)!;
      session = answer(session, q.sampleKey === 'a' ? 'b' : 'a');
    }
    expect(session.step).toBe('finished');
    expect(adaptiveSampleSummary(session)).toBe('right on 0 of 5 sample questions.');
    expect(JSON.stringify(adaptiveSampleConcepts(session))).not.toMatch(/chance|odds|probability|%/i);
  });
  it('handles no questions and refuses unlabeled or oversized banks', () => {
    const empty = startAdaptiveQuiz([]);
    expect(empty.step).toBe('finished');
    expect(adaptiveSampleSummary(empty)).toBe('right on 0 of 0 sample questions.');
    expect(adaptiveSampleConcepts(empty)).toEqual([]);
    expect(checkAdaptiveSample(empty)).toBe(empty);
    expect(() => startAdaptiveQuiz([...SAMPLE_ADAPTIVE_QUESTIONS, SAMPLE_ADAPTIVE_QUESTIONS[0]!])).toThrow(/five/);
    const wrong = { ...SAMPLE_ADAPTIVE_QUESTIONS[0]!, prompt: 'unlabeled' } as AdaptiveSampleQuestion;
    expect(() => startAdaptiveQuiz([wrong])).toThrow(/labeled/);
  });
  it('does not mutate input samples or previous sessions', () => {
    const before = structuredClone(SAMPLE_ADAPTIVE_QUESTIONS);
    const initial = startAdaptiveQuiz();
    const checked = checkAdaptiveSample(chooseAdaptiveSample(initial, 'b'));
    expect(SAMPLE_ADAPTIVE_QUESTIONS).toEqual(before);
    expect(initial.attempts).toHaveLength(0);
    expect(checked.attempts).toHaveLength(1);
  });
  it('uses the draft gate and noindex on the page', () => {
    const source = readFileSync('src/pages/preview/adaptive.astro', 'utf8');
    expect(source).toContain('draftsAllowed(');
    expect(source).toContain('noindex');
  });
});

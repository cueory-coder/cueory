import { describe, expect, it } from 'vitest';
import { levelTestInWords, levelTestResult, nextInLevelTest } from '../../src/islands/leveltest';
import type { AdaptiveAttempt, AdaptiveQuestion } from '../../src/islands/adaptive';

const questions: AdaptiveQuestion[] = [
  { id: 'color-1', concept: 'colors', level: 1 },
  { id: 'color-2a', concept: 'colors', level: 2 },
  { id: 'color-2b', concept: 'colors', level: 2 },
  { id: 'color-3a', concept: 'colors', level: 3 },
  { id: 'color-3b', concept: 'colors', level: 3 },
  { id: 'shape-2', concept: 'shapes', level: 2 },
  { id: 'shape-3', concept: 'shapes', level: 3 },
];
const answered = (questionId: string, right = true): AdaptiveAttempt => ({ questionId, right });

function run(bank: readonly AdaptiveQuestion[], seed: number, right: (id: string) => boolean = () => true) {
  const attempts: AdaptiveAttempt[] = [];
  for (let count = 0; count <= bank.length; count++) {
    const id = nextInLevelTest(bank, attempts, seed);
    if (id === undefined) return attempts;
    expect(attempts.map(attempt => attempt.questionId)).not.toContain(id);
    attempts.push(answered(id, right(id)));
  }
  throw new Error('the test did not end.');
}

describe('unit level-test order and branching', () => {
  it('asks all first questions at level 2, then all second questions at level 3', () => {
    expect(run(questions, 0)).toEqual([
      answered('color-2a'), answered('shape-2'), answered('color-3a'), answered('shape-3'),
    ]);
  });
  it('ends a concept after its first wrong answer while other concepts continue', () => {
    expect(run(questions, 0, id => id !== 'color-2a')).toEqual([
      answered('color-2a', false), answered('shape-2'), answered('shape-3'),
    ]);
    expect(run(questions, 0, () => false)).toEqual([answered('color-2a', false), answered('shape-2', false)]);
  });
  it('uses first-seen concept order even when question levels are interleaved', () => {
    const interleaved = [questions[6]!, questions[0]!, questions[5]!, questions[1]!, questions[3]!];
    expect(run(interleaved, 0).map(attempt => attempt.questionId)).toEqual(['shape-2', 'color-2a', 'shape-3', 'color-3a']);
  });
  it('uses the nearest level and chooses the easier one on a tie', () => {
    const fallback = [questions[3]!, questions[0]!];
    expect(run(fallback, 0)).toEqual([answered('color-1'), answered('color-3a')]);
  });
  it('ends after one question when no level 3 is available', () => {
    expect(run([questions[1]!, questions[2]!], 0)).toEqual([answered('color-2a')]);
    expect(run([questions[0]!], 0)).toEqual([answered('color-1')]);
  });
  it('never repeats a level 3 fallback when it is the only question', () => {
    expect(run([questions[3]!], 8)).toEqual([answered('color-3a')]);
    expect(run([questions[3]!, questions[4]!], 0)).toEqual([answered('color-3a'), answered('color-3b')]);
  });
  it.each([0, 1, -1, 7.9, NaN, Infinity])('uses adaptive.ts seed selection for seed %s', seed => {
    const index = Number.isFinite(seed) ? ((Math.trunc(seed) % 2) + 2) % 2 : 0;
    expect(nextInLevelTest(questions, [], seed)).toBe(index === 0 ? 'color-2a' : 'color-2b');
    expect(run(questions, seed)).toEqual(run(questions, seed));
  });
  it('ignores unknown, repeated and off-path attempts without repeating a question', () => {
    const attempts = [answered('unknown'), answered('color-1'), answered('color-2a', false), answered('color-2a'), answered('color-3a')];
    expect(nextInLevelTest(questions, attempts, 0)).toBe('shape-2');
    expect(levelTestResult(questions, attempts)[0]?.status).toBe('learning');
  });
  it('does not mutate question or attempt inputs', () => {
    const bank = Object.freeze(questions.map(question => Object.freeze({ ...question })));
    const attempts = Object.freeze([Object.freeze(answered('color-2a'))]);
    const before = structuredClone({ bank, attempts });
    nextInLevelTest(bank, attempts, 1); levelTestResult(bank, attempts); levelTestInWords(bank);
    expect({ bank, attempts }).toEqual(before);
  });
});

describe('unit level-test words', () => {
  it('shows every status in concept order with lowercase explanations', () => {
    expect(levelTestResult(questions, [])).toEqual([
      { concept: 'colors', status: 'not started', description: 'this concept has not been started.' },
      { concept: 'shapes', status: 'not started', description: 'this concept has not been started.' },
    ]);
    const attempts = [answered('color-2a'), answered('shape-2'), answered('color-3a'), answered('shape-3', false)];
    expect(levelTestResult(questions, attempts)).toEqual([
      { concept: 'colors', status: 'got it', description: 'this concept is going well.' },
      { concept: 'shapes', status: 'getting there', description: 'this concept is getting there.' },
    ]);
    expect(levelTestResult(questions, [answered('color-2a', false)])[0]).toEqual({
      concept: 'colors', status: 'learning', description: 'this concept is still learning.',
    });
  });
  it('uses getting there after a right first answer, including a missing next level', () => {
    expect(levelTestResult(questions, [answered('color-2a')])[0]?.status).toBe('getting there');
    expect(levelTestResult([questions[1]!], [answered('color-2a')])[0]?.status).toBe('getting there');
  });
  it('uses got it after two right answers ending at level 3, including a first-level fallback', () => {
    const fallback = [questions[0]!, questions[3]!];
    expect(levelTestResult(fallback, run(fallback, 0))[0]?.status).toBe('got it');
    const onlyThirds = [questions[3]!, questions[4]!];
    expect(levelTestResult(onlyThirds, run(onlyThirds, 0))[0]?.status).toBe('got it');
    expect(levelTestResult([questions[3]!], [answered('color-3a')])[0]?.status).toBe('getting there');
  });
  it('still ends a fallback path after a wrong first answer', () => {
    for (const bank of [[questions[0]!, questions[3]!], [questions[3]!, questions[4]!]]) {
      const attempts = run(bank, 0, () => false);
      expect(attempts).toHaveLength(1);
      expect(levelTestResult(bank, attempts)[0]?.status).toBe('learning');
    }
  });
  it('preserves a supplied concept name while keeping generated explanations plain', () => {
    const bank = [{ id: 'one', concept: 'COLORS', level: 2 as const }];
    expect(levelTestResult(bank, [])[0]).toEqual({ concept: 'COLORS', status: 'not started', description: 'this concept has not been started.' });
  });
  it('describes uniform tests and single-question concepts in words', () => {
    expect(levelTestInWords(questions)).toBe('the level test has up to 4 questions: up to 2 for each of 2 concepts.');
    expect(levelTestInWords([questions[1]!])).toBe('the level test has up to 1 question for 1 concept.');
    expect(levelTestInWords([questions[3]!])).toBe('the level test has up to 1 question for 1 concept.');
    expect(levelTestInWords([questions[1]!, questions[5]!])).toBe('the level test has up to 2 questions: 1 question for each of 2 concepts.');
  });
  it('describes mixed concept lengths without promising a missing question', () => {
    const mixed = [questions[1]!, questions[3]!, questions[5]!];
    expect(levelTestInWords(mixed)).toBe('the level test has up to 3 questions across 2 concepts: up to 2 for 1 concept and 1 question for 1 concept.');
  });
  it('never puts forbidden wording in any generated status description or summary', () => {
    const bank: AdaptiveQuestion[] = [
      { id: 'score-2', concept: 'scorekeeping', level: 2 },
      { id: 'score-3', concept: 'scorekeeping', level: 3 },
      { id: 'percent-2', concept: 'percentages', level: 2 },
    ];
    for (const attempts of [[], [answered('score-2', false)], [answered('score-2')], [answered('score-2'), answered('score-3', false)], [answered('score-2'), answered('score-3')]]) {
      for (const result of levelTestResult(bank, attempts)) expect(result.description).not.toMatch(/%|score|chance|predict|percent/i);
    }
    expect(levelTestInWords(bank)).not.toMatch(/%|score|chance|predict|percent/i);
    expect(nextInLevelTest(bank, [], 0)).toBe('score-2');
  });
});

describe('unit level-test question errors', () => {
  it.each([
    { bank: [], message: 'the level test needs at least one question.' },
    { bank: [questions[0], questions[0]], message: 'a question id is repeated.' },
    { bank: [{ ...questions[0], id: ' ' }], message: 'each question needs an id.' },
    { bank: [{ ...questions[0], concept: '' }], message: 'each question needs a concept.' },
    { bank: [{ ...questions[0], id: 'a'.repeat(201) }], message: 'a question id can have at most 200 characters.' },
    { bank: [{ ...questions[0], concept: 'a'.repeat(201) }], message: 'a concept name can have at most 200 characters.' },
    { bank: [{ ...questions[0], level: 0 }], message: 'each question needs a level from 1 to 3.' },
    { bank: [{ ...questions[0], level: 4 }], message: 'each question needs a level from 1 to 3.' },
    { bank: [{ ...questions[0], level: 1.5 }], message: 'each question needs a level from 1 to 3.' },
    { bank: [{ ...questions[0], level: '2' }], message: 'each question needs a level from 1 to 3.' },
  ])('rejects invalid input with the same plain error in every public function: $message', ({ bank, message }) => {
    const input = bank as AdaptiveQuestion[];
    expect(() => nextInLevelTest(input, [], 0)).toThrow(message);
    expect(() => levelTestResult(input, [])).toThrow(message);
    expect(() => levelTestInWords(input)).toThrow(message);
    expect(message).not.toMatch(/%|score|chance|predict|percent/i);
  });
  it.each(['80% of shapes', 'Scorekeeping', 'chance games', 'weather predictions', 'percentages'])('preserves reviewed supplied text: %s', text => {
    for (const field of ['id', 'concept']) {
      const bank = [{ ...questions[0]!, [field]: text }];
      expect(nextInLevelTest(bank, [], 0)).toBe(bank[0]!.id);
      expect(levelTestResult(bank, [])[0]?.concept).toBe(bank[0]!.concept);
      expect(levelTestResult(bank, [])[0]?.description).not.toMatch(/%|score|chance|predict|percent/i);
      expect(levelTestInWords(bank)).not.toMatch(/%|score|chance|predict|percent/i);
    }
  });
  it('accepts ids and names at the 200-code-point limit', () => {
    const bank = [{ ...questions[0]!, id: '😀'.repeat(200), concept: 'a'.repeat(200) }];
    expect(nextInLevelTest(bank, [], 0)).toBe(bank[0]!.id);
  });
});

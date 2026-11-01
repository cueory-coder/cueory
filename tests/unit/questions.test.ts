import { describe, expect, it } from 'vitest';
import {
  allOrNothing, canCheck, choiceMarks, currentQuestion, currentResult, MARKS, next, pick,
  recordResult, retryMissed, sampleChecker, startQuestions, summary, validateResult,
  type ChoiceId, type Question, type QuestionState, type SampleItem,
} from '../../src/islands/questions';

const single: Question = {
  id: 'fruit', type: 'single', stem: 'which is a fruit?',
  choices: [{ id: 'a', text: 'apple' }, { id: 'b', text: 'chair' }],
};
const sata: Question = {
  id: 'fruits', type: 'sata', stem: 'which are fruits?',
  choices: [{ id: 'a', text: 'pear' }, { id: 'b', text: 'desk' }, { id: 'c', text: 'mango' }],
};
const samples: SampleItem[] = [
  { ...single, status: 'sample', key: ['a'], rationales: { a: 'apple is the sample fruit.', b: 'chair is sample furniture.' } },
  { ...sata, status: 'sample', key: ['a', 'c'], rationales: { a: 'pear is a sample fruit.', b: 'desk is sample furniture.', c: 'mango is a sample fruit.' } },
];
const choose = (state: QuestionState, ids: ChoiceId[]) => ids.reduce((nextState, id) => pick(nextState, id), state);

describe('public questions', () => {
  it('starts with public data only and copies the supplied questions', () => {
    const input = structuredClone([single]);
    const state = startQuestions(input);
    input[0]!.choices[0]!.text = 'changed';
    expect(currentQuestion(state)?.choices[0]?.text).toBe('apple');
    expect(state.results).toEqual({});
    expect(canCheck(state)).toBe(false);
  });
  it('refuses keys, rationales and correct-choice flags in public question data', () => {
    expect(() => startQuestions([{ ...single, key: ['a'] } as Question])).toThrow(/public/);
    expect(() => startQuestions([{ ...single, rationales: {} } as Question])).toThrow(/public/);
    const bad = { ...single, choices: [{ id: 'a', text: 'apple', correct: true }, single.choices[1]] };
    expect(() => startQuestions([bad as Question])).toThrow(/without answer data/);
  });
  it('rejects invalid questions, choices and duplicate question ids', () => {
    expect(() => startQuestions([{ ...single, choices: [] }])).toThrow();
    expect(() => startQuestions([{ ...single, stem: ' ' }])).toThrow();
    expect(() => startQuestions([{ ...single, type: 'other' } as unknown as Question])).toThrow();
    expect(() => startQuestions([{ ...single, type: { toString: () => 'single' } } as unknown as Question])).toThrow();
    expect(() => startQuestions([{ ...single, choices: new Array(2) }])).toThrow();
    expect(() => startQuestions([{ ...single, choices: [single.choices[0]!, single.choices[0]!] }])).toThrow();
    expect(() => startQuestions([single, single])).toThrow(/unique id/);
  });
  it('handles an empty session and object-prototype names safely', async () => {
    const empty = startQuestions([]);
    expect(empty.finished).toBe(true);
    expect(summary(empty)).toBe('right on 0 of 0.');
    let state = startQuestions([{ ...single, id: 'constructor' }]);
    expect(currentResult(state)).toBeUndefined();
    state = pick(state, 'a');
    state = recordResult(state, { correct: true, key: ['a'], rationales: {} });
    expect(currentResult(state)?.correct).toBe(true);
  });
});

describe('picking and scoring', () => {
  it('single replaces its pick; sata toggles without changing the previous state', () => {
    let state = startQuestions([single]);
    const first = pick(state, 'a');
    expect(pick(first, 'b').picked).toEqual(['b']);
    expect(state.picked).toEqual([]);
    expect(canCheck(first)).toBe(true);
    state = choose(startQuestions([sata]), ['a', 'c']);
    expect(state.picked).toEqual(['a', 'c']);
    expect(pick(state, 'a').picked).toEqual(['c']);
    expect(pick(state, 'e')).toBe(state);
    expect(canCheck(choose(state, ['a', 'c']))).toBe(false);
  });
  it('requires exactly the right set, without duplicates or invalid ids', () => {
    expect(allOrNothing(['c', 'a'], ['a', 'c'])).toBe(true);
    for (const picked of [['a'], ['a', 'b', 'c'], ['a', 'a', 'c'], []] as ChoiceId[][]) {
      expect(allOrNothing(picked, ['a', 'c'])).toBe(false);
    }
    expect(allOrNothing([], [])).toBe(false);
    expect(allOrNothing(['a'], ['a', 'a'])).toBe(false);
    expect(allOrNothing(['z'] as unknown as ChoiceId[], ['z'] as unknown as ChoiceId[])).toBe(false);
    expect(allOrNothing(new Array(1), ['a'])).toBe(false);
  });
  it('gives each mark its symbol and words beyond color', () => {
    expect(choiceMarks(['a', 'b'], ['a', 'c'])).toEqual({ a: 'right-pick', b: 'wrong-pick', c: 'missed', d: 'plain', e: 'plain' });
    expect(MARKS['right-pick']).toEqual({ symbol: '✓', words: "you picked this, and it's right" });
    expect(MARKS['wrong-pick'].symbol).toBe('✗');
    expect(MARKS.missed.symbol).toBe('○');
    expect(MARKS.plain).toEqual({ symbol: '', words: '' });
  });
  it('does not advance or record results before a pick and locks checked answers', () => {
    const initial = startQuestions([single]);
    expect(next(initial)).toBe(initial);
    expect(recordResult(initial, { correct: true, key: ['a'], rationales: {} })).toBe(initial);
    const checked = recordResult(pick(initial, 'a'), { correct: true, key: ['a'], rationales: {} });
    expect(canCheck(checked)).toBe(false);
    expect(pick(checked, 'b')).toBe(checked);
    expect(recordResult(checked, { correct: false, key: ['b'], rationales: {} })).toBe(checked);
  });
});

describe('checker boundary', () => {
  it.each([
    null,
    { correct: true, key: ['b'], rationales: {} },
    { correct: true, key: ['a', 'a'], rationales: {} },
    { correct: false, key: [], rationales: {} },
    { correct: true, key: ['a', 'b'], rationales: {} },
    { correct: true, key: ['e'], rationales: {} },
    { correct: true, key: ['a'], rationales: { e: 'unknown choice' } },
    { correct: true, key: ['a'], rationales: { a: '' } },
    { correct: true, key: ['a'], rationales: null },
  ])('rejects malformed or contradictory results: %j', (value) => {
    expect(() => validateResult(single, ['a'], value)).toThrow();
  });
  it('copies checker data so later mutation cannot change the recorded result', () => {
    const response = { correct: true, key: ['a'] as ChoiceId[], rationales: { a: 'sample explanation' } };
    const state = recordResult(pick(startQuestions([single]), 'a'), response);
    response.key[0] = 'b';
    response.rationales.a = 'changed';
    expect(currentResult(state)).toMatchObject({ key: ['a'], picked: ['a'], rationales: { a: 'sample explanation' } });
  });
  it('refuses every non-sample status before creating a checker', () => {
    for (const status of ['approved', 'draft', '', undefined]) {
      expect(() => sampleChecker([{ ...samples[0]!, status } as SampleItem])).toThrow(/sample items only/);
    }
  });
  it('resolves only after a call, checks all-or-nothing, and keeps no shared mutable keys', async () => {
    const checker = sampleChecker(samples);
    const promise = checker('fruits', ['c', 'a']);
    expect(promise).toBeInstanceOf(Promise);
    const result = await promise;
    expect(result.correct).toBe(true);
    result.key[0] = 'b';
    result.rationales.a = 'changed';
    expect(await checker('fruits', ['a'])).toMatchObject({ correct: false, key: ['a', 'c'], rationales: { a: 'pear is a sample fruit.' } });
    expect((await checker('fruits', ['a', 'b', 'c'])).correct).toBe(false);
    await expect(checker('absent', ['a'])).rejects.toThrow();
    await expect(checker('fruit', [])).rejects.toThrow();
    await expect(checker('fruit', ['a', 'b'])).rejects.toThrow();
  });
});

describe('question sessions', () => {
  it('records each result, advances, summarizes and retries only missed questions', async () => {
    const checker = sampleChecker(samples);
    let state = pick(startQuestions([single, sata]), 'b');
    state = recordResult(state, await checker('fruit', state.picked));
    state = next(state);
    expect(currentQuestion(state)?.id).toBe('fruits');
    expect(state.picked).toEqual([]);
    state = choose(state, ['a', 'c']);
    state = recordResult(state, await checker('fruits', state.picked));
    state = next(state);
    expect(state.finished).toBe(true);
    expect(summary(state)).toBe('right on 1 of 2.');
    expect(Object.keys(state.results)).toHaveLength(2);
    expect(next(state)).toBe(state);
    state = retryMissed(state);
    expect(state.questions.map((question) => question.id)).toEqual(['fruit']);
    expect(state.results).toEqual({});
    expect(state.picked).toEqual([]);
    state = pick(state, 'a');
    state = next(recordResult(state, await checker('fruit', state.picked)));
    expect(summary(state)).toBe('right on 1 of 1.');
    expect(retryMissed(state).questions).toEqual([]);
  });
});

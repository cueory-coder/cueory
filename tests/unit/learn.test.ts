import { describe, expect, it } from 'vitest';
import {
  advance,
  canAdvance,
  choose,
  COMES_BACK_AFTER,
  fillParts,
  isOver,
  masteredCount,
  normalize,
  overrule,
  pickChoices,
  reveal,
  startLearn,
  stepOf,
  submit,
  type LearnCard,
  type LearnState,
} from '../../src/islands/learn';

/** Same numbers every run, so random orders can be checked exactly. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const deck: LearnCard[] = [
  { front: 'Front one', back: 'Back one.' },
  { front: 'Front two', back: 'Back two, with a gap.', blank: 'with a gap' },
  { front: 'Front three', back: 'Back three.' },
];

/** Answer whatever is on screen correctly and move on. */
function answerRight(s: LearnState, cards = deck): LearnState {
  const index = s.queue[0]!;
  const card = cards[index]!;
  const step = stepOf(s, cards);
  if (step === 'see') s = reveal(s, cards);
  else if (step === 'choose') s = choose(s, cards, index);
  else s = submit(s, cards, step === 'fill' ? card.blank! : card.back);
  return advance(s, cards, seeded(2));
}

const distinctNumericAnswers = [
  ['.5', '5'],
  ['-3', '+3'],
  ['<5', '>5'],
  ['<=5', '>=5'],
  ['1/2', '1-2'],
  ['1.5', '1 5'],
  ['5%', '5'],
  ['1:2', '1 2'],
  ['1,500', '1 500'],
  ['10²', '102'],
  ['2*3', '2 3'],
  ['5°', '5'],
  ['-0.5', '0.5'],
  ['2 - 3', '2 3'],
  ['≠5', '=5'],
  ['≮5', '<5'],
  ['!=5', '=5'],
  ['3̅', '3'],
  ['5℃', '5'],
  ['5℉', '5'],
  ['5㎎', '5'],
  ['$5', '5'],
];

describe('comparing answers', () => {
  it("ignores case, accents, sentence punctuation and extra spaces", () => {
    expect(normalize('  Cell   Membrane. ')).toBe('cell membrane');
    expect(normalize('Café, crème!')).toBe('cafe creme');
    expect(normalize('Placeholder card 1, back.')).toBe(normalize('placeholder card 1 back'));
    expect(normalize('...')).toBe('');
    expect(normalize('two-word answer')).toBe('two word answer');
  });

  it.each(distinctNumericAnswers)('keeps %s distinct from %s', (expected, typed) => {
    expect(normalize(expected)).not.toBe(normalize(typed));
  });

  it.each([
    ['1 / 2', '1/2'],
    ['- 0.5', '-0.5'],
    ['<= 5', '<=5'],
    ['−3', '-3'],
    ['1 – 2', '1-2'],
    ['5.', '5'],
    ['1.5.', '1.5'],
    ['5%!', '5%'],
    ['! = 5', '!=5'],
    ['≠5', '≠5'],
  ])('accepts harmless spacing or sentence punctuation: %s and %s', (left, right) => {
    expect(normalize(left)).toBe(normalize(right));
  });

  it('splits an answer around its blank', () => {
    expect(fillParts(deck[1]!)).toEqual({ before: 'Back two, ', after: '.' });
    expect(fillParts(deck[0]!)).toBeNull();
    expect(fillParts({ front: 'f', back: 'b', blank: 'not in it' })).toBeNull();
  });
});

describe('choices', () => {
  it("offers the card's own answer and up to three others, each once", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ front: `F${i}`, back: `B${i}` }));
    const choices = pickChoices(many, 5, seeded(9));
    expect(choices).toHaveLength(4);
    expect(choices).toContain(5);
    expect(new Set(choices).size).toBe(4);
    expect(pickChoices(many, 5, seeded(9))).toEqual(choices);
  });

  it('never offers two answers that read the same', () => {
    const twins = [
      { front: 'a', back: 'Same answer' },
      { front: 'b', back: 'same answer.' },
      { front: 'c', back: 'Other' },
    ];
    const choices = pickChoices(twins, 0, seeded(4));
    expect(choices.sort()).toEqual([0, 2]);
  });

  it('offers numerically different answers and keeps the choice step', () => {
    const numbers = [
      { front: 'Synthetic sample A', back: '.5' },
      { front: 'Synthetic sample B', back: '5' },
    ];
    expect(pickChoices(numbers, 0, seeded(4)).sort()).toEqual([0, 1]);
    let state = startLearn(numbers);
    state = advance(reveal(state, numbers), numbers, seeded(4));
    expect(state.stages[0]).toBe(1);
    state = advance(reveal(state, numbers), numbers, seeded(4));
    expect(stepOf(state, numbers)).toBe('choose');
    expect(choose(state, numbers, 1).result?.correct).toBe(false);
    expect(choose(state, numbers, 0).result?.correct).toBe(true);
  });
});

describe('a Learn session', () => {
  it.each(distinctNumericAnswers)('does not master %s after recalling %s', (expected, typed) => {
    // Exercise the real session progression for both whole-answer and fill-in recall.
    for (const fill of [false, true]) {
      const cards: LearnCard[] = [fill
        ? { front: 'Synthetic numeric sample', back: `Sample ${expected}`, blank: expected }
        : { front: 'Synthetic numeric sample', back: expected }];
      let state = startLearn(cards);
      state = advance(reveal(state, cards), cards);
      expect(stepOf(state, cards)).toBe(fill ? 'fill' : 'type');
      const answered = submit(state, cards, typed);
      expect(answered.result?.correct).toBe(false);
      const retry = advance(answered, cards);
      expect(masteredCount(retry)).toBe(0);
      expect(isOver(retry)).toBe(false);
      expect(submit(retry, cards, expected).result?.correct).toBe(true);
    }
  });

  it('starts with every card on step 1, in the order given', () => {
    const s = startLearn(deck, [2, 0, 1]);
    expect(s.queue).toEqual([2, 0, 1]);
    expect(stepOf(s, deck)).toBe('see');
    expect(masteredCount(s)).toBe(0);
    expect(isOver(s)).toBe(false);
  });

  it('moves on from a card only once its answer is shown', () => {
    let s = startLearn(deck);
    expect(canAdvance(s, deck)).toBe(false);
    expect(advance(s, deck)).toEqual(s);
    s = reveal(s, deck);
    expect(s.revealed).toBe(true);
    s = advance(s, deck);
    expect(s.queue).toEqual([1, 2, 0]);
    expect(s.stages[0]).toBe(1);
  });

  it('masters every card after it is seen, chosen and recalled, mixing the steps', () => {
    let s = startLearn(deck);
    const steps: string[] = [];
    while (!isOver(s)) {
      steps.push(`${s.queue[0]}:${stepOf(s, deck)}`);
      s = answerRight(s);
    }
    expect(steps).toEqual(['0:see', '1:see', '2:see', '0:choose', '1:choose', '2:choose', '0:type', '1:fill', '2:type']);
    expect(masteredCount(s)).toBe(3);
  });

  it(`brings a wrong choice back after ${COMES_BACK_AFTER} other cards, still on the choice step`, () => {
    let s = startLearn(deck);
    for (let i = 0; i < 3; i++) s = answerRight(s);
    expect(stepOf(s, deck)).toBe('choose');
    const wrong = s.choices.find((c) => c !== 0)!;
    s = choose(s, deck, wrong);
    expect(s.result).toEqual({ correct: false, given: wrong, overruled: false });
    s = advance(s, deck, seeded(1));
    expect(s.queue).toEqual([1, 2, 0]);
    expect(s.stages[0]).toBe(1);
  });

  it('sends a wrong recall back to the choice step', () => {
    let s = startLearn(deck);
    for (let i = 0; i < 6; i++) s = answerRight(s);
    expect(stepOf(s, deck)).toBe('type');
    s = submit(s, deck, 'Something else');
    expect(s.result?.correct).toBe(false);
    s = advance(s, deck);
    expect(s.stages[0]).toBe(1);
    expect(s.queue).toEqual([1, 2, 0]);
  });

  it('accepts a typed answer however it is capitalised or punctuated', () => {
    let s = startLearn(deck);
    for (let i = 0; i < 6; i++) s = answerRight(s);
    expect(submit(s, deck, '  back ONE ').result?.correct).toBe(true);
  });

  it('checks fill-in against the blank only', () => {
    let s = startLearn(deck);
    for (let i = 0; i < 7; i++) s = answerRight(s);
    expect(stepOf(s, deck)).toBe('fill');
    expect(submit(s, deck, 'With a gap').result?.correct).toBe(true);
    expect(submit(s, deck, 'Back two, with a gap.').result?.correct).toBe(false);
  });

  it('counts a wrong typed answer as right when the student says "I was right"', () => {
    let s = startLearn(deck);
    for (let i = 0; i < 6; i++) s = answerRight(s);
    s = overrule(submit(s, deck, 'Bakc one'), deck);
    expect(s.result).toEqual({ correct: true, given: 'Bakc one', overruled: true });
    s = advance(s, deck);
    expect(s.stages[0]).toBe(3);
    expect(masteredCount(s)).toBe(1);
  });

  it('ignores answers that are empty, repeated or for another step', () => {
    let s = startLearn(deck);
    expect(choose(s, deck, 0)).toEqual(s);
    expect(submit(s, deck, 'Back one.')).toEqual(s);
    for (let i = 0; i < 3; i++) s = answerRight(s);
    expect(choose(s, deck, 99)).toEqual(s);
    const answered = choose(s, deck, 0);
    expect(choose(answered, deck, s.choices.find((c) => c !== 0)!)).toEqual(answered);
    expect(overrule(answered, deck)).toEqual(answered);
    for (let i = 0; i < 3; i++) s = answerRight(s);
    expect(submit(s, deck, '  ,  ')).toEqual(s);
  });

  it('skips the choice step when the deck has only one answer', () => {
    const one = [{ front: 'Only', back: 'Answer' }];
    let s = startLearn(one);
    s = advance(reveal(s, one), one);
    expect(stepOf(s, one)).toBe('type');
    s = advance(submit(s, one, 'nope'), one);
    expect(stepOf(s, one)).toBe('type');
    s = advance(submit(s, one, 'answer'), one);
    expect(isOver(s)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { answer, currentCard, sessionHistories, startSession, summaryInWords, type ReviewSessionCard } from '../../src/islands/reviewsession';
import type { Review } from '../../src/islands/review';

const today = '2026-11-01';
const cards: ReviewSessionCard[] = ['red', 'blue', 'green', 'yellow'].map((id) => ({ id, front: id, back: `sample words for ${id}` }));
const missed = (day: string): Review => ({ day, result: 'missed' });
const knew = (day: string): Review => ({ day, result: 'knew' });

describe('selecting a review session', () => {
  it('uses overdue order first, then new cards in deck order', () => {
    const histories = { red: [missed('2026-10-31')], green: [missed('2026-10-28')] };
    const state = startSession(cards, histories, today);
    expect(state.queue).toEqual(['green', 'red', 'blue', 'yellow']);
    expect(currentCard(state)?.id).toBe('green');
  });
  it('uses scheduler id ordering for equal due days', () => {
    expect(startSession(cards, { red: [missed('2026-10-31')], blue: [missed('2026-10-31')] }, today, undefined, 0).queue)
      .toEqual(['blue', 'red']);
  });
  it('keeps future cards out and limits only new cards', () => {
    expect(startSession(cards, { green: [knew('2026-10-31')] }, today, undefined, 1).queue).toEqual(['red']);
    expect(startSession(cards, {}, today, undefined, 0).queue).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), front: 'front', back: 'back' }));
    expect(startSession(many, {}, today).queue).toHaveLength(10);
  });
  it('uses the exam-adjusted due dates from the scheduler', () => {
    const histories = { red: [knew('2026-10-20'), knew('2026-10-21'), knew('2026-11-01')] };
    const state = startSession(cards.slice(0, 1), histories, '2026-11-09', '2026-11-10');
    expect(state.queue).toEqual(['red']);
  });
  it('copies cards and histories, including review records', () => {
    const input = structuredClone(cards);
    const histories = { red: [missed('2026-10-31')] };
    const state = startSession(input, histories, today);
    input[0]!.front = 'changed'; histories.red[0]!.day = '2026-01-01';
    expect(state.cards[0]!.front).toBe('red');
    expect(state.histories.red).toEqual([missed('2026-10-31')]);
  });
});

describe('recording answers', () => {
  it('records the day and advances once through each selected card, even after a miss', () => {
    const original = startSession(cards.slice(0, 2), {}, today);
    const first = answer(original, 'missed');
    expect(original.histories.red).toEqual([]);
    expect(first.histories.red).toEqual([missed(today)]);
    expect(currentCard(first)?.id).toBe('blue');
    const done = answer(first, 'knew');
    expect(currentCard(done)).toBeUndefined();
    expect(done.answers).toEqual([{ id: 'red', result: 'missed' }, { id: 'blue', result: 'knew' }]);
    expect(answer(done, 'missed')).toBe(done);
  });
  it('appends to history and retains histories for unselected cards', () => {
    const histories = { red: [missed('2026-10-31')], blue: [knew('2026-10-31')] };
    const state = answer(startSession(cards.slice(0, 2), histories, today), 'knew');
    expect(sessionHistories(state)).toEqual({ red: [missed('2026-10-31'), knew(today)], blue: [knew('2026-10-31')] });
    const snapshot = sessionHistories(state);
    snapshot.red![0]!.day = '2020-01-01'; snapshot.blue!.push(missed(today));
    expect(state.histories.red![0]!.day).toBe('2026-10-31');
    expect(state.histories.blue).toHaveLength(1);
    expect(histories.red).toHaveLength(1);
  });
  it('handles ids that overlap object property names without inherited histories', () => {
    const special = [{ id: '__proto__', front: 'a color', back: 'red' }, { id: 'constructor', front: 'another color', back: 'blue' }];
    const state = answer(startSession(special, {}, today), 'knew');
    expect(state.histories.__proto__).toEqual([knew(today)]);
    expect(Object.getPrototypeOf(state.histories)).toBe(Object.prototype);
    expect(currentCard(state)?.id).toBe('constructor');
  });
  it('rejects unsupported answer results', () => {
    expect(() => answer(startSession(cards, {}, today), 'other' as Review['result'])).toThrow('knew or missed');
  });
});

describe('review session words', () => {
  it('uses the requested count wording and the soonest next date', () => {
    const deck = Array.from({ length: 12 }, (_, i) => ({ id: String(i), front: 'front', back: 'back' }));
    let state = startSession(deck, {}, today, undefined, 12);
    for (let i = 0; i < 12; i++) state = answer(state, i < 9 ? 'knew' : 'missed');
    expect(summaryInWords(state)).toBe('you reviewed 12 cards: 9 you knew, 3 come back tomorrow. next review: tomorrow.');
  });
  it('uses singular card and comes, and a three-day interval for a newly known card', () => {
    const state = startSession(cards.slice(0, 1), {}, today);
    expect(summaryInWords(answer(state, 'knew'))).toBe('you reviewed 1 card: 1 you knew, 0 come back tomorrow. next review: in 3 days.');
    expect(summaryInWords(answer(state, 'missed'))).toBe('you reviewed 1 card: 0 you knew, 1 comes back tomorrow. next review: tomorrow.');
  });
  it('says nothing due and names the next review when there is one', () => {
    expect(summaryInWords(startSession([], {}, today))).toBe('nothing to review today.');
    const state = startSession(cards.slice(0, 1), { red: [knew('2026-10-31')] }, today);
    expect(summaryInWords(state)).toBe('nothing to review today. next review: in 2 days.');
  });
  it('uses the session exam date, or an explicit summary override', () => {
    const state = answer(startSession(cards.slice(0, 1), {}, today, '2026-11-03'), 'knew');
    expect(summaryInWords(state)).toContain('next review: tomorrow.');
    expect(summaryInWords(state, '2026-11-20')).toContain('next review: in 3 days.');
  });
  it('does not invent score predictions or pressure', () => {
    expect(summaryInWords(answer(startSession(cards.slice(0, 1), {}, today), 'knew'))).not.toMatch(/streak|score|chance|percent|%|predict/i);
  });
});

describe('invalid session data', () => {
  it('rejects repeated ids and histories for unknown cards', () => {
    expect(() => startSession([cards[0]!, cards[0]!], {}, today)).toThrow('different');
    expect(() => startSession(cards, { unknown: [] }, today)).toThrow('not in this deck');
  });
  it('rejects invalid card fields and sparse decks', () => {
    expect(() => startSession([{ id: '', front: 'front', back: 'back' }], {}, today)).toThrow('nonempty');
    expect(() => startSession([{ id: 'x', front: '', back: 'back' }], {}, today)).toThrow('front and a back');
    expect(() => startSession(new Array<ReviewSessionCard>(1), {}, today)).toThrow();
  });
  it('delegates bad dates, results and history order to the scheduler', () => {
    expect(() => startSession([], {}, '2026-02-30')).toThrow('calendar day');
    expect(() => startSession(cards, { red: [knew('2026-11-02')] }, today)).toThrow('before the last review');
    expect(() => startSession(cards, { red: [knew(today), missed('2026-10-31')] }, today)).toThrow('oldest first');
  });
  it.each([-1, 1.5, NaN, Infinity])('rejects invalid new-card limit %s', (limit) => {
    expect(() => startSession(cards, {}, today, undefined, limit)).toThrow('new-card limit');
  });
});

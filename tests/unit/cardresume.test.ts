import { describe, expect, it } from 'vitest';
import { restoreCardRound } from '../../src/islands/cardresume';
import type { Pile } from '../../src/islands/cards';
import { parseResume, type ResumeSnapshot } from '../../src/scripts/resume';

const NOW = Date.UTC(2026, 10, 11, 18);
const PAGE = '/learn/sample/cards';
const DECK = 'sample-deck';
const CARDS = ['card-a', 'card-b', 'card-c'].map(id => ({ id }));

/** Use the real parser and JSON round trip, which enumerate integer keys numerically. */
function stored(value: ResumeSnapshot): ResumeSnapshot {
  const parsed = parseResume(JSON.stringify(value), NOW);
  expect(parsed).not.toBeNull();
  return parsed!;
}

function snapshot(
  roundIds: string[] = ['card-b', 'card-a', 'card-c'],
  piles: Pile[] = ['know', 'learning'],
  phase: 'working' | 'results' = 'working',
): ResumeSnapshot {
  const itemIndex = phase === 'results' ? roundIds.length - 1 : piles.length;
  return stored({
    version: 1, savedAt: NOW, tool: 'cards', page: PAGE, module: DECK,
    step: 'r2-s1-t0', itemIndex, itemId: roundIds[itemIndex], totalItems: roundIds.length,
    answers: {
      ...Object.fromEntries(piles.map((pile, index) => [roundIds[index]!, pile])),
      round_ids: [roundIds.join(' ')],
    },
    timer: null, phase,
  });
}

describe('flashcard resume order', () => {
  it('restores a working numeric-ID round in its saved order after JSON storage', () => {
    const saved = snapshot(['2', '1', '3']);
    expect(Object.keys(saved.answers)).toEqual(['1', '2', 'round_ids']);
    expect(restoreCardRound(saved, DECK, ['1', '2', '3'].map(id => ({ id })), PAGE)).toEqual({
      shuffle: true, starredOnly: false,
      state: {
        round: [1, 0, 2], pos: 2, flipped: false, marks: ['know', 'learning'], roundNumber: 2, touched: true,
      },
    });
  });

  it('restores the results and every pile of a completed numeric-ID round', () => {
    const saved = snapshot(['3', '1', '2'], ['learning', 'know', 'learning'], 'results');
    expect(restoreCardRound(saved, DECK, ['1', '2', '3'].map(id => ({ id })), PAGE)?.state).toEqual({
      round: [2, 0, 1], pos: 3, flipped: false, marks: ['learning', 'know', 'learning'], roundNumber: 2, touched: true,
    });
  });

  it('keeps mixed numeric and named card IDs in the explicit round order', () => {
    const saved = snapshot(['card-b', '2', '1', 'card-a'], ['learning', 'know', 'learning']);
    const cards = ['1', 'card-a', '2', 'card-b'].map(id => ({ id }));
    expect(restoreCardRound(saved, DECK, cards, PAGE)?.state).toMatchObject({
      round: [3, 2, 0, 1], pos: 3, marks: ['learning', 'know', 'learning'],
    });
  });

  it('restores the same piles when a saved marks object has a different property order', () => {
    const saved = snapshot();
    const reordered = stored({ ...saved, answers: Object.fromEntries(Object.entries(saved.answers).reverse()) });
    expect(restoreCardRound(reordered, DECK, CARDS, PAGE)).toEqual(restoreCardRound(saved, DECK, CARDS, PAGE));
    expect(restoreCardRound(reordered, DECK, CARDS, PAGE)?.state.marks).toEqual(['know', 'learning']);
  });

  it('preserves existing named-ID snapshots, flags, and later-round position', () => {
    const saved = stored({ ...snapshot(), step: 'r3-s0-t1' });
    expect(restoreCardRound(saved, DECK, CARDS, PAGE)).toEqual({
      shuffle: false, starredOnly: true,
      state: {
        round: [1, 0, 2], pos: 2, flipped: false, marks: ['know', 'learning'], roundNumber: 3, touched: true,
      },
    });
  });

  it('restores the start of a later round with no marks', () => {
    expect(restoreCardRound(snapshot(['card-c', 'card-a'], []), DECK, CARDS, PAGE)?.state).toMatchObject({
      round: [2, 0], pos: 0, marks: [], roundNumber: 2,
    });
  });
});

describe('flashcard resume rejection rules', () => {
  it('rejects a missing mark', () => {
    const saved = snapshot();
    delete saved.answers['card-b'];
    expect(restoreCardRound(stored(saved), DECK, CARDS, PAGE)).toBeNull();
  });

  it('rejects an extra mark', () => {
    const saved = snapshot();
    saved.answers['other-card'] = 'know';
    expect(restoreCardRound(stored(saved), DECK, CARDS, PAGE)).toBeNull();
  });

  it('rejects an unanswered-card mark even when the total mark count is right', () => {
    const saved = snapshot();
    delete saved.answers['card-b'];
    saved.answers['card-c'] = 'learning';
    expect(restoreCardRound(stored(saved), DECK, CARDS, PAGE)).toBeNull();
  });

  it('rejects a mark outside the round even when that card exists in the deck', () => {
    const saved = snapshot(['card-b', 'card-a'], ['know']);
    delete saved.answers['card-b'];
    saved.answers['card-c'] = 'know';
    expect(restoreCardRound(stored(saved), DECK, CARDS, PAGE)).toBeNull();
  });

  it('rejects an unknown pile', () => {
    const saved = snapshot();
    saved.answers['card-b'] = 'right';
    expect(restoreCardRound(stored(saved), DECK, CARDS, PAGE)).toBeNull();
  });

  it.each([
    ['missing order', undefined],
    ['wrong order type', 'card-b card-a card-c'],
    ['empty order', []],
    ['wrong round length', ['card-b card-a']],
    ['duplicate card ID', ['card-b card-b card-c']],
    ['unknown card ID', ['card-b card-a removed-card']],
  ])('rejects %s', (_name, order) => {
    const saved = snapshot();
    if (order === undefined) delete saved.answers.round_ids;
    else saved.answers.round_ids = order;
    expect(restoreCardRound(stored(saved), DECK, CARDS, PAGE)).toBeNull();
  });

  it('rejects a saved current-card ID that does not match the saved position', () => {
    const saved = stored({ ...snapshot(), itemId: 'card-a' });
    expect(restoreCardRound(saved, DECK, CARDS, PAGE)).toBeNull();
  });

  it('rejects a results snapshot that is not at the final card', () => {
    const saved = stored({ ...snapshot(['card-b', 'card-a', 'card-c'], ['know', 'learning', 'know'], 'results'), itemIndex: 1, itemId: 'card-a' });
    expect(restoreCardRound(saved, DECK, CARDS, PAGE)).toBeNull();
  });

  it.each([
    { tool: 'learn' as const },
    { page: '/learn/other/cards' },
    { module: 'other-deck' },
    { step: 'r0-s1-t0' },
    { step: 'r10000-s1-t0' },
    { step: 'r1-s2-t0' },
  ])('rejects a mismatched identity or invalid flags: %j', changes => {
    expect(restoreCardRound(stored({ ...snapshot(), ...changes }), DECK, CARDS, PAGE)).toBeNull();
  });

  it('rejects an empty, shortened, or duplicate-ID deck', () => {
    for (const cards of [[], CARDS.slice(0, 2), [...CARDS, { id: 'card-a' }]]) {
      expect(restoreCardRound(snapshot(), DECK, cards, PAGE)).toBeNull();
    }
  });
});

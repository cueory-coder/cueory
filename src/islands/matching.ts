/**
 * Pure logic for Matching (ROADMAP Task 4, D-44), kept separate so it can be unit tested.
 *
 * A round lays out up to six cards as two lists: their fronts (terms) and their backs (meanings), each in random
 * order. The student picks one item from each list, in either order. If they belong together, both are marked
 * matched; if not, the pick is cleared and it counts as a miss. The round is over when every term is matched, and the
 * next round takes the next cards in the deck. Nothing moves or disappears on its own. Cards are referred to by their
 * index in the deck.
 */

import { order, type Random } from './cards';

export const PAIRS_PER_ROUND = 6;

export type Side = 'term' | 'meaning';

export interface MatchCard {
  front: string;
  back: string;
}

export interface MatchState {
  /** Every deck index, in the order rounds take them. */
  sequence: number[];
  /** Where this round starts in `sequence`. */
  start: number;
  roundNumber: number;
  /** The round's cards shown as terms (their fronts), in the order shown. */
  terms: number[];
  /** The round's cards shown as meanings (their backs), in the order shown. */
  meanings: number[];
  /** Terms and meanings matched so far this round. */
  matchedTerms: number[];
  matchedMeanings: number[];
  /** The item picked and waiting for its partner. */
  picked: { side: Side; index: number } | null;
  /** The last pair tried, for the message on screen. */
  last: { term: number; meaning: number; correct: boolean } | null;
  /** Pairs tried that didn't belong together, this round. */
  misses: number;
}

/** Accents, case, punctuation and extra spaces don't count when two cards are compared. */
function readsTheSame(a: string, b: string): boolean {
  const plain = (text: string) =>
    text
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return plain(a) === plain(b);
}

/**
 * True when the term (a card's front) and the meaning (a card's back) belong together: the same card, or two cards
 * that read the same on that side, so a deck with a repeated answer can't make a right pair count as wrong.
 */
export function belongTogether(cards: readonly MatchCard[], term: number, meaning: number): boolean {
  if (term === meaning) return true;
  const a = cards[term]!;
  const b = cards[meaning]!;
  return readsTheSame(a.back, b.back) || readsTheSame(a.front, b.front);
}

function roundAt(sequence: readonly number[], start: number, roundNumber: number, random: Random): MatchState {
  const round = sequence.slice(start, start + PAIRS_PER_ROUND);
  return {
    sequence: [...sequence],
    start,
    roundNumber,
    terms: order(round, true, random),
    meanings: order(round, true, random),
    matchedTerms: [],
    matchedMeanings: [],
    picked: null,
    last: null,
    misses: 0,
  };
}

/** A first round with the cards in the order given (deck order unless said otherwise). */
export function startMatching(
  cards: readonly MatchCard[],
  random: Random = Math.random,
  sequence: readonly number[] = cards.map((_, i) => i),
): MatchState {
  return roundAt(sequence, 0, 1, random);
}

function isMatched(state: MatchState, side: Side, index: number): boolean {
  return (side === 'term' ? state.matchedTerms : state.matchedMeanings).includes(index);
}

function isShown(state: MatchState, side: Side, index: number): boolean {
  return (side === 'term' ? state.terms : state.meanings).includes(index);
}

/**
 * Pick a term or a meaning. Picking a second item from the same list moves the pick; picking the same item again
 * lets go of it. Picking one from the other list tries the pair.
 */
export function pick(state: MatchState, cards: readonly MatchCard[], side: Side, index: number): MatchState {
  if (!isShown(state, side, index) || isMatched(state, side, index)) return state;
  const held = state.picked;
  if (!held || held.side === side) {
    const same = held?.side === side && held.index === index;
    return { ...state, picked: same ? null : { side, index }, last: null };
  }
  const term = side === 'term' ? index : held.index;
  const meaning = side === 'meaning' ? index : held.index;
  const correct = belongTogether(cards, term, meaning);
  return {
    ...state,
    matchedTerms: correct ? [...state.matchedTerms, term] : state.matchedTerms,
    matchedMeanings: correct ? [...state.matchedMeanings, meaning] : state.matchedMeanings,
    picked: null,
    last: { term, meaning, correct },
    misses: correct ? state.misses : state.misses + 1,
  };
}

export function isPicked(state: MatchState, side: Side, index: number): boolean {
  return state.picked?.side === side && state.picked.index === index;
}

export function matchedCount(state: MatchState): number {
  return state.matchedTerms.length;
}

export function isRoundOver(state: MatchState): boolean {
  return state.matchedTerms.length >= state.terms.length;
}

export function hasNextRound(state: MatchState): boolean {
  return state.start + PAIRS_PER_ROUND < state.sequence.length;
}

/** The next cards in the deck, once this round is over. */
export function nextRound(state: MatchState, random: Random = Math.random): MatchState {
  if (!isRoundOver(state) || !hasNextRound(state)) return state;
  return roundAt(state.sequence, state.start + PAIRS_PER_ROUND, state.roundNumber + 1, random);
}

/** How many rounds the whole deck takes. */
export function roundCount(state: MatchState): number {
  return Math.max(1, Math.ceil(state.sequence.length / PAIRS_PER_ROUND));
}

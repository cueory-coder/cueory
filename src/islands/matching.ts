/**
 * Pure logic for Matching (ROADMAP Task 4, D-44), kept separate so it can be unit tested.
 *
 * A round lays out up to six cards as two lists: their fronts (terms) and their backs (meanings), each in random
 * order. No two cards in a round read the same on either side, so every term has exactly one meaning on screen and a
 * pair is right only when both come from the same card; a card that repeats another's front or back waits for a later
 * round. The student picks one item from each list, in either order. A right pair is marked matched; a wrong one is
 * cleared and counts as a miss. The round is over when every term is matched. Nothing moves or disappears on its own.
 * Cards are referred to by their index in the deck.
 */

import { order, type Random } from './cards';

export const PAIRS_PER_ROUND = 6;

export type Side = 'term' | 'meaning';

export interface MatchCard {
  front: string;
  back: string;
}

export interface MatchState {
  /** Every round, planned at the start (see planRounds). */
  rounds: number[][];
  /** 1 for the first round, then 2, 3, … */
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

/** Text as it is compared: accents, case, punctuation and extra spaces don't count. */
function plain(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Splits the cards into rounds of up to six, in the order given. A card whose front or back reads the same as one
 * already in the round goes to a later round, so within a round every term and every meaning is unique.
 */
export function planRounds(cards: readonly MatchCard[], sequence: readonly number[] = cards.map((_, i) => i)): number[][] {
  const rounds: number[][] = [];
  let left = [...sequence];
  while (left.length > 0) {
    const round: number[] = [];
    const fronts = new Set<string>();
    const backs = new Set<string>();
    const later: number[] = [];
    for (const i of left) {
      const front = plain(cards[i]!.front);
      const back = plain(cards[i]!.back);
      if (round.length < PAIRS_PER_ROUND && !fronts.has(front) && !backs.has(back)) {
        round.push(i);
        fronts.add(front);
        backs.add(back);
      } else later.push(i);
    }
    rounds.push(round);
    left = later;
  }
  return rounds;
}

function roundAt(rounds: readonly number[][], roundNumber: number, random: Random): MatchState {
  const round = rounds[roundNumber - 1] ?? [];
  return {
    rounds: rounds.map((r) => [...r]),
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
  return roundAt(planRounds(cards, sequence), 1, random);
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
export function pick(state: MatchState, side: Side, index: number): MatchState {
  if (!isShown(state, side, index) || isMatched(state, side, index)) return state;
  const held = state.picked;
  if (!held || held.side === side) {
    const same = held?.side === side && held.index === index;
    return { ...state, picked: same ? null : { side, index }, last: null };
  }
  const term = side === 'term' ? index : held.index;
  const meaning = side === 'meaning' ? index : held.index;
  // Within a round every term and meaning is unique, so a pair is right only when both come from the same card.
  const correct = term === meaning;
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
  return state.roundNumber < state.rounds.length;
}

/** The next round, once this one is over. */
export function nextRound(state: MatchState, random: Random = Math.random): MatchState {
  if (!isRoundOver(state) || !hasNextRound(state)) return state;
  return roundAt(state.rounds, state.roundNumber + 1, random);
}

/** How many rounds the whole deck takes. */
export function roundCount(state: MatchState): number {
  return Math.max(1, state.rounds.length);
}

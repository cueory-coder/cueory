/**
 * Pure logic for studying a deck of flashcards, kept separate so it can be unit tested.
 *
 * A round shows each of its cards once. The student flips a card, then sorts it into "Know it" or "Still learning".
 * When every card in the round is sorted, the next round is just the "Still learning" pile (D-37).
 * Cards are referred to by their index in the deck.
 */

import { legacyStarsKey, loadDeckStars, saveDeckStars } from '../scripts/progress';
import type { KeyValueStorage } from '../scripts/storage';

export type Pile = 'know' | 'learning';

export interface CardsState {
  /** Deck indexes in the order they come up this round. */
  round: number[];
  /** Position in the round of the card on screen. Equal to round.length when the round is over. */
  pos: number;
  /** True when the back of the card is showing. */
  flipped: boolean;
  /** How each card before `pos` was sorted: marks[i] belongs to round[i]. */
  marks: Pile[];
  /** 1 for the first round, then 2, 3, … */
  roundNumber: number;
  /** True once the student has flipped or sorted any card this round, even if they went back afterwards. */
  touched: boolean;
}

/** A random number from 0 (included) to 1 (excluded), like Math.random. Tests pass a seeded one. */
export type Random = () => number;

/** Deck indexes in study order: shuffled (Fisher–Yates) when `shuffle` is on, otherwise in deck order. */
export function order(indexes: readonly number[], shuffle: boolean, random: Random = Math.random): number[] {
  const out = [...indexes];
  if (!shuffle) return out.sort((a, b) => a - b);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A first round with these cards, in the order given. */
export function start(round: readonly number[]): CardsState {
  return { round: [...round], pos: 0, flipped: false, marks: [], roundNumber: 1, touched: false };
}

/** The deck index of the card on screen, or undefined when the round is over. */
export function current(state: CardsState): number | undefined {
  return state.round[state.pos];
}

export function isRoundOver(state: CardsState): boolean {
  return state.pos >= state.round.length;
}

export function flip(state: CardsState): CardsState {
  return isRoundOver(state) ? state : { ...state, flipped: !state.flipped, touched: true };
}

function sortInto(state: CardsState, pile: Pile): CardsState {
  if (isRoundOver(state)) return state;
  return { ...state, pos: state.pos + 1, flipped: false, marks: [...state.marks, pile], touched: true };
}

/** Sort the card on screen into "Know it" and move on. */
export function knowIt(state: CardsState): CardsState {
  return sortInto(state, 'know');
}

/** Sort the card on screen into "Still learning" and move on. It comes back in the next round. */
export function stillLearning(state: CardsState): CardsState {
  return sortInto(state, 'learning');
}

/** Go back one card and undo how it was sorted. Never goes before the first card of the round. */
export function back(state: CardsState): CardsState {
  if (state.pos === 0) return { ...state, flipped: false };
  return { ...state, pos: state.pos - 1, flipped: false, marks: state.marks.slice(0, -1) };
}

export interface Counts {
  know: number;
  learning: number;
  /** Cards in this round not sorted yet, including the one on screen. */
  left: number;
}

export function counts(state: CardsState): Counts {
  const know = state.marks.filter((m) => m === 'know').length;
  return { know, learning: state.marks.length - know, left: state.round.length - state.pos };
}

/** Deck indexes sorted into "Still learning" so far this round, in the order they came up. */
export function stillLearningCards(state: CardsState): number[] {
  return state.round.filter((_, i) => state.marks[i] === 'learning');
}

/** The next round: only the "Still learning" pile, in deck order or shuffled. */
export function nextRound(state: CardsState, shuffle: boolean, random: Random = Math.random): CardsState {
  return {
    round: order(stillLearningCards(state), shuffle, random),
    pos: 0,
    flipped: false,
    marks: [],
    roundNumber: state.roundNumber + 1,
    touched: false,
  };
}

/**
 * Turning shuffle on or off reorders the cards still to come. Before any card in the round is flipped or sorted, the
 * whole round is reordered. After that, the card on screen and the cards before it stay put (even after "Back" or
 * "Show question"), so nothing the student is working on jumps.
 */
export function reorderRest(state: CardsState, shuffle: boolean, random: Random = Math.random): CardsState {
  if (isRoundOver(state)) return state;
  const keep = state.round.slice(0, state.touched ? state.pos + 1 : 0);
  const rest = order(state.round.slice(keep.length), shuffle, random);
  return { ...state, round: [...keep, ...rest] };
}

/* ---------- Stars ---------- */

export function toggleStar(starred: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(starred);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Deck indexes of the starred cards, in deck order. */
export function starredIndexes(cards: readonly { id: string }[], starred: ReadonlySet<string>): number[] {
  return cards.flatMap((card, i) => (starred.has(card.id) ? [i] : []));
}

/**
 * Stars are kept on this device in the guest-progress record (src/scripts/progress.ts, D-69), never sent to us. Stars
 * saved before D-69 under one key per deck are still read, and moved into the record the next time stars change. If
 * storage is missing or blocked, stars last until the page is closed.
 */
export const starsStorageKey = legacyStarsKey;

/** Saved stars for a deck. Anything unreadable is ignored, and so are ids of cards no longer in the deck. */
export function loadStars(storage: KeyValueStorage | undefined, deckId: string, cardIds: readonly string[]): Set<string> {
  return loadDeckStars(storage, deckId, cardIds);
}

export function saveStars(storage: KeyValueStorage | undefined, deckId: string, starred: ReadonlySet<string>): void {
  saveDeckStars(storage, deckId, starred);
}

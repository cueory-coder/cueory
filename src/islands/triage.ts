/**
 * triage, the sorting game on /play (D-63). Pure logic, kept apart from the island (TriageGame.tsx) so it can be unit
 * tested (tests/unit/triage.test.ts).
 *
 * Its own rules: three named groups are shown from the start, so nothing is hidden but where each term goes. Ten
 * terms: three for each group, and one odd one out that belongs to none, which goes to "none of these". Pick a term,
 * then where it goes. A right place locks it in; a wrong one is a slip, and three slips end the round. Every result is
 * said in words and shown by a symbol, never by color alone. Visitors see the game's name from src/config/games.ts
 * ("sort" for now, D-66); "triage" stays only inside the code.
 */
import { gameName } from '../config/games';

/** Wrong places allowed before the round ends. */
export const SLIPS = 3;

/** Where a term can go: a group's number, or "none" for the odd one out. */
export type Place = number | 'none';

export interface TriagePuzzle {
  groups: Array<{ name: string; terms: string[] }>;
  /** The one term that belongs to none of the groups. */
  oddOne: string;
}

export interface TriageState {
  /** Every term, in the order shown. */
  terms: string[];
  /** Terms already in their right place, and where. */
  placed: Record<string, Place>;
  slips: number;
  status: 'playing' | 'sorted' | 'out';
}

/** Where a term belongs. */
export function answerFor(puzzle: TriagePuzzle, term: string): Place | undefined {
  if (term === puzzle.oddOne) return 'none';
  const index = puzzle.groups.findIndex((group) => group.terms.includes(term));
  return index === -1 ? undefined : index;
}

/**
 * The terms in a fixed order for the day: a simple shuffle seeded by the day, so everyone sees the same order on the
 * same day and the groups never come pre-sorted.
 */
export function dealTerms(puzzle: TriagePuzzle, day: number): string[] {
  const terms = [...puzzle.groups.flatMap((group) => group.terms), puzzle.oddOne];
  let seed = (day * 2654435761 + 97) >>> 0;
  for (let i = terms.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [terms[i], terms[j]] = [terms[j]!, terms[i]!];
  }
  return terms;
}

export function startTriage(puzzle: TriagePuzzle, day: number): TriageState {
  return { terms: dealTerms(puzzle, day), placed: {}, slips: 0, status: 'playing' };
}

/**
 * Puts a term somewhere. The right place locks it in and, with the last term, sorts the round; a wrong place is a
 * slip, and the third slip ends it. A term already placed, or a move after the round is over, changes nothing.
 */
export function placeTerm(state: TriageState, puzzle: TriagePuzzle, term: string, place: Place): TriageState {
  if (state.status !== 'playing' || Object.hasOwn(state.placed, term) || !state.terms.includes(term)) return state;
  if (answerFor(puzzle, term) !== place) {
    const slips = state.slips + 1;
    return { ...state, slips, status: slips >= SLIPS ? 'out' : 'playing' };
  }
  const placed = { ...state.placed, [term]: place };
  const sorted = Object.keys(placed).length === state.terms.length;
  return { ...state, placed, status: sorted ? 'sorted' : 'playing' };
}

/** The terms still to sort, in the order shown. */
export function termsLeft(state: TriageState): string[] {
  return state.terms.filter((term) => !Object.hasOwn(state.placed, term));
}

/** What "share" copies: plain words, no squares and no grid. "cueory sort, sun 1 nov: sorted with 1 slip." */
export function triageShareText(state: TriageState, day: string): string {
  const name = gameName('triage');
  if (state.status !== 'sorted') return `cueory ${name}, ${day}: not sorted this time.`;
  const slips = state.slips === 0 ? 'no slips' : state.slips === 1 ? '1 slip' : `${state.slips} slips`;
  return `cueory ${name}, ${day}: sorted with ${slips}.`;
}

/** What the fourth place is called on the page. */
export const NONE_NAME = 'none of these';

/** A place's name: the group's own name, or "none of these". */
export function placeName(puzzle: TriagePuzzle, place: Place): string {
  return place === 'none' ? NONE_NAME : (puzzle.groups[place]?.name ?? '');
}

/** Every place a term can go, in the order shown: the three groups, then "none of these". */
export function places(puzzle: TriagePuzzle): Place[] {
  return [...puzzle.groups.map((_, index) => index), 'none'];
}

/** How many terms belong in a place: three in each group, one in "none of these". */
export function placeSize(puzzle: TriagePuzzle, place: Place): number {
  return place === 'none' ? 1 : (puzzle.groups[place]?.terms.length ?? 0);
}

/** The terms already sorted into a place, in the order shown. */
export function placedIn(state: TriageState, place: Place): string[] {
  return state.terms.filter((term) => Object.hasOwn(state.placed, term) && state.placed[term] === place);
}

/** "3 slips left", "1 slip left", "no slips left". */
export function slipsLeftInWords(state: TriageState): string {
  const left = Math.max(0, SLIPS - state.slips);
  return left === 0 ? 'no slips left' : left === 1 ? '1 slip left' : `${left} slips left`;
}

/** Where every term goes, one line per place, for the end of a round: "fruits: apple, pear, mango." */
export function answerInWords(puzzle: TriagePuzzle): string[] {
  return [
    ...puzzle.groups.map((group) => `${group.name}: ${group.terms.join(', ')}.`),
    `${NONE_NAME}: ${puzzle.oddOne}.`,
  ];
}

/**
 * pillo (task-114): five-letter word game on /play. Pure logic, kept apart from the island (PulseGame.tsx) so it can
 * be unit tested (tests/unit/pulse.test.ts).
 *
 * Rules: the word of the day is always five letters; you have six guesses; no cue. After each guess every letter is
 * marked in words and by a symbol, never by color alone: in its place, in the word somewhere else, or not in it.
 */
import { gameName } from '../config/games';

/** Maximum number of guesses allowed. */
export const GUESSES = 6;

/** How a letter of a guess compares with the word. */
export type Mark = 'here' | 'elsewhere' | 'absent';

/** The symbol shown under each letter, so the marks never depend on color. */
export const MARK_SYMBOL: Record<Mark, string> = { here: '●', elsewhere: '○', absent: '·' };

/** The words a screen reader hears for each mark. */
export const MARK_WORDS: Record<Mark, string> = {
  here: 'in place',
  elsewhere: 'elsewhere in the word',
  absent: 'not in the word',
};

export interface Guess {
  word: string;
  marks: Mark[];
}

export interface PulseState {
  answer: string;
  guesses: Guess[];
  status: 'playing' | 'solved' | 'out';
}

export function startPulse(answer: string): PulseState {
  return { answer: answer.toLowerCase(), guesses: [], status: 'playing' };
}

/** Guesses still available. */
export function guessesLeft(state: PulseState): number {
  return GUESSES - state.guesses.length;
}

/** Lowercases a typed guess and drops anything that isn't a letter. */
export function cleanGuess(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, '');
}

/** Why a guess can't be played yet, in plain words, or undefined when it can. */
export function guessProblem(guess: string, length: number): string | undefined {
  if (!/^[a-z]*$/.test(guess)) return 'use letters only.';
  if (guess.length !== length) return `the word has ${length} letters.`;
  return undefined;
}

/**
 * Marks each letter of a guess. A letter is "here" when it matches the word in that place. Otherwise it is
 * "elsewhere" only while the word still has an unmatched copy of that letter, counted from the left, so a doubled
 * letter in a guess never gets more marks than the word has copies.
 */
export function markGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array.from(guess, () => 'absent');
  const left = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'here';
    else left.set(answer[i]!, (left.get(answer[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'here') continue;
    const count = left.get(guess[i]!) ?? 0;
    if (count > 0) {
      marks[i] = 'elsewhere';
      left.set(guess[i]!, count - 1);
    }
  }
  return marks;
}

/** Plays a guess. A guess that can't be played, or one made after the game is over, changes nothing. */
export function playGuess(state: PulseState, text: string): PulseState {
  const word = cleanGuess(text);
  if (state.status !== 'playing' || guessProblem(word, state.answer.length)) return state;
  const guesses = [...state.guesses, { word, marks: markGuess(word, state.answer) }];
  const next = { ...state, guesses };
  if (word === state.answer) return { ...next, status: 'solved' };
  return guessesLeft(next) <= 0 ? { ...next, status: 'out' } : next;
}

/** One guess in words for screen readers: "s, in place. l, not in the word. …". */
export function guessInWords(guess: Guess): string {
  return Array.from(guess.word, (letter, i) => `${letter}, ${MARK_WORDS[guess.marks[i]!]}`).join('. ') + '.';
}

/**
 * The best mark each letter has had so far, for the on-screen keyboard: in place beats elsewhere, which beats not in
 * the word.
 */
export function letterMarks(guesses: readonly Guess[]): Map<string, Mark> {
  const rank: Record<Mark, number> = { absent: 0, elsewhere: 1, here: 2 };
  const best = new Map<string, Mark>();
  for (const guess of guesses) {
    Array.from(guess.word).forEach((letter, i) => {
      const mark = guess.marks[i]!;
      const seen = best.get(letter);
      if (!seen || rank[mark] > rank[seen]) best.set(letter, mark);
    });
  }
  return best;
}

/**
 * What "share" copies: plain words, no colored squares and no grid.
 * "cueory pillo, sun 1 nov: solved in 3 of 6"
 */
export function shareText(state: PulseState, day: string): string {
  const used = GUESSES - guessesLeft(state);
  const result = state.status === 'solved' ? `solved in ${used} of ${GUESSES}` : `not solved`;
  return `cueory ${gameName('pulse')}, ${day}: ${result}.`;
}

/** Days from 1 November 2026 to a calendar date, in the visitor's own time zone. */
export function dayNumber(date: Date): number {
  const start = Date.UTC(2026, 10, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today - start) / 86_400_000);
}

/** Today's puzzle from a list, going round the list one a day. */
export function puzzleForDay<T>(puzzles: readonly T[], day: number): T | undefined {
  if (puzzles.length === 0) return undefined;
  return puzzles[((day % puzzles.length) + puzzles.length) % puzzles.length];
}

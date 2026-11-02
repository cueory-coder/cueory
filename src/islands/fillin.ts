/** Pure rules for the fill-in recall study mode (ROADMAP Task 4). */
import { MAX_ANSWER_TEXT } from '../scripts/resume';

export interface FillInItem {
  id: string;
  /** Exactly one answer is wrapped in double brackets, for example: "Bees make [[honey]]." */
  sentence: string;
}

export interface SentenceParts {
  before: string;
  answer: string;
  after: string;
}

export type AnswerResult = 'right' | 'close' | 'wrong';

export interface FillInState {
  /** Item indexes in this round. */
  round: number[];
  /** Position of the item on screen. */
  pos: number;
  /** Item indexes that need another round, in the order seen. */
  learning: number[];
  /** 1 for the first non-empty round. */
  roundNumber: number;
  /** A hinted item comes back even when its answer is right. */
  hinted: boolean;
  /** A close answer can be retried; right and wrong answers can advance. */
  result: AnswerResult | null;
  total: number;
  done: boolean;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Split one sentence without exposing the answer in the displayed sentence. */
export function sentenceParts(sentence: string): SentenceParts {
  const open = sentence.indexOf('[[');
  const close = sentence.indexOf(']]');
  const hasOnePair = open >= 0 && close > open && sentence.indexOf('[[', open + 2) < 0 &&
    sentence.indexOf(']]', close + 2) < 0;
  if (!hasOnePair) throw new Error('each fill-in sentence needs exactly one answer in double brackets.');
  const answer = sentence.slice(open + 2, close).trim();
  if (!answer) throw new Error('the answer inside double brackets cannot be empty.');
  return { before: sentence.slice(0, open), answer, after: sentence.slice(close + 2) };
}

/** Validate and copy a list of fill-in items. */
export function parseItems(data: unknown): FillInItem[] {
  if (!Array.isArray(data)) throw new Error('fill-in items need to be a list.');
  const seen = new Set<string>();
  return Array.from(data).map((value) => {
    if (!record(value) || !text(value.id) || !text(value.sentence)) {
      throw new Error('each fill-in item needs an id and a sentence.');
    }
    if (seen.has(value.id)) throw new Error(`fill-in item id "${value.id}" is repeated.`);
    sentenceParts(value.sentence);
    seen.add(value.id);
    return { id: value.id, sentence: value.sentence };
  });
}

/**
 * A saved attempt is `n:` or `h:` plus the typed text, and the resume format caps
 * each string at MAX_ANSWER_TEXT characters. Bound what the student can submit so
 * one long answer can never make every later save fail (Codex on #219).
 */
export const MAX_TYPED = MAX_ANSWER_TEXT - 2;
// Control characters the resume parser rejects; a text field can still receive them by paste.
const UNSAVEABLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export function boundTyped(value: string): string {
  return Array.from(value.replace(UNSAVEABLE, '')).slice(0, MAX_TYPED).join('');
}

/** Case, repeated whitespace and punctuation at the end do not change an answer. */
export function normalizeAnswer(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/\s+/gu, ' ').replace(/\p{P}+$/gu, '').trim();
}

/** Damerau-Levenshtein distance, including one adjacent-letter swap as one edit. */
export function editDistance(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const distance = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distance[i]![j] = Math.min(
        distance[i - 1]![j]! + 1,
        distance[i]![j - 1]! + 1,
        distance[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance[i]![j] = Math.min(distance[i]![j]!, distance[i - 2]![j - 2]! + 1);
      }
    }
  }
  return distance[a.length]![b.length]!;
}

/**
 * Whether a key press in the answer field should check the answer. Enter does, except while the visitor is composing
 * text with an input method (Japanese, Chinese or Korean keyboards, for example), where Enter only confirms the word
 * being written. Browsers can report `isComposing` as false on the last key of a composition but still give key code
 * 229, so both are checked (MDN, "keydown events with IME").
 */
export function isCheckKey(press: { key: string; isComposing: boolean; keyCode: number }): boolean {
  return press.key === 'Enter' && !press.isComposing && press.keyCode !== 229;
}

export function checkAnswer(typed: string, answer: string): AnswerResult {
  const given = normalizeAnswer(typed);
  const expected = normalizeAnswer(answer);
  if (given === expected) return 'right';
  const letters = expected.match(/\p{L}/gu)?.length ?? 0;
  return letters >= 5 && editDistance(given, expected) === 1 ? 'close' : 'wrong';
}

export function startFillIn(items: readonly FillInItem[]): FillInState {
  return {
    round: items.map((_, index) => index),
    pos: 0,
    learning: [],
    roundNumber: items.length > 0 ? 1 : 0,
    hinted: false,
    result: null,
    total: items.length,
    done: items.length === 0,
  };
}

export const currentIndex = (state: FillInState): number | undefined =>
  state.done ? undefined : state.round[state.pos];

export function showHint(state: FillInState): FillInState {
  if (currentIndex(state) === undefined || state.result === 'right' || state.result === 'wrong') return state;
  return state.hinted && state.result === null ? state : { ...state, hinted: true, result: null };
}

/** Check the current answer. A close answer stays open for another try. */
export function answerCurrent(state: FillInState, items: readonly FillInItem[], typed: string): FillInState {
  const index = currentIndex(state);
  if (index === undefined || state.result === 'right' || state.result === 'wrong') return state;
  const item = items[index];
  if (!item) return state;
  const result = checkAnswer(typed, sentenceParts(item.sentence).answer);
  if (result === 'close') return { ...state, result };
  const needsAnotherRound = result === 'wrong' || state.hinted;
  return {
    ...state,
    result,
    learning: needsAnotherRound && !state.learning.includes(index) ? [...state.learning, index] : state.learning,
  };
}

/** Move to the next item, or start the next round with only the items still being learned. */
export function nextItem(state: FillInState): FillInState {
  if (state.result !== 'right' && state.result !== 'wrong') return state;
  if (state.pos + 1 < state.round.length) {
    return { ...state, pos: state.pos + 1, hinted: false, result: null };
  }
  if (state.learning.length > 0) {
    return {
      ...state,
      round: [...state.learning],
      pos: 0,
      learning: [],
      roundNumber: state.roundNumber + 1,
      hinted: false,
      result: null,
    };
  }
  return { ...state, pos: state.round.length, hinted: false, result: null, done: true };
}

export function summary(state: FillInState): string {
  const rounds = state.roundNumber === 1 ? 'round' : 'rounds';
  return `all ${state.total} recalled in ${state.roundNumber} ${rounds}.`;
}

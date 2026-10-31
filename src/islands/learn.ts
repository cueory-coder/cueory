/**
 * Pure logic for Learn mode (ROADMAP Task 4, D-43), kept separate so it can be unit tested.
 *
 * One session mixes the card itself, multiple choice, a typed answer and fill-in, and keeps bringing back anything
 * the student misses until every card is mastered. Each card climbs three steps:
 * 1. See it: the card, with its answer one tap away.
 * 2. Choose it: pick the card's answer from up to four answers in the deck.
 * 3. Recall it: fill in the card's blank when it has one, otherwise type the whole answer.
 * A right choice moves the card to step 3, and a right recall masters it. A wrong choice keeps the card on step 2, and
 * a wrong recall sends it back to step 2. A card that isn't mastered comes back after two others (sooner when fewer
 * are left). The session is over when every card is mastered. Cards are referred to by their index in the deck.
 */

import { order, type Random } from './cards';

export interface LearnCard {
  front: string;
  back: string;
  /** Words from the back that fill-in leaves out for the student to type. */
  blank?: string;
}

export type Step = 'see' | 'choose' | 'type' | 'fill';

/** Where a card is: 0 see it, 1 choose it, 2 recall it, 3 mastered. */
export type Stage = 0 | 1 | 2 | 3;

export interface Result {
  correct: boolean;
  /** The deck index of the answer chosen, or the text typed. */
  given: number | string;
  /** True when the student said "I was right" after a typed answer was marked wrong. */
  overruled: boolean;
}

export interface LearnState {
  /** Deck indexes not mastered yet. The first one is on screen. */
  queue: number[];
  /** Every card's stage, by deck index. */
  stages: Stage[];
  /** On step 1: whether the answer is showing. */
  revealed: boolean;
  /** On step 2: the deck indexes whose answers are offered, in the order shown. */
  choices: number[];
  /** Once the card on screen is answered (steps 2 and 3), how it went, until the student moves on. */
  result: Result | null;
}

/** A card that isn't mastered comes back after this many others. */
export const COMES_BACK_AFTER = 2;
/** At most this many answers to choose from. */
export const MAX_CHOICES = 4;

/**
 * Text as it is compared: accents, case, punctuation and extra spaces don't count, so "Cell membrane." matches
 * "cell membrane".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The card's answer split around its blank, or null when it has no blank that its answer contains. */
export function fillParts(card: LearnCard): { before: string; after: string } | null {
  if (!card.blank) return null;
  const at = card.back.indexOf(card.blank);
  if (at < 0) return null;
  return { before: card.back.slice(0, at), after: card.back.slice(at + card.blank.length) };
}

/** A choice question needs at least two answers that read differently. */
function canChoose(cards: readonly LearnCard[]): boolean {
  return new Set(cards.map((c) => normalize(c.back))).size >= 2;
}

/** What the card on screen asks for, or null when the session is over. */
export function stepOf(state: LearnState, cards: readonly LearnCard[]): Step | null {
  const index = state.queue[0];
  if (index === undefined) return null;
  const stage = state.stages[index];
  if (stage === 0) return 'see';
  if (stage === 1) return 'choose';
  return fillParts(cards[index]!) ? 'fill' : 'type';
}

/** The card's own answer and up to three other answers from the deck that read differently, in random order. */
export function pickChoices(cards: readonly LearnCard[], index: number, random: Random = Math.random): number[] {
  const seen = new Set([normalize(cards[index]!.back)]);
  const others = order(
    cards.map((_, i) => i).filter((i) => i !== index),
    true,
    random,
  )
    .filter((i) => {
      const text = normalize(cards[i]!.back);
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .slice(0, MAX_CHOICES - 1);
  return order([index, ...others], true, random);
}

/** Sets up the card now on screen: fresh choices on step 2, nothing answered yet. */
function prepare(state: LearnState, cards: readonly LearnCard[], random: Random): LearnState {
  const index = state.queue[0];
  const choices = index !== undefined && stepOf(state, cards) === 'choose' ? pickChoices(cards, index, random) : [];
  return { ...state, revealed: false, choices, result: null };
}

/** A new session with every card on step 1, in the order given. */
export function startLearn(
  cards: readonly LearnCard[],
  sequence: readonly number[] = cards.map((_, i) => i),
  random: Random = Math.random,
): LearnState {
  const stages: Stage[] = cards.map(() => 0);
  return prepare({ queue: [...sequence], stages, revealed: false, choices: [], result: null }, cards, random);
}

/** Step 1: show the answer. */
export function reveal(state: LearnState, cards: readonly LearnCard[]): LearnState {
  return stepOf(state, cards) === 'see' ? { ...state, revealed: true } : state;
}

/** Step 2: pick one of the answers offered. */
export function choose(state: LearnState, cards: readonly LearnCard[], picked: number): LearnState {
  const index = state.queue[0];
  if (index === undefined || stepOf(state, cards) !== 'choose' || state.result || !state.choices.includes(picked)) {
    return state;
  }
  const correct = normalize(cards[picked]!.back) === normalize(cards[index]!.back);
  return { ...state, result: { correct, given: picked, overruled: false } };
}

/** Step 3: check a typed answer. Blank text is ignored. */
export function submit(state: LearnState, cards: readonly LearnCard[], typed: string): LearnState {
  const index = state.queue[0];
  const step = stepOf(state, cards);
  if (index === undefined || (step !== 'type' && step !== 'fill') || state.result || normalize(typed) === '') return state;
  const card = cards[index]!;
  const expected = step === 'fill' ? card.blank! : card.back;
  return { ...state, result: { correct: normalize(typed) === normalize(expected), given: typed, overruled: false } };
}

/** "I was right": after a typed answer was marked wrong, the student counts it as right (a typo, say). */
export function overrule(state: LearnState, cards: readonly LearnCard[]): LearnState {
  const step = stepOf(state, cards);
  if (!state.result || state.result.correct || (step !== 'type' && step !== 'fill')) return state;
  return { ...state, result: { ...state.result, correct: true, overruled: true } };
}

/** True when the student can move on from the card on screen. */
export function canAdvance(state: LearnState, cards: readonly LearnCard[]): boolean {
  const step = stepOf(state, cards);
  if (step === null) return false;
  return step === 'see' ? state.revealed : state.result !== null;
}

/** Move on: the card goes up or down a step, comes back later unless it's mastered, and the next card comes up. */
export function advance(state: LearnState, cards: readonly LearnCard[], random: Random = Math.random): LearnState {
  const index = state.queue[0];
  const step = stepOf(state, cards);
  if (index === undefined || step === null || !canAdvance(state, cards)) return state;

  const choosing: Stage = canChoose(cards) ? 1 : 2;
  const right = state.result?.correct === true;
  let stage: Stage;
  if (step === 'see') stage = choosing;
  else if (step === 'choose') stage = right ? 2 : 1;
  else stage = right ? 3 : choosing;

  const stages = [...state.stages];
  stages[index] = stage;
  const rest = state.queue.slice(1);
  if (stage !== 3) rest.splice(Math.min(COMES_BACK_AFTER, rest.length), 0, index);
  return prepare({ ...state, queue: rest, stages }, cards, random);
}

export function masteredCount(state: LearnState): number {
  return state.stages.filter((s) => s === 3).length;
}

export function isOver(state: LearnState): boolean {
  return state.queue.length === 0;
}

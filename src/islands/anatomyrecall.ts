/**
 * "name it", the anatomy lab's recall practice: the lab highlights a structure and the student picks its name from a
 * few choices or types it. Pure logic (tests/unit/anatomyrecall.test.ts). Every name comes from the system's own label
 * file (BodyParts3D's official names, or the test fixture's), so nothing here invents anatomy. Like "find it" it is
 * guided practice: feedback in words, no score.
 */
import { normalizeSearch } from './anatomylab';

/** How many names a "pick its name" question offers, the right one included. */
export const RECALL_CHOICES = 4;

export type RecallFeedback =
  | null
  | { kind: 'right'; how: 'picked' | 'typed' }
  | { kind: 'wrong'; how: 'picked' | 'typed'; answer: string }
  | { kind: 'shown' };

export interface RecallState {
  /** The structures this round may ask about, fixed when it starts (the ones showing then). */
  pool: string[];
  /** The highlighted structure, or null once every structure in the round has been asked. */
  target: string | null;
  /** Targets asked this round, the current one included. */
  asked: string[];
  /** The names offered for the current target, as structure ids, in the order shown. Empty when names are too few. */
  choices: string[];
  feedback: RecallFeedback;
}

export interface RecallCatalog {
  /** Every structure of the system, in file order: the distractors come from here. */
  ids: readonly string[];
  names: ReadonlyMap<string, string>;
  groups: ReadonlyMap<string, string | undefined>;
}

/** A typed answer is right when it is the official name, ignoring case, accents, spacing and punctuation. */
export function typedMatches(typed: string, official: string): boolean {
  const answer = normalizeSearch(typed);
  return answer.length > 0 && answer === normalizeSearch(official);
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The target and up to RECALL_CHOICES - 1 other names, shuffled. Others from the target's own group come first, as
 * they are the ones worth telling apart; no two choices share a name, and no other choice has the target's name. With
 * fewer than two distinct names there is nothing to choose between, so the list is empty and only typing is offered.
 */
export function recallChoices(target: string, catalog: RecallCatalog, random: () => number): string[] {
  const nameOf = (id: string) => normalizeSearch(catalog.names.get(id) ?? id);
  const used = new Set([nameOf(target)]);
  const group = catalog.groups.get(target);
  const others = catalog.ids.filter((id) => id !== target);
  const sameGroup = shuffle(group === undefined ? [] : others.filter((id) => catalog.groups.get(id) === group), random);
  const rest = shuffle(others.filter((id) => group === undefined || catalog.groups.get(id) !== group), random);
  const picked: string[] = [];
  for (const id of [...sameGroup, ...rest]) {
    if (picked.length >= RECALL_CHOICES - 1) break;
    const name = nameOf(id);
    if (used.has(name)) continue;
    used.add(name);
    picked.push(id);
  }
  return picked.length === 0 ? [] : shuffle([target, ...picked], random);
}

function ask(state: Omit<RecallState, 'choices' | 'feedback'>, catalog: RecallCatalog, random: () => number): RecallState {
  return {
    ...state,
    choices: state.target ? recallChoices(state.target, catalog, random) : [],
    feedback: null,
  };
}

function pickTarget(pool: readonly string[], asked: readonly string[], random: () => number): string | null {
  const left = pool.filter((id) => !asked.includes(id));
  if (left.length === 0) return null;
  return left[Math.min(left.length - 1, Math.floor(random() * left.length))]!;
}

export function startRecall(pool: readonly string[], catalog: RecallCatalog, random: () => number): RecallState {
  const roundPool = [...new Set(pool)];
  const target = pickTarget(roundPool, [], random);
  return ask({ pool: roundPool, target, asked: target ? [target] : [] }, catalog, random);
}

/** True once the current question is settled (found or shown): answers are ignored until "next". */
export function recallSettled(state: RecallState): boolean {
  return state.feedback?.kind === 'right' || state.feedback?.kind === 'shown';
}

/** The student picked one of the offered names. */
export function answerRecallChoice(state: RecallState, picked: string, catalog: RecallCatalog): RecallState {
  if (!state.target || recallSettled(state) || !state.choices.includes(picked)) return state;
  const right = picked === state.target ||
    normalizeSearch(catalog.names.get(picked) ?? picked) === normalizeSearch(catalog.names.get(state.target) ?? state.target);
  return {
    ...state,
    feedback: right ? { kind: 'right', how: 'picked' } : { kind: 'wrong', how: 'picked', answer: catalog.names.get(picked) ?? picked },
  };
}

/** The student typed a name. An empty answer changes nothing. */
export function answerRecallTyped(state: RecallState, typed: string, catalog: RecallCatalog): RecallState {
  if (!state.target || recallSettled(state) || normalizeSearch(typed).length === 0) return state;
  const official = catalog.names.get(state.target) ?? state.target;
  return {
    ...state,
    feedback: typedMatches(typed, official)
      ? { kind: 'right', how: 'typed' }
      : { kind: 'wrong', how: 'typed', answer: typed.trim().slice(0, 200) },
  };
}

/** "show me": names the target. */
export function revealRecall(state: RecallState): RecallState {
  return state.target ? { ...state, feedback: { kind: 'shown' } } : state;
}

/** "next": another structure from the round's pool, never one already asked. */
export function nextRecall(state: RecallState, catalog: RecallCatalog, random: () => number): RecallState {
  const target = pickTarget(state.pool, state.asked, random);
  return ask({ pool: state.pool, target, asked: target ? [...state.asked, target] : state.asked }, catalog, random);
}

/** A session snapshots its inputs: due cards first, then a limited number of new cards. No clock or storage. */
import { dueOn, nextReview, whenInWords, type Review } from './review';

export interface ReviewSessionCard { id: string; front: string; back: string }
export type SessionHistories = Record<string, Review[]>;
export interface ReviewSessionState {
  cards: ReviewSessionCard[];
  histories: SessionHistories;
  today: string;
  examDay?: string;
  queue: string[];
  pos: number;
  answers: { id: string; result: Review['result'] }[];
}

export function startSession(
  cards: readonly ReviewSessionCard[],
  histories: Readonly<Record<string, readonly Review[]>>,
  today: string,
  examDay?: string,
  newLimit = 10,
): ReviewSessionState {
  if (!Array.isArray(cards)) throw new Error('Cards must be a list.');
  if (!histories || typeof histories !== 'object' || Array.isArray(histories)) throw new Error('Histories must be an object keyed by card id.');
  if (!Number.isSafeInteger(newLimit) || newLimit < 0) throw new Error('The new-card limit must be a whole number, zero or more.');
  const ids = new Set<string>();
  const copied = Array.from(cards, (card) => {
    if (!card || typeof card.id !== 'string' || !card.id.trim() || ids.has(card.id)) {
      throw new Error('Each card needs a different, nonempty id.');
    }
    if (typeof card.front !== 'string' || !card.front.trim() || typeof card.back !== 'string' || !card.back.trim()) {
      throw new Error('Each card needs a front and a back.');
    }
    ids.add(card.id);
    return { id: card.id, front: card.front, back: card.back };
  });
  for (const id of Object.keys(histories)) {
    if (!ids.has(id)) throw new Error(`History belongs to a card that is not in this deck: ${id}.`);
  }
  const sources = copied.map((card) => ({ id: card.id, history: Object.hasOwn(histories, card.id) ? histories[card.id]! : [] }));
  // The scheduler validates every history and date, including cards that aren't due.
  const due = dueOn(sources, today, examDay);
  const fresh = sources.filter((card) => card.history.length === 0).slice(0, newLimit).map((card) => card.id);
  const state: ReviewSessionState = {
    cards: copied,
    histories: Object.fromEntries(sources.map((card) => [card.id, card.history.map((review) => ({ day: review.day, result: review.result }))])),
    today, examDay, queue: [...due, ...fresh], pos: 0, answers: [],
  };
  return state;
}

export function currentCard(state: ReviewSessionState): ReviewSessionCard | undefined {
  const id = state.queue[state.pos];
  return id === undefined ? undefined : state.cards.find((card) => card.id === id);
}

/** A detached snapshot, including histories for cards that were not selected today. */
export function sessionHistories(state: ReviewSessionState): SessionHistories {
  return Object.fromEntries(Object.entries(state.histories).map(([id, history]) => [id,
    history.map((review) => ({ day: review.day, result: review.result })),
  ]));
}

export function answer(state: ReviewSessionState, result: Review['result']): ReviewSessionState {
  if (result !== 'knew' && result !== 'missed') throw new Error('A review result must be knew or missed.');
  const card = currentCard(state);
  if (!card) return state;
  const histories = sessionHistories(state);
  histories[card.id] = [...histories[card.id]!, { day: state.today, result }];
  return { ...state, histories, pos: state.pos + 1, answers: [...state.answers, { id: card.id, result }] };
}

export function summaryInWords(state: ReviewSessionState, examDay = state.examDay): string {
  dueOn([], state.today, examDay); // Validate an explicitly supplied exam date even for an empty deck.
  const count = state.answers.length;
  const knew = state.answers.filter((review) => review.result === 'knew').length;
  const missed = count - knew;
  const words = state.queue.length === 0 ? 'nothing to review today.' :
    `you reviewed ${count} ${count === 1 ? 'card' : 'cards'}: ${knew} you knew, ${missed} ${missed === 1 ? 'comes' : 'come'} back tomorrow.`;
  const soonest = state.cards.map((card) => nextReview(state.histories[card.id]!, examDay, state.today))
    .filter((day): day is string => day !== undefined).sort()[0];
  return words + (soonest === undefined ? '' : ` next review: ${whenInWords(soonest, state.today)}.`);
}

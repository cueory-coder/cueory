/** Pure logic for flipping through a deck of cards, kept separate so it can be unit tested. */

export interface CardsState {
  /** Card numbers (indexes into the deck) in the order they come up. "See again" adds one to the end. */
  queue: number[];
  /** Position in the queue of the card on screen. Equal to queue.length when the deck is finished. */
  pos: number;
  /** True when the back of the card is showing. */
  flipped: boolean;
}

export function start(total: number): CardsState {
  return { queue: Array.from({ length: total }, (_, i) => i), pos: 0, flipped: false };
}

/** The deck index of the card on screen, or undefined when the deck is finished. */
export function current(state: CardsState): number | undefined {
  return state.queue[state.pos];
}

export function isDone(state: CardsState): boolean {
  return state.pos >= state.queue.length;
}

export function flip(state: CardsState): CardsState {
  return isDone(state) ? state : { ...state, flipped: !state.flipped };
}

/** Move on; this card doesn't come back in this round. */
export function gotIt(state: CardsState): CardsState {
  if (isDone(state)) return state;
  return { ...state, pos: state.pos + 1, flipped: false };
}

/** Move on, and show this card again at the end of the round. */
export function seeAgain(state: CardsState): CardsState {
  const card = current(state);
  if (card === undefined) return state;
  return { queue: [...state.queue, card], pos: state.pos + 1, flipped: false };
}

export function back(state: CardsState): CardsState {
  return { ...state, pos: Math.max(state.pos - 1, 0), flipped: false };
}

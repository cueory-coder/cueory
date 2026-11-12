/** Pure logic for revealing a lesson a sentence at a time. */
export interface StepperState {
  /** Number of sentences already shown. */
  shown: number;
  total: number;
}

export type StepperAction = 'next' | 'back' | 'show-all';
export interface StepperSentence { readonly text: string }

/** An empty or malformed lesson has no active step. */
export function start(total: number): StepperState {
  const count = Number.isSafeInteger(total) && total > 0 ? total : 0;
  return { shown: Math.min(1, count), total: count };
}

export function next(state: StepperState): StepperState {
  const shown = Math.min(state.shown + 1, state.total);
  return shown === state.shown ? state : { ...state, shown };
}

export function back(state: StepperState): StepperState {
  const shown = Math.max(state.shown - 1, Math.min(1, state.total));
  return shown === state.shown ? state : { ...state, shown };
}

export function showAll(state: StepperState): StepperState {
  return state.shown === state.total ? state : { ...state, shown: state.total };
}

export function isDone(state: StepperState): boolean {
  return state.shown >= state.total;
}

/** Keep action decisions out of the React component. */
export function applyStep(state: StepperState, action: StepperAction): StepperState {
  switch (action) {
    case 'next': return next(state);
    case 'back': return back(state);
    case 'show-all': return showAll(state);
  }
}

/** Speak only the sentence just revealed. Showing all gives a short summary, not an entire lesson. */
export function stepAnnouncement(
  previous: StepperState, current: StepperState, action: StepperAction,
  sentences: readonly StepperSentence[],
): string | null {
  if (current.shown === previous.shown) return null;
  if (action === 'show-all') return `all ${current.total} sentences are now shown.`;
  if (action === 'back') return `back to sentence ${current.shown} of ${current.total}.`;
  const words = sentences[current.shown - 1]?.text?.trim();
  return words
    ? `sentence ${current.shown} of ${current.total}: ${words}`
    : `sentence ${current.shown} of ${current.total} is now shown.`;
}

/** Pure logic for stepping through a lesson's sentences, kept separate so it can be unit tested. */

export interface StepperState {
  /** Number of sentences currently revealed (at least 1). */
  shown: number;
  total: number;
}

export function start(total: number): StepperState {
  return { shown: Math.min(1, total), total };
}

export function next(state: StepperState): StepperState {
  return { ...state, shown: Math.min(state.shown + 1, state.total) };
}

export function back(state: StepperState): StepperState {
  return { ...state, shown: Math.max(state.shown - 1, Math.min(1, state.total)) };
}

export function showAll(state: StepperState): StepperState {
  return { ...state, shown: state.total };
}

export function isDone(state: StepperState): boolean {
  return state.shown >= state.total;
}

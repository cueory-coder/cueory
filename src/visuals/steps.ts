/** Pure state and validation for diagrams that reveal one teaching step at a time. */

export interface DiagramStep {
  id: string;
  caption: string;
  durationMs: number;
}

export interface DiagramState {
  /** Zero-based index of the step currently shown. */
  index: number;
  playing: boolean;
}

const STEP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validate untrusted diagram steps and return a clean copy. */
export function parseSteps(data: unknown): DiagramStep[] {
  if (!Array.isArray(data) || data.length < 1 || data.length > 12) {
    throw new Error('a diagram needs 1 to 12 steps.');
  }

  const ids = new Set<string>();
  return data.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`step ${index + 1} must be an object.`);
    }

    const step = value as Record<string, unknown>;
    if (typeof step.id !== 'string' || !STEP_ID.test(step.id)) {
      throw new Error(`step ${index + 1} needs an id made from lowercase letters, digits and single dashes.`);
    }
    if (ids.has(step.id)) throw new Error(`step id "${step.id}" is repeated.`);
    ids.add(step.id);

    if (typeof step.caption !== 'string' || step.caption.trim().length < 1) {
      throw new Error(`step ${index + 1} needs a caption.`);
    }
    const caption = step.caption.trim();
    if (caption.length > 200) throw new Error(`step ${index + 1} caption must be 200 characters or fewer.`);

    if (!Number.isInteger(step.durationMs) || (step.durationMs as number) < 1000 || (step.durationMs as number) > 10000) {
      throw new Error(`step ${index + 1} duration must be a whole number from 1000 to 10000 milliseconds.`);
    }

    return { id: step.id, caption, durationMs: step.durationMs as number };
  });
}

/** Begin on the first step. Playback always needs a deliberate action. */
export function startSteps(): DiagramState {
  return { index: 0, playing: false };
}

function lastIndex(steps: readonly DiagramStep[]): number {
  return Math.max(0, steps.length - 1);
}

/** Move to an explicit zero-based step. Manual movement always pauses. */
export function goTo(state: DiagramState, steps: readonly DiagramStep[], index: number): DiagramState {
  const target = Number.isFinite(index) ? Math.trunc(index) : state.index;
  return { index: Math.max(0, Math.min(target, lastIndex(steps))), playing: false };
}

/** Move forward by one step without passing the end. */
export function next(state: DiagramState, steps: readonly DiagramStep[]): DiagramState {
  return goTo(state, steps, state.index + 1);
}

/** Move back by one step without passing the beginning. */
export function previous(state: DiagramState, steps: readonly DiagramStep[]): DiagramState {
  return goTo(state, steps, state.index - 1);
}

/** Start playback, returning to the first step when the last step is showing. */
export function play(state: DiagramState, steps: readonly DiagramStep[]): DiagramState {
  return { index: state.index >= lastIndex(steps) ? 0 : state.index, playing: true };
}

export function pause(state: DiagramState): DiagramState {
  return { ...state, playing: false };
}

/** Timer transition: move once and finish playback upon reaching the last step. */
export function advance(state: DiagramState, steps: readonly DiagramStep[]): DiagramState {
  if (!state.playing) return state;
  const index = Math.min(state.index + 1, lastIndex(steps));
  return { index, playing: index < lastIndex(steps) };
}

/** A complete spoken description of the currently visible step. */
export function stepInWords(steps: readonly DiagramStep[], state: DiagramState): string {
  const caption = steps[state.index]?.caption ?? '';
  const punctuation = /[.!?]$/u.test(caption) ? '' : '.';
  return `step ${state.index + 1} of ${steps.length}: ${caption}${punctuation}`;
}

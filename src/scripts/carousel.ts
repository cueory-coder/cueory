/**
 * The "ways to study" carousel on the home page (D-50). Pure helpers, kept apart from the page script so they can be
 * unit tested (tests/unit/carousel.test.ts).
 *
 * The carousel is a row of cards that scrolls sideways and snaps each card to the middle, so it works by swiping,
 * by the keyboard and even without JavaScript. The script adds the chips, the arrow buttons, the coverflow look
 * (neighbours smaller and lower) and a gentle auto-advance.
 */

/** Time each card stays in the middle before the next one comes in, when nobody is using the carousel. */
export const AUTO_ADVANCE_MS = 6000;

/** The row counts as resting once it has not moved for this long, even if no scrollend event comes. */
export const SETTLE_MS = 200;

/** How far, in cards, the coverflow look keeps shrinking and lowering a neighbour. */
export const MAX_DISTANCE = 2;

/** The card whose middle is nearest the middle of the row. */
export function nearestIndex(centers: readonly number[], middle: number): number {
  let best = 0;
  for (let i = 1; i < centers.length; i++) {
    if (Math.abs(centers[i]! - middle) < Math.abs(centers[best]! - middle)) best = i;
  }
  return best;
}

/** How many cards away from the middle a card is (0 in the middle), capped at MAX_DISTANCE. */
export function distance(center: number, middle: number, step: number): number {
  if (step <= 0) return 0;
  return Math.min(Math.abs(center - middle) / step, MAX_DISTANCE);
}

/** The next or previous card, wrapping from the last card to the first and back. */
export function wrap(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/** Keys that move the carousel when it has keyboard focus. Returns the card to go to, or undefined. */
export function keyTarget(key: string, index: number, count: number): number | undefined {
  if (key === 'ArrowRight') return wrap(index + 1, count);
  if (key === 'ArrowLeft') return wrap(index - 1, count);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/** What the screen reader hears when the card in the middle changes: "matching, 5 of 8". */
export function slideAnnouncement(name: string, index: number, count: number): string {
  return `${name}, ${index + 1} of ${count}`;
}

export interface MotionState {
  /** The visitor asked their device for less motion. */
  reducedMotion: boolean;
  /** The pause button is pressed. */
  paused: boolean;
  /** The visitor swiped, tapped a chip or an arrow, or used the keyboard on the carousel: they're in charge now. */
  tookOver: boolean;
  /** A mouse pointer is over the carousel. */
  hovering: boolean;
  /** Keyboard focus is inside the carousel. */
  focusInside: boolean;
  /** Most of the carousel is on screen and the tab is visible. */
  onScreen: boolean;
}

/**
 * Auto-advance runs only while nobody is using the carousel: never with reduced motion, after the pause button,
 * once the visitor has taken over, while it is hovered or focused, or while it is off screen.
 */
export function canAutoAdvance(state: MotionState): boolean {
  return (
    !state.reducedMotion &&
    !state.paused &&
    !state.tookOver &&
    !state.hovering &&
    !state.focusInside &&
    state.onScreen
  );
}

/** A box on screen, as getBoundingClientRect gives it. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The grow-into-preview animation (D-51) moves the preview panel so it starts exactly over the card it came from:
 * this is the move and the stretch that put the panel's box (`to`) onto the card's box (`from`). Animating from it to
 * no transform makes the panel grow out of the card; the reverse shrinks it back in.
 */
export function flipFrom(from: Box, to: Box): string {
  if (to.width <= 0 || to.height <= 0) return 'none';
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return `translate(${round(dx)}px, ${round(dy)}px) scale(${round(sx)}, ${round(sy)})`;
}

/** How far a finger must pull the preview panel down before letting go closes it. */
export const SWIPE_CLOSE_PX = 80;

/** A finger moved mostly downward, far enough: on phones, that closes the preview. */
export function isSwipeDown(dx: number, dy: number): boolean {
  return dy >= SWIPE_CLOSE_PX && Math.abs(dx) < dy;
}

/** How long the preview takes to grow out of its card, or to shrink back into it. */
export const PREVIEW_MS = 320;

/** Fast at first, then settling gently: the grow and shrink of the preview. */
export const PREVIEW_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** The small sideways nudge when previous or next changes the mode inside the preview. */
export const STEP_MS = 200;

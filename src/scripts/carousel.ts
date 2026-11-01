/**
 * The "ways to study" merry-go-round on the home page (D-50, D-60). Pure helpers, kept apart from the page script so
 * they can be unit tested (tests/unit/carousel.test.ts).
 *
 * Without JavaScript the cards are a row that scrolls sideways and snaps each card to the middle. The script turns
 * the row into an endless merry-go-round: one card in front, its neighbours on both sides stepping back (smaller,
 * turned slightly away, quieter), and next after the last card is the first again. It adds the arrows, the arrow
 * keys, swipes, a tap on a side card to bring it to the middle, and a gentle auto-advance.
 */

/** Time each card stays in the middle before the next one comes in, when nobody is using the carousel. */
export const AUTO_ADVANCE_MS = 6000;

/** How long one turn of the merry-go-round takes (brand guide §7.3: 180 to 280 ms, easing out). */
export const RING_MS = 240;

/** The row counts as resting once it hasn't turned for a little longer than one turn. */
export const REST_MS = RING_MS + 60;

/** How much smaller each card is than the one in front of it: 1 in the middle, then 0.88, then 0.76. */
export const STEP_BACK = 0.12;

/** How far each side card is turned away, in degrees. */
export const TURN_DEG = 10;

/** The next or previous card, wrapping from the last card to the first and back. */
export function wrap(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * How many cards away from the middle a card is, going the short way round the merry-go-round: 0 in the middle,
 * negative to the left, positive to the right. With 11 cards every card is between 5 to the left and 5 to the right.
 */
export function ringOffset(index: number, active: number, count: number): number {
  if (count <= 0) return 0;
  const half = Math.floor(count / 2);
  return wrap(index - active + half, count) - half;
}

/** Where a card sits on the merry-go-round. The styles in global.css draw it from these numbers. */
export interface RingPlace {
  /** How many cards it is from the middle: 0 in the middle. */
  distance: number;
  /** -1 to the left of the middle, 1 to the right, 0 in the middle. */
  side: -1 | 0 | 1;
  /** Its size: 1 in the middle, then 0.88 and 0.76, stepping back. */
  scale: number;
  /**
   * How far sideways its middle is from the middle of the row, in card widths. Together with `gaps` (how many of the
   * gaps between cards lie in between), neighbours sit side by side, edge to edge with a gap, never on top of each other.
   */
  shift: number;
  gaps: number;
  /** How far it is turned away from the middle, in degrees: 0 in the middle and with reduced motion. */
  turn: number;
  /** Which card is drawn on top: the middle one, then its neighbours, then theirs. */
  layer: number;
}

const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

export function ringPlace(offset: number, reducedMotion = false): RingPlace {
  const distance = Math.abs(offset);
  const side = offset === 0 ? 0 : offset < 0 ? -1 : 1;
  // Card k is 1 - k × STEP_BACK wide; the middles of two cards next to each other are half of each one's width apart.
  const widths = distance - (STEP_BACK / 2) * distance * distance;
  return {
    distance,
    side,
    scale: round(Math.max(0.4, 1 - STEP_BACK * distance)),
    shift: round(side * widths),
    gaps: side * distance,
    turn: reducedMotion ? 0 : side * TURN_DEG,
    layer: Math.max(0, 10 - distance),
  };
}

/**
 * Whether a card glides to its new place or simply appears there. A turn of one or two cards glides; a card going
 * round the back of the merry-go-round, or a jump of several cards (Home, End), switches at once instead of sweeping
 * across the row.
 */
export function glides(fromOffset: number, toOffset: number): boolean {
  return Math.abs(toOffset - fromOffset) <= 2;
}

/** Keys that move the carousel when it has keyboard focus. Returns the card to go to, or undefined. */
export function keyTarget(key: string, index: number, count: number): number | undefined {
  if (key === 'ArrowRight') return wrap(index + 1, count);
  if (key === 'ArrowLeft') return wrap(index - 1, count);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/** How far a finger must move sideways across the cards to turn the merry-go-round by one card. */
export const SWIPE_TURN_PX = 40;

/**
 * A sideways swipe turns the merry-go-round one card: to the left brings the next card, to the right the previous one.
 * A short or mostly up-and-down movement (scrolling the page) turns nothing.
 */
export function swipeTurn(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_TURN_PX || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** What the screen reader hears where the merry-go-round comes to rest: "matching, 5 of 11". */
export function slideAnnouncement(name: string, index: number, count: number): string {
  return `${name}, ${index + 1} of ${count}`;
}

export interface MotionState {
  /** The visitor asked their device for less motion. */
  reducedMotion: boolean;
  /** The pause button is pressed. */
  paused: boolean;
  /** The visitor swiped, tapped a card or an arrow, or used the keyboard on the carousel: they're in charge now. */
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

/**
 * The "ways to study" merry-go-round on the home page (D-50, D-60), drawn as Christian's vials since Task 109. Pure
 * helpers, kept apart from the page script so they can be unit tested (tests/unit/carousel.test.ts).
 *
 * Without JavaScript the vials are a row that scrolls sideways and snaps each vial to the middle. The script turns
 * the row into an endless ring in a shallow arc on a pedestal: one vial in front, the others stepping back on both
 * sides (smaller, further back, a little higher and dimmer), and next after the last vial is the first again. It adds
 * the arrows, the arrow keys, swipes, a tap on a side vial to bring it to the front, and a gentle auto-advance.
 */

/**
 * The native snap-scrolling links are the accessible baseline. Turn them into a ring only when every
 * browser feature used by the modal preview is present. This pure check also guards older browsers
 * without the Web Animations API, matchMedia or IntersectionObserver.
 */
export interface CarouselCapabilities {
  nativeDialog: boolean;
  dialog: { showModal?: unknown; close?: unknown } | null | undefined;
  animationTargets: readonly ({ animate?: unknown; getAnimations?: unknown } | null | undefined)[];
  matchMedia: unknown;
  motionQuery: { matches?: unknown; addEventListener?: unknown } | null | undefined;
  intersectionObserver: unknown;
  replaceChildren: unknown;
}

export function canEnhanceCarousel(capabilities: CarouselCapabilities): boolean {
  return (
    capabilities.nativeDialog &&
    typeof capabilities.dialog?.showModal === 'function' &&
    typeof capabilities.dialog?.close === 'function' &&
    typeof capabilities.matchMedia === 'function' &&
    typeof capabilities.motionQuery?.matches === 'boolean' &&
    typeof capabilities.motionQuery?.addEventListener === 'function' &&
    typeof capabilities.intersectionObserver === 'function' &&
    typeof capabilities.replaceChildren === 'function' &&
    // Panel, scrim, bottle, surface, and both word-fade containers all animate.
    capabilities.animationTargets.length >= 6 &&
    capabilities.animationTargets.every(
      (element) => typeof element?.animate === 'function' && typeof element?.getAnimations === 'function',
    )
  );
}

/** Time each vial stays in front before the next one comes in, when nobody is using the carousel. */
export const AUTO_ADVANCE_MS = 6000;

/**
 * How long one turn of the ring takes: the approved prototype's 700 ms glide (the lead approved it on 2026-11-02, as
 * long as reduced motion turns it off, which it does: global.css).
 */
export const RING_MS = 700;

/** The glide's easing, from the approved prototype: fast at first, settling softly. */
export const RING_EASING = 'cubic-bezier(0.22, 0.8, 0.24, 1)';

/** The ring counts as resting once it hasn't turned for a little longer than one turn. */
export const REST_MS = RING_MS + 60;

/** How far apart the vials stand, in vial widths (they overlap a little, so they read as one group). */
export const SPREAD = 0.78;

/** Each step out squeezes the spacing a little more: the arc. */
export const SQUEEZE = 0.05;

/** How much smaller each vial is than the one in front of it: 1 in front, then 0.87, 0.74, 0.61 and 0.48. */
export const STEP_BACK = 0.13;

/** How much dimmer and greyer each vial is per step out: the selected vial is the brightest. */
export const DIM = 0.05;
export const DESATURATE = 0.06;

/** Vials further than this from the front are hidden (with eleven vials, the one straight behind). */
export const FARTHEST_SHOWN = 4;

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

/** Where a vial stands on the ring. The styles in global.css draw it from these numbers. */
export interface RingPlace {
  /** How many vials it is from the front: 0 in front. */
  distance: number;
  /** -1 to the left of the front vial, 1 to the right, 0 in front. */
  side: -1 | 0 | 1;
  /** How far sideways its middle is from the middle of the ring, in vial widths. */
  shift: number;
  /** How far up it stands, in steps of 5 px (--vial-step-rise): the square of its distance, so the row curves. */
  rise: number;
  /** How far back it stands, in steps of 90 px (--vial-step-depth). */
  depth: number;
  /** Its size: 1 in front, then 0.87, 0.74, 0.61 and 0.48. */
  scale: number;
  /** The glass's brightness and color strength: 1 in front, a little less per step out. */
  bright: number;
  saturate: number;
  /** Which vial is drawn on top: the front one, then its neighbours, then theirs. */
  layer: number;
  /** Whether it shows at all: four on each side of the front vial. */
  shown: boolean;
}

const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

/**
 * The approved prototype's arc (Task 109): with o the vial's offset from the front one, it stands o × 0.78 × (1 −
 * |o| × 0.05) vial widths to the side, o² × 5 px higher and |o| × 90 px further back, at 1 − |o| × 0.13 of its size,
 * 5% dimmer and 6% greyer per step.
 */
export function ringPlace(offset: number): RingPlace {
  const distance = Math.abs(offset);
  const side = offset === 0 ? 0 : offset < 0 ? -1 : 1;
  return {
    distance,
    side,
    shift: round(offset * SPREAD * (1 - distance * SQUEEZE)),
    rise: distance * distance,
    depth: distance,
    scale: round(Math.max(0.3, 1 - STEP_BACK * distance)),
    bright: round(1 - DIM * distance),
    saturate: round(1 - DESATURATE * distance),
    layer: Math.max(0, 20 - distance),
    shown: distance <= FARTHEST_SHOWN,
  };
}

/**
 * Whether a vial glides to its new place or simply appears there. A turn of one or two vials glides; a vial going
 * round the back of the ring, or a jump of several vials (Home, End), switches at once instead of sweeping across the
 * row.
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

/** What the screen reader hears where the ring comes to rest: "matching, 5 of 11". */
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
 * The grow-into-preview animation (D-51, Task 109) moves the preview's big vial so it starts exactly over the vial it
 * came from: this is the move and the stretch that put the big vial's box (`to`) onto the small one's box (`from`).
 * Animating from it to no transform makes the same bottle grow out of the ring; the reverse shrinks it back in.
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

/**
 * How long the preview takes to grow out of its vial, or to shrink back into it: the bottle moves in the first half
 * (PREVIEW_SPLIT), the panel opens around it and its words fade in during the second. Closing runs it backwards.
 */
export const PREVIEW_MS = 320;

/** Where the preview's two stages meet, as a share of PREVIEW_MS: 160 ms of 320. */
export const PREVIEW_SPLIT = 0.5;

/**
 * The panel behind the big vial starts as a box around the bottle and opens to its full size: the clip that shows
 * only the bottle's box (`bottle`) of the panel's box (`panel`), with the panel's rounded corners.
 */
export function clipAround(bottle: Box, panel: Box, radius: string): string {
  const top = round(Math.max(0, bottle.top - panel.top));
  const left = round(Math.max(0, bottle.left - panel.left));
  const bottom = round(Math.max(0, panel.top + panel.height - (bottle.top + bottle.height)));
  const right = round(Math.max(0, panel.left + panel.width - (bottle.left + bottle.width)));
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius})`;
}

/** Fast at first, then settling gently: the grow and shrink of the preview. */
export const PREVIEW_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** The small sideways nudge when previous or next changes the mode inside the preview. */
export const STEP_MS = 200;

/** The label's time line as printed on the vial: "5 min". */
export function shortTime(minutes: number): string {
  return `${minutes} min`;
}

/** The vial as a screen reader hears it, after its name: "best for recall, about 5 minutes". */
export function vialSummary(bestFor: string, minutes: number): string {
  return `best for ${bestFor}, about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

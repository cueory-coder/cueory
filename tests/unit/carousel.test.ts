import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { studyModes } from '../../src/config/modes';
import {
  AUTO_ADVANCE_MS,
  canAutoAdvance,
  flipFrom,
  glides,
  isSwipeDown,
  keyTarget,
  PREVIEW_MS,
  REST_MS,
  RING_MS,
  ringOffset,
  ringPlace,
  slideAnnouncement,
  SWIPE_CLOSE_PX,
  SWIPE_TURN_PX,
  swipeTurn,
  wrap,
  type MotionState,
} from '../../src/scripts/carousel';

const idle: MotionState = {
  reducedMotion: false,
  paused: false,
  tookOver: false,
  hovering: false,
  focusInside: false,
  onScreen: true,
};

describe('"ways to study" merry-go-round (D-50, D-60)', () => {
  it("lists the eleven study modes in Christian's order, in the lowercase voice", () => {
    expect(studyModes.map((mode) => mode.name)).toEqual([
      'video',
      'cards',
      'learn',
      'fill-in',
      'matching',
      'organizer',
      'questions',
      'review',
      'label it',
      'adaptive quiz',
      'level test',
    ]);
    for (const mode of studyModes) {
      expect(mode.name).toBe(mode.name.toLowerCase());
      expect(mode.text).toBe(mode.text.toLowerCase());
      if (mode.link) expect(mode.link.label).toBe(mode.link.label.toLowerCase());
    }
    expect(new Set(studyModes.map((mode) => mode.id)).size).toBe(studyModes.length);
  });

  it('links each mode that is open now to its page; the video and the roadmap modes are coming soon', () => {
    const links = Object.fromEntries(studyModes.filter((mode) => mode.link).map((mode) => [mode.id, mode.link!.href]));
    expect(links).toEqual({
      cards: '/learn/study-skills/cards',
      learn: '/learn/study-skills/learn-mode',
      matching: '/learn/study-skills/matching',
    });
  });

  it('counts each card the short way round from the middle, so there is always a neighbour on both sides', () => {
    // Eleven cards, the first in the middle: the last one is its left neighbour, the second its right one.
    expect(Array.from({ length: 11 }, (_, i) => ringOffset(i, 0, 11))).toEqual([0, 1, 2, 3, 4, 5, -5, -4, -3, -2, -1]);
    // The last card in the middle: the first one is its right neighbour.
    expect(ringOffset(0, 10, 11)).toBe(1);
    expect(ringOffset(9, 10, 11)).toBe(-1);
    expect(ringOffset(4, 4, 11)).toBe(0);
    expect(ringOffset(3, 0, 0)).toBe(0);
  });

  it('steps the neighbours back: smaller, turned away round the ring, edge to edge, the middle card on top', () => {
    expect(ringPlace(0)).toEqual({ distance: 0, side: 0, scale: 1, shift: 0, gaps: 0, turn: 0, layer: 10 });
    expect(ringPlace(1)).toEqual({ distance: 1, side: 1, scale: 0.88, shift: 0.94, gaps: 1, turn: 10, layer: 9 });
    expect(ringPlace(-1)).toEqual({ distance: 1, side: -1, scale: 0.88, shift: -0.94, gaps: -1, turn: -10, layer: 9 });
    expect(ringPlace(2)).toMatchObject({ scale: 0.76, shift: 1.76, gaps: 2, turn: 10, layer: 8 });
    // Edge to edge: the space between two middles is half of each card's width, plus one gap.
    for (const d of [1, 2, 3]) {
      const inner = ringPlace(d - 1);
      const outer = ringPlace(d);
      expect(outer.shift - inner.shift).toBeCloseTo((inner.scale + outer.scale) / 2, 3);
      expect(outer.gaps - inner.gaps).toBe(1);
    }
    // With reduced motion the side cards face forward.
    expect(ringPlace(1, true).turn).toBe(0);
    expect(ringPlace(-2, true).turn).toBe(0);
  });

  it('glides a turn of one or two cards, and switches at once round the back or for a long jump', () => {
    expect(glides(1, 0)).toBe(true);
    expect(glides(-1, -2)).toBe(true);
    expect(glides(2, 0)).toBe(true);
    expect(glides(-5, 5)).toBe(false);
    expect(glides(0, 4)).toBe(false);
  });

  it('wraps from the last card to the first and back', () => {
    expect(wrap(11, 11)).toBe(0);
    expect(wrap(-1, 11)).toBe(10);
    expect(wrap(3, 11)).toBe(3);
    expect(wrap(23, 11)).toBe(1);
    expect(wrap(2, 0)).toBe(0);
  });

  it('moves with the arrow keys, Home and End, endlessly, and ignores other keys', () => {
    expect(keyTarget('ArrowRight', 0, 11)).toBe(1);
    expect(keyTarget('ArrowRight', 10, 11)).toBe(0);
    expect(keyTarget('ArrowLeft', 0, 11)).toBe(10);
    expect(keyTarget('ArrowLeft', 4, 11)).toBe(3);
    expect(keyTarget('Home', 5, 11)).toBe(0);
    expect(keyTarget('End', 2, 11)).toBe(10);
    expect(keyTarget('Enter', 2, 11)).toBeUndefined();
    expect(keyTarget('ArrowDown', 2, 11)).toBeUndefined();
  });

  it('turns one card per sideways swipe, never for a short or up-and-down one', () => {
    expect(SWIPE_TURN_PX).toBe(40);
    expect(swipeTurn(-60, 5)).toBe(1);
    expect(swipeTurn(60, -10)).toBe(-1);
    expect(swipeTurn(-39, 0)).toBe(0);
    expect(swipeTurn(-50, 80)).toBe(0);
    expect(swipeTurn(0, -200)).toBe(0);
  });

  it('turns quickly, easing out, and the styles use the same timing', () => {
    expect(RING_MS).toBeGreaterThanOrEqual(180);
    expect(RING_MS).toBeLessThanOrEqual(280);
    expect(REST_MS).toBeGreaterThan(RING_MS);
    const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    const rule = css.match(/\.modes\[data-ring\] \.mode-card \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain(`transform ${RING_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`);
  });

  it('announces the card in the middle by name and position', () => {
    expect(slideAnnouncement('matching', 4, 11)).toBe('matching, 5 of 11');
  });

  it('auto-advances gently, and only while nobody is using the carousel', () => {
    expect(AUTO_ADVANCE_MS).toBe(6000);
    expect(canAutoAdvance(idle)).toBe(true);
    expect(canAutoAdvance({ ...idle, reducedMotion: true })).toBe(false);
    expect(canAutoAdvance({ ...idle, paused: true })).toBe(false);
    expect(canAutoAdvance({ ...idle, tookOver: true })).toBe(false);
    expect(canAutoAdvance({ ...idle, hovering: true })).toBe(false);
    expect(canAutoAdvance({ ...idle, focusInside: true })).toBe(false);
    expect(canAutoAdvance({ ...idle, onScreen: false })).toBe(false);
  });
});

describe('the study-mode preview (D-51)', () => {
  it('gives every mode two plain lines for the preview, in the lowercase voice', () => {
    for (const mode of studyModes) {
      expect(mode.more.length, mode.id).toBeGreaterThan(mode.text.length);
      expect(mode.more, mode.id).toBe(mode.more.toLowerCase());
      expect(mode.more.endsWith('.'), mode.id).toBe(true);
    }
  });

  it('starts the panel exactly over the card it grows from: same middle, same size', () => {
    const card = { left: 100, top: 300, width: 320, height: 480 };
    const panel = { left: 50, top: 100, width: 448, height: 640 };
    // Middles: card (260, 540), panel (274, 420).
    expect(flipFrom(card, panel)).toBe('translate(-14px, 120px) scale(0.714, 0.75)');
    expect(flipFrom(panel, panel)).toBe('translate(0px, 0px) scale(1, 1)');
  });

  it('leaves a panel with no size alone', () => {
    expect(flipFrom({ left: 0, top: 0, width: 300, height: 400 }, { left: 0, top: 0, width: 0, height: 0 })).toBe('none');
  });

  it('closes on a mostly downward swipe of at least 80px, never on a short, upward or sideways one', () => {
    expect(SWIPE_CLOSE_PX).toBe(80);
    expect(isSwipeDown(0, 80)).toBe(true);
    expect(isSwipeDown(40, 120)).toBe(true);
    expect(isSwipeDown(0, 79)).toBe(false);
    expect(isSwipeDown(0, -200)).toBe(false);
    expect(isSwipeDown(150, 120)).toBe(false);
    expect(isSwipeDown(-150, 120)).toBe(false);
  });

  it('grows and shrinks quickly enough to feel direct', () => {
    expect(PREVIEW_MS).toBeGreaterThanOrEqual(200);
    expect(PREVIEW_MS).toBeLessThanOrEqual(400);
  });
});

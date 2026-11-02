import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { studyModes } from '../../src/config/modes';
import {
  AUTO_ADVANCE_MS,
  canAutoAdvance,
  captionLine,
  clipAround,
  flipFrom,
  glides,
  isSwipeDown,
  keyTarget,
  PREVIEW_MS,
  PREVIEW_SPLIT,
  REST_MS,
  RING_EASING,
  RING_MS,
  ringOffset,
  ringPlace,
  slideAnnouncement,
  SWIPE_CLOSE_PX,
  SWIPE_TURN_PX,
  shortTime,
  swipeTurn,
  vialSummary,
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
      organizer: '/learn/study-skills/organizer',
      'fill-in': '/learn/study-skills/fill-in',
      'label-it': '/learn/study-skills/label-it',
      questions: '/learn/study-skills/questions',
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

  it("stands the vials in the approved prototype's arc: smaller, higher, further back and dimmer, the front one on top", () => {
    // Task 109: x = o × 0.78 × (1 − |o| × 0.05) vial widths, o² × 5 px up, |o| × 90 px back, scale 1 − |o| × 0.13,
    // brightness 1 − 0.05 |o|, saturation 1 − 0.06 |o|, hidden beyond 4.
    expect(ringPlace(0)).toEqual({
      distance: 0,
      side: 0,
      shift: 0,
      rise: 0,
      depth: 0,
      scale: 1,
      bright: 1,
      saturate: 1,
      layer: 20,
      shown: true,
    });
    expect(ringPlace(1)).toEqual({
      distance: 1,
      side: 1,
      shift: 0.741,
      rise: 1,
      depth: 1,
      scale: 0.87,
      bright: 0.95,
      saturate: 0.94,
      layer: 19,
      shown: true,
    });
    expect(ringPlace(-1)).toMatchObject({ side: -1, shift: -0.741, rise: 1, scale: 0.87, layer: 19 });
    expect(ringPlace(2)).toMatchObject({ shift: 1.404, rise: 4, depth: 2, scale: 0.74, bright: 0.9, saturate: 0.88 });
    expect(ringPlace(-4)).toMatchObject({ shift: -2.496, rise: 16, depth: 4, scale: 0.48, shown: true });
    expect(ringPlace(5).shown).toBe(false);
    // Each step out stands further from the middle, and is smaller and dimmer than the one before.
    for (const d of [1, 2, 3, 4]) {
      const inner = ringPlace(d - 1);
      const outer = ringPlace(d);
      expect(outer.shift).toBeGreaterThan(inner.shift);
      expect(outer.scale).toBeLessThan(inner.scale);
      expect(outer.bright).toBeLessThan(inner.bright);
      expect(outer.layer).toBeLessThan(inner.layer);
    }
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

  it("glides in the approved prototype's 700 ms, easing out, and the styles use the same timing", () => {
    // Task 109: the lead approved the prototype's 700 ms on 2026-11-02, as long as reduced motion turns it off.
    expect(RING_MS).toBe(700);
    expect(RING_EASING).toBe('cubic-bezier(0.22, 0.8, 0.24, 1)');
    expect(REST_MS).toBeGreaterThan(RING_MS);
    const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    const rule = css.match(/\.modes\[data-ring\] \.mode-card \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain(`transform ${RING_MS}ms ${RING_EASING}`);
    expect(css).toContain(`--vial-glide: ${RING_MS}ms ${RING_EASING};`);
    // ...and reduced motion turns it off.
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
    expect(reduced).toMatch(/\.modes\[data-ring\] \.mode-card,[^{]*\{\s*transition: none;/);
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

  it('grows and shrinks quickly enough to feel direct: the bottle in the first 160 ms, the panel in the next', () => {
    expect(PREVIEW_MS).toBe(320);
    expect(PREVIEW_MS * PREVIEW_SPLIT).toBe(160);
  });

  it('starts the panel as a box around the bottle', () => {
    const panel = { left: 100, top: 50, width: 800, height: 500 };
    const bottle = { left: 148, top: 98, width: 200, height: 420 };
    expect(clipAround(bottle, panel, '16px')).toBe('inset(48px 552px 32px 48px round 16px)');
    expect(clipAround(panel, panel, '16px')).toBe('inset(0px 0px 0px 0px round 16px)');
  });
});

describe('the vials (Task 109)', () => {
  const vialFiles = new URL('../../public/vials/', import.meta.url);

  it('gives every method its own vial image, the 3:38 pm mapping, and keeps the spare one unused', () => {
    expect(Object.fromEntries(studyModes.map((mode) => [mode.id, mode.vial]))).toEqual({
      video: 'video-lessons',
      cards: 'flashcards',
      learn: 'learn-mode',
      'fill-in': 'fill-in',
      matching: 'matching',
      organizer: 'organizer',
      questions: 'questions',
      review: 'spaced-review',
      'label-it': 'label-it',
      'adaptive-quiz': 'adaptive-quiz',
      'level-test': 'level-test',
    });
    for (const mode of studyModes) expect(existsSync(new URL(`vial-${mode.vial}.webp`, vialFiles)), mode.vial).toBe(true);
    expect(new Set(studyModes.map((mode) => mode.vial)).size).toBe(studyModes.length);
  });

  it('labels each vial with short lowercase "best for" and "time" lines, read aloud in full', () => {
    for (const mode of studyModes) {
      expect(mode.bestFor, mode.id).toBe(mode.bestFor.toLowerCase());
      expect(mode.bestFor.split(' ').length, mode.id).toBeLessThanOrEqual(2);
      expect(Number.isInteger(mode.time) && mode.time > 0, mode.id).toBe(true);
    }
    expect(shortTime(5)).toBe('5 min');
    expect(vialSummary('recall', 5)).toBe('best for recall, about 5 minutes');
    expect(vialSummary('watch', 1)).toBe('best for watch, about 1 minute');
    expect(captionLine('cards', 'flip through the key ideas.')).toBe('cards · flip through the key ideas');
  });

  it('gives every method four short feature rows that describe the tool, never scores or results', () => {
    for (const mode of studyModes) {
      expect(mode.features, mode.id).toHaveLength(4);
      for (const feature of mode.features) {
        expect(feature.text, mode.id).toBe(feature.text.toLowerCase());
        expect(feature.text.length, mode.id).toBeLessThanOrEqual(44);
        // The one mention of scores says the level test never predicts one.
        if (feature.text === 'never predicts an exam score') continue;
        expect(feature.text, mode.id).not.toMatch(/score|pass|guarantee|improve|grade|percent|result/);
      }
    }
  });

  it('never uses medication wording in the words on the vials or in their preview', () => {
    // The rendered page is checked too (tests/e2e/vial-carousel.spec.ts).
    const words = studyModes.flatMap((mode) => [mode.name, mode.text, mode.more, mode.bestFor, ...mode.features.map((f) => f.text)]);
    for (const text of words) {
      expect(text).not.toMatch(/\bdose\b|\bdosage\b|mg\/ml|\bmg\b|\bml\b|wellness shot|prescription|\brx\b/i);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { studyModes } from '../../src/config/modes';
import {
  AUTO_ADVANCE_MS,
  canAutoAdvance,
  distance,
  keyTarget,
  MAX_DISTANCE,
  nearestIndex,
  slideAnnouncement,
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

describe('"ways to study" carousel (D-50)', () => {
  it('lists the eight study modes in Christian\'s order, in the lowercase voice', () => {
    expect(studyModes.map((mode) => mode.name)).toEqual([
      'lesson',
      'cards',
      'learn',
      'fill-in',
      'matching',
      'organizer',
      'questions',
      'review',
    ]);
    for (const mode of studyModes) {
      expect(mode.name).toBe(mode.name.toLowerCase());
      expect(mode.text).toBe(mode.text.toLowerCase());
      if (mode.link) expect(mode.link.label).toBe(mode.link.label.toLowerCase());
    }
    expect(new Set(studyModes.map((mode) => mode.id)).size).toBe(studyModes.length);
  });

  it('links each mode that is open now to its page', () => {
    const links = Object.fromEntries(studyModes.filter((mode) => mode.link).map((mode) => [mode.id, mode.link!.href]));
    expect(links).toEqual({
      lesson: '/learn/study-skills',
      cards: '/learn/study-skills/cards',
      learn: '/learn/study-skills/learn-mode',
      matching: '/learn/study-skills/matching',
    });
  });

  it('finds the card nearest the middle of the row', () => {
    expect(nearestIndex([100, 440, 780], 440)).toBe(1);
    expect(nearestIndex([100, 440, 780], 0)).toBe(0);
    expect(nearestIndex([100, 440, 780], 2000)).toBe(2);
    expect(nearestIndex([100, 440, 780], 271)).toBe(1);
    expect(nearestIndex([100, 440, 780], 269)).toBe(0);
    // A tie keeps the earlier card.
    expect(nearestIndex([100, 440], 270)).toBe(0);
  });

  it('measures how far a card is from the middle, in cards, up to the coverflow limit', () => {
    expect(distance(440, 440, 340)).toBe(0);
    expect(distance(780, 440, 340)).toBe(1);
    expect(distance(100, 440, 340)).toBe(1);
    expect(distance(610, 440, 340)).toBeCloseTo(0.5);
    expect(distance(5000, 440, 340)).toBe(MAX_DISTANCE);
    expect(distance(5000, 440, 0)).toBe(0);
  });

  it('wraps from the last card to the first and back', () => {
    expect(wrap(8, 8)).toBe(0);
    expect(wrap(-1, 8)).toBe(7);
    expect(wrap(3, 8)).toBe(3);
    expect(wrap(17, 8)).toBe(1);
    expect(wrap(2, 0)).toBe(0);
  });

  it('moves with the arrow keys, Home and End, and ignores other keys', () => {
    expect(keyTarget('ArrowRight', 0, 8)).toBe(1);
    expect(keyTarget('ArrowRight', 7, 8)).toBe(0);
    expect(keyTarget('ArrowLeft', 0, 8)).toBe(7);
    expect(keyTarget('ArrowLeft', 4, 8)).toBe(3);
    expect(keyTarget('Home', 5, 8)).toBe(0);
    expect(keyTarget('End', 2, 8)).toBe(7);
    expect(keyTarget('Enter', 2, 8)).toBeUndefined();
    expect(keyTarget('ArrowDown', 2, 8)).toBeUndefined();
  });

  it('announces the card in the middle by name and position', () => {
    expect(slideAnnouncement('matching', 4, 8)).toBe('matching, 5 of 8');
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

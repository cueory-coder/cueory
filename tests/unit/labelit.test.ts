import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LabelItBoard, { coverAxis, LabelItFromUrl } from '../../src/islands/LabelItBoard';
import {
  coverAll,
  coverWords,
  isCovered,
  isDone,
  isRoundOver,
  mark,
  markOf,
  nextRound,
  parseSet,
  readingOrder,
  reveal,
  revealAll,
  start,
  summary,
  type LabelSet,
} from '../../src/islands/labelit';

// Everyday labels on a house drawing; the image path doesn't need to exist.
const house = (): LabelSet =>
  parseSet({
    id: 'house',
    image: { src: '/visuals/house.svg', alt: 'a drawing of a house', width: 800, height: 600, credit: 'cueory, cc by 4.0' },
    labels: [
      { id: 'door', text: 'door', x: 45, y: 70, w: 10, h: 25 },
      { id: 'roof', text: 'roof', x: 20, y: 5, w: 60, h: 20 },
      { id: 'window', text: 'window', x: 15, y: 40, w: 15, h: 15 },
    ],
  });

const withLabels = (labels: unknown[], image: Record<string, unknown> = {}) => ({
  id: 'test',
  image: { src: '/a.svg', alt: 'a', width: 10, height: 10, credit: 'c', ...image },
  labels,
});
const box = { id: 'a', text: 'a', x: 0, y: 0, w: 10, h: 10 };

describe('parseSet', () => {
  it('accepts a good set', () => {
    expect(house().labels).toHaveLength(3);
  });

  it.each([
    ['not an object', null, /must be an object/],
    ['no labels', withLabels([]), /at least one label/],
    ['missing credit', withLabels([box], { credit: '' }), /credit line\. No credit means no image/],
    ['blank credit', withLabels([box], { credit: '   ' }), /credit line/],
    ['missing alt text', withLabels([box], { alt: '' }), /alt text/],
    ['zero image size', withLabels([box], { width: 0 }), /width and height in pixels/],
    ['repeated ids', withLabels([box, { ...box, x: 50 }]), /"a" is used more than once/],
    ['empty text', withLabels([{ ...box, text: ' ' }]), /needs text/],
    ['x below 0', withLabels([{ ...box, x: -1 }]), /x must be a percentage from 0 to 100/],
    ['y above 100', withLabels([{ ...box, y: 101 }]), /y must be a percentage/],
    ['width not a number', withLabels([{ ...box, w: '10' }]), /w must be a percentage/],
    ['zero-size box', withLabels([{ ...box, h: 0 }]), /width and height above 0/],
    ['box past the right edge', withLabels([{ ...box, x: 95, w: 10 }]), /runs past the edge/],
    ['box past the bottom', withLabels([{ ...box, y: 91, h: 10 }]), /runs past the edge/],
  ])('rejects %s', (_name, data, message) => {
    expect(() => parseSet(data)).toThrow(message);
  });

  it('allows a box that ends exactly at the edge, with rounding slack', () => {
    expect(() => parseSet(withLabels([{ ...box, x: 33.33, w: 66.67 }]))).not.toThrow();
  });

  it('keeps only known fields', () => {
    const set = parseSet({ ...withLabels([{ ...box, extra: 'x' }]), note: 'x' });
    expect(set.labels[0]).toEqual(box);
    expect(Object.keys(set)).toEqual(['id', 'image', 'labels']);
  });
});

describe('reading order', () => {
  it('goes top to bottom, then left to right', () => {
    expect(readingOrder(house().labels).map((l) => l.id)).toEqual(['roof', 'window', 'door']);
    const row = [
      { ...box, id: 'right', x: 60 },
      { ...box, id: 'left', x: 10 },
    ];
    expect(readingOrder(row).map((l) => l.id)).toEqual(['left', 'right']);
  });

  it('starts with every label covered, in reading order', () => {
    const state = start(house());
    expect(state.round).toEqual(['roof', 'window', 'door']);
    expect(state.round.every((id) => isCovered(state, id))).toBe(true);
  });
});

describe('words for a cover', () => {
  it('never give away a covered label', () => {
    for (const label of house().labels) {
      const words = coverWords(2, label, false);
      expect(words).toBe('label 2, covered');
      expect(words).not.toContain(label.text);
    }
  });

  it('say the label once it is uncovered', () => {
    expect(coverWords(1, { text: 'roof' }, true)).toBe('label 1: roof');
  });
});

describe('reveal and mark', () => {
  it('a covered label cannot be marked', () => {
    const state = start(house());
    expect(mark(state, 'roof', 'know')).toBe(state);
  });

  it('uncovers one label, then marks it', () => {
    let state = reveal(start(house()), 'roof');
    expect(isCovered(state, 'roof')).toBe(false);
    expect(isCovered(state, 'door')).toBe(true);
    state = mark(state, 'roof', 'know');
    expect(state.marks).toEqual({ roof: 'know' });
    expect(mark(state, 'roof', 'learning').marks).toEqual({ roof: 'learning' });
  });

  it('ignores unknown labels and a second reveal', () => {
    const once = reveal(start(house()), 'roof');
    expect(reveal(once, 'roof')).toBe(once);
    expect(reveal(once, 'chimney')).toBe(once);
    expect(mark(once, 'chimney', 'know')).toBe(once);
  });

  it('reveal all and cover all', () => {
    const all = revealAll(reveal(start(house()), 'door'));
    expect(all.revealed).toHaveLength(3);
    expect(new Set(all.revealed)).toEqual(new Set(['roof', 'window', 'door']));
    const marked = mark(all, 'door', 'learning');
    const covered = coverAll(marked);
    expect(covered.revealed).toEqual([]);
    expect(covered.marks).toEqual({});
  });
});

describe('rounds', () => {
  const markAll = (marks: Record<string, 'know' | 'learning'>) => {
    let state = revealAll(start(house()));
    for (const [id, m] of Object.entries(marks)) state = mark(state, id, m);
    return state;
  };

  it('a round is over once every label is marked', () => {
    const partly = mark(revealAll(start(house())), 'roof', 'know');
    expect(isRoundOver(partly)).toBe(false);
    expect(isRoundOver(markAll({ roof: 'know', window: 'learning', door: 'know' }))).toBe(true);
  });

  it('the next round covers only the "still learning" labels', () => {
    const next = nextRound(markAll({ roof: 'know', window: 'learning', door: 'learning' }));
    expect(next.round).toEqual(['window', 'door']);
    expect(next.revealed).toEqual([]);
    expect(next.marks).toEqual({});
    expect(next.known).toEqual(['roof']);
    expect(next.roundNumber).toBe(2);
    expect(isCovered(next, 'roof')).toBe(false);
    expect(isCovered(next, 'window')).toBe(true);
    // A label known in an earlier round can't be marked again.
    expect(mark(next, 'roof', 'learning')).toBe(next);
  });

  it('is done when every label in the round is known', () => {
    expect(isDone(markAll({ roof: 'know', window: 'learning', door: 'know' }))).toBe(false);
    const second = nextRound(markAll({ roof: 'know', window: 'learning', door: 'know' }));
    const finished = mark(reveal(second, 'window'), 'window', 'know');
    expect(isDone(finished)).toBe(true);
    expect(nextRound(finished).round).toEqual([]);
    expect(nextRound(finished).known).toEqual(['roof', 'door', 'window']);
  });

  it('summary counts this round and earlier rounds', () => {
    let state = reveal(start(house()), 'roof');
    state = mark(state, 'roof', 'learning');
    expect(summary(state)).toEqual({ know: 0, learning: 1, unmarked: 2, covered: 2, total: 3, knownBefore: 0 });
    const next = nextRound(markAll({ roof: 'know', window: 'know', door: 'learning' }));
    expect(summary(next)).toEqual({ know: 0, learning: 0, unmarked: 1, covered: 1, total: 1, knownBefore: 2 });
  });
});

describe('board markup', () => {
  // The words a covered label would give away. The image's alt text is allowed to describe the picture.
  const secrets = /\b(roof|window|door)\b/;

  it('a fully covered board has no label text anywhere in its HTML', () => {
    const html = renderToString(createElement(LabelItBoard, { set: house() }));
    expect(html).toContain('label 1, covered');
    expect(html.replace('a drawing of a house', '')).not.toMatch(secrets);
  });

  it('the loader starts with only the file address: no label text, no board yet', () => {
    const html = renderToString(createElement(LabelItFromUrl, { src: '/learn/study-skills/label-it/house.json' }));
    expect(html).toContain('loading the diagram');
    expect(html).not.toMatch(secrets);
  });

  it('an unreadable set shows a plain message instead of a board', () => {
    const html = renderToString(createElement(LabelItBoard, { set: { id: 'x' } as unknown as LabelSet }));
    expect(html).toContain('this diagram could not be loaded');
  });
});

describe('cover placement', () => {
  it('centres the target on its box but keeps it inside the image', () => {
    const left = coverAxis(0, 1);
    expect(left.size).toBe('max(calc(var(--spacing) * 11), 1%)');
    expect(left.offset).toBe('clamp(0px, calc(0.5% - max(calc(var(--spacing) * 11), 1%) / 2), calc(100% - max(calc(var(--spacing) * 11), 1%)))');
    expect(coverAxis(99, 1).offset).toBe('clamp(0px, calc(99.5% - max(calc(var(--spacing) * 11), 1%) / 2), calc(100% - max(calc(var(--spacing) * 11), 1%)))');
  });
});

describe('label ids that match built-in object names', () => {
  const tricky = () =>
    parseSet(withLabels([{ ...box, id: 'constructor' }, { ...box, id: 'toString', x: 50 }, { ...box, id: '__proto__', y: 50 }]));

  it('start uncovered, unmarked, and the round is not over', () => {
    const state = start(tricky());
    expect(markOf(state, 'constructor')).toBeUndefined();
    expect(isRoundOver(state)).toBe(false);
    expect(isDone(state)).toBe(false);
    expect(summary(state)).toMatchObject({ unmarked: 3, covered: 3, total: 3 });
  });

  it('are marked and carried into the next round like any other id', () => {
    let state = revealAll(start(tricky()));
    state = mark(mark(mark(state, 'constructor', 'learning'), 'toString', 'know'), '__proto__', 'learning');
    expect(markOf(state, '__proto__')).toBe('learning');
    expect(isRoundOver(state)).toBe(true);
    const next = nextRound(state);
    expect(next.round).toEqual(['constructor', '__proto__']);
    expect(next.known).toEqual(['toString']);
    expect(isRoundOver(next)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelAnchor } from '../../src/islands/anatomylab';

const anchors: LabelAnchor[] = [
  { id: 'a', x: 70, y: 45, width: 80, height: 24 },
  { id: 'b', x: 230, y: 65, width: 80, height: 24 },
];

describe('anatomy labels in a collapsed or hidden canvas', () => {
  it.each([0, 1, 8, 15, 16, -1, Number.NaN])(
    'does not throw or place impossible labels at canvas height %s',
    (height) => {
      const options = { width: 320, height };
      expect(placeLabels([], options)).toEqual({ placed: [], leftOut: [] });
      expect(placeLabels(anchors, options)).toEqual({
        placed: [],
        leftOut: ['a', 'b'],
      });
    },
  );

  it('keeps source order and reports a repeated ID only once when there is no room', () => {
    expect(placeLabels([anchors[1]!, anchors[0]!, anchors[1]!], { width: 320, height: 0 }))
      .toEqual({ placed: [], leftOut: ['b', 'a'] });
  });

  it('still places labels normally once the canvas has positive label room', () => {
    const placed = placeLabels(anchors, { width: 320, height: 140 });
    expect(placed.leftOut).toEqual([]);
    expect(placed.placed.map((label) => label.id).sort()).toEqual(['a', 'b']);
    for (const label of placed.placed) {
      expect(Number.isFinite(label.x)).toBe(true);
      expect(Number.isFinite(label.y)).toBe(true);
    }
  });
});

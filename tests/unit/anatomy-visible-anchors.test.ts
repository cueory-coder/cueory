import { describe, expect, it } from 'vitest';
import { findVisibleAnchors, type VisibilityTarget } from '../../src/islands/anatomylab';

/** Synthetic ID pixels, top row first; WebGL readPixels stores bottom row first. */
function picture(rows: number[][]): Uint8Array {
  const height = rows.length;
  const width = rows[0]!.length;
  const bytes = new Uint8Array(width * height * 4);
  rows.forEach((row, y) => row.forEach((code, x) => {
    const offset = ((height - 1 - y) * width + x) * 4;
    bytes.set([code & 255, (code >> 8) & 255, (code >> 16) & 255, 255], offset);
  }));
  return bytes;
}
const target = (x: number, y: number, index = 0) =>
  new Map<string, VisibilityTarget>([['sample', { index, x, y }]]);

describe('anatomy label visibility and nearest-pixel fallback', () => {
  it('requires three pixels even when the projected center matches a single visible pixel', () => {
    const one = picture([[0, 0, 0], [0, 1, 0], [0, 0, 0]]);
    expect(findVisibleAnchors(one, 3, 3, target(1, 1), 3).get('sample')).toEqual({
      visible: false, x: 1, y: 1,
    });
    expect(findVisibleAnchors(one, 3, 3, target(0, 0), 3).get('sample')).toEqual({
      visible: false, x: 0, y: 0,
    });
    expect(findVisibleAnchors(one, 3, 3, target(1, 1), 1).get('sample')).toEqual({
      visible: true, x: 1, y: 1,
    });
    expect(findVisibleAnchors(one, 3, 3, target(0, 0), 1).get('sample')).toEqual({
      visible: true, x: 1, y: 1,
    });
  });

  it('keeps the exact projected center only after the minimum area becomes visible', () => {
    const two = picture([[0, 1, 0], [0, 1, 0], [0, 0, 0]]);
    const three = picture([[0, 1, 0], [1, 1, 0], [0, 0, 0]]);
    expect(findVisibleAnchors(two, 3, 3, target(1.2, 1.1), 3).get('sample')).toEqual({
      visible: false, x: 1.2, y: 1.1,
    });
    expect(findVisibleAnchors(three, 3, 3, target(1.2, 1.1), 3).get('sample')).toEqual({
      visible: true, x: 1.2, y: 1.1,
    });
  });

  it('chooses the same nearest visible pixel for hollow and disconnected shapes', () => {
    const rows = Array.from({ length: 12 }, () => Array<number>(12).fill(0));
    for (const [x, y] of [[2, 2], [4, 2], [2, 4], [4, 4]]) rows[y]![x] = 1;
    for (const [x, y] of [[9, 9], [10, 9], [9, 10]]) rows[y]![x] = 2;
    const targets = new Map<string, VisibilityTarget>([
      ['ring', { index: 0, x: 0, y: 0 }],
      ['corner', { index: 1, x: 0, y: 0 }],
    ]);
    const found = findVisibleAnchors(picture(rows), 12, 12, targets);
    expect(found.get('ring')).toEqual({ visible: true, x: 2, y: 2 });
    expect(found.get('corner')).toEqual({ visible: true, x: 9, y: 9 });
  });

  it('does not rescan the entire ID picture when the centroid is empty', () => {
    const width = 64;
    const height = 64;
    const rows = Array.from({ length: height }, () => Array<number>(width).fill(0));
    for (const [x, y] of [[2, 2], [4, 2], [2, 4], [4, 4]]) rows[y]![x] = 1;
    let byteReads = 0;
    const tracked = new Proxy(picture(rows), {
      get(value, property) {
        if (typeof property === 'string' && /^\d+$/.test(property)) byteReads++;
        return Reflect.get(value, property, value);
      },
    });
    expect(findVisibleAnchors(tracked, width, height, target(0, 0)).get('sample')).toEqual({
      visible: true, x: 2, y: 2,
    });
    // Initial 64x64 count pass and only a small bounded secondary lookup.
    // A second full-frame search would exceed this count.
    expect(byteReads).toBeLessThan((width * height + 50) * 3);
  });

  it('never marks an entirely absent mesh visible, even with a zero-pixel threshold', () => {
    const empty = picture([[0, 0], [0, 0]]);
    expect(findVisibleAnchors(empty, 2, 2, target(1, 1), 0).get('sample')).toEqual({
      visible: false, x: 1, y: 1,
    });
  });
});

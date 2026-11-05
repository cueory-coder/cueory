import { describe, expect, it } from 'vitest';
import { anatomyTriangleNote } from '../../src/islands/anatomybudget';
import { MAX_TRIANGLES, checkTriangleBudget } from '../../src/islands/bodyviewer-logic';

describe('anatomy triangle notices', () => {
  it('keeps the existing per-model phone warning for a single system', () => {
    expect(anatomyTriangleNote(MAX_TRIANGLES, 1, false)).toBeNull();
    expect(anatomyTriangleNote(MAX_TRIANGLES + 1, 1, false)).toBe(checkTriangleBudget(MAX_TRIANGLES + 1));
    expect(anatomyTriangleNote(MAX_TRIANGLES + 1, 1, true)).toBe(checkTriangleBudget(MAX_TRIANGLES + 1));
  });

  it('reports a multi-file whole-body total without calling it a single-file violation', () => {
    // Each GLB is below the 150,000-triangle limit. After peeling the
    // outer layer, both files are loaded, even though one is hidden.
    const skin = 147_000;
    const muscle = 149_856;
    const note = anatomyTriangleNote(skin + muscle, 2, true);
    expect(note).toContain('296,856 loaded triangles across 2 model files');
    expect(note).toContain('150,000-triangle phone budget applies to each file');
    expect(note).toContain('not their combined total');
    expect(note).not.toContain('Model has 296,856 triangles');
  });

  it('does not show an unnecessary caution for a small combined scene', () => {
    expect(anatomyTriangleNote(MAX_TRIANGLES, 2, true)).toBeNull();
    expect(anatomyTriangleNote(0, 11, true)).toBeNull();
  });

  it('does not mistake a bad model count or invalid triangles for a valid combined scene', () => {
    expect(anatomyTriangleNote(MAX_TRIANGLES + 1, 0, true)).toBe(checkTriangleBudget(MAX_TRIANGLES + 1));
    expect(anatomyTriangleNote(MAX_TRIANGLES + 1, Number.NaN, true)).toBe(checkTriangleBudget(MAX_TRIANGLES + 1));
    expect(anatomyTriangleNote(Number.NaN, 2, true)).toBe('Triangle count is not a valid number.');
    expect(anatomyTriangleNote(-1, 3, true)).toBe('Triangle count is not a valid number.');
    expect(anatomyTriangleNote(Number.POSITIVE_INFINITY, 2, true)).toBe('Triangle count is not a valid number.');
  });
});

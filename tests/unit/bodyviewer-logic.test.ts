import { describe, expect, it } from 'vitest';
import {
  LAYERS,
  MAX_SIZE_BYTES,
  MAX_TRIANGLES,
  checkModelBudget,
  checkTriangleBudget,
  toggleLayer,
  type Layer,
} from '../../src/islands/bodyviewer-logic';

describe('body viewer model budgets', () => {
  it('accepts values at both budget limits', () => {
    expect(checkTriangleBudget(0)).toBeNull();
    expect(checkTriangleBudget(MAX_TRIANGLES)).toBeNull();
    expect(checkModelBudget(0, 0)).toBeNull();
    expect(checkModelBudget(MAX_SIZE_BYTES, MAX_TRIANGLES)).toBeNull();
  });

  it.each([
    [Number.NaN, 'Triangle count is not a valid number.'],
    [Number.POSITIVE_INFINITY, 'Triangle count is not a valid number.'],
    [-1, 'Triangle count is not a valid number.'],
  ])('rejects an invalid triangle count (%s)', (triangles, message) => {
    expect(checkTriangleBudget(triangles)).toBe(message);
  });

  it('reports a triangle count over the limit with a readable value', () => {
    expect(checkTriangleBudget(MAX_TRIANGLES + 1)).toBe('Model has 150,001 triangles; the phone budget is 150,000.');
  });

  it.each([
    [Number.NaN, 'Model size is not a valid number.'],
    [Number.POSITIVE_INFINITY, 'Model size is not a valid number.'],
    [-1, 'Model size is not a valid number.'],
  ])('rejects an invalid model size (%s)', (sizeBytes, message) => {
    expect(checkModelBudget(sizeBytes, 0)).toBe(message);
  });

  it('rejects an invalid triangle count before checking the size limit', () => {
    expect(checkModelBudget(0, Number.NaN)).toBe('Triangle count is not a valid number.');
  });

  it('reports a model over the size limit in megabytes', () => {
    expect(checkModelBudget(MAX_SIZE_BYTES + 1, 0)).toBe('Model is 3.0 MB; the phone budget is 3 MB.');
  });

  it('reports the size problem before a triangle problem when both exceed their limits', () => {
    expect(checkModelBudget(MAX_SIZE_BYTES + 1, MAX_TRIANGLES + 1)).toBe('Model is 3.0 MB; the phone budget is 3 MB.');
  });
});

describe('body viewer layers', () => {
  it('exports the supported layers in their display order', () => {
    expect(LAYERS).toEqual<readonly Layer[]>(['skin', 'muscle', 'bone']);
  });

  it('adds and removes a layer without mutating the original set', () => {
    const visible = new Set<Layer>(['skin']);
    const withMuscle = toggleLayer(visible, 'muscle');
    const withoutSkin = toggleLayer(withMuscle, 'skin');

    expect([...visible]).toEqual(['skin']);
    expect([...withMuscle]).toEqual(['skin', 'muscle']);
    expect([...withoutSkin]).toEqual(['muscle']);
  });

  it('returns a new set even when toggling an absent layer on an empty set', () => {
    const visible = new Set<Layer>();
    const next = toggleLayer(visible, 'bone');

    expect(next).not.toBe(visible);
    expect(next).toEqual(new Set<Layer>(['bone']));
  });
});

import { describe, expect, it } from 'vitest';
import {
  LAYERS,
  MAX_SIZE_BYTES,
  MAX_TRIANGLES,
  checkModelBudget,
  toggleLayer,
  type Layer,
} from '../../src/islands/bodyviewer-logic';

describe('LAYERS', () => {
  it('contains skin, muscle, and bone in that order', () => {
    expect(LAYERS).toEqual(['skin', 'muscle', 'bone']);
  });
});

describe('checkModelBudget', () => {
  it('returns null when size and triangles are within budget', () => {
    expect(checkModelBudget(0, 0)).toBeNull();
    expect(checkModelBudget(MAX_SIZE_BYTES, MAX_TRIANGLES)).toBeNull();
    expect(checkModelBudget(1024, 1000)).toBeNull();
  });

  it('reports an error when size exceeds the budget', () => {
    const result = checkModelBudget(MAX_SIZE_BYTES + 1, 0);
    expect(result).not.toBeNull();
    expect(result).toContain('MB');
    expect(result).toContain('3 MB');
  });

  it('reports an error when triangle count exceeds the budget', () => {
    const result = checkModelBudget(0, MAX_TRIANGLES + 1);
    expect(result).not.toBeNull();
    expect(result).toContain('150,000');
  });

  it('reports size error before triangle error when both exceed budget', () => {
    const result = checkModelBudget(MAX_SIZE_BYTES + 1, MAX_TRIANGLES + 1);
    expect(result).toContain('MB');
  });

  it('rejects negative size', () => {
    const result = checkModelBudget(-1, 0);
    expect(result).not.toBeNull();
  });

  it('rejects negative triangle count', () => {
    const result = checkModelBudget(0, -1);
    expect(result).not.toBeNull();
  });

  it('rejects non-finite size (NaN)', () => {
    const result = checkModelBudget(NaN, 0);
    expect(result).not.toBeNull();
  });

  it('rejects non-finite triangle count (Infinity)', () => {
    const result = checkModelBudget(0, Infinity);
    expect(result).not.toBeNull();
  });
});

describe('toggleLayer', () => {
  const allLayers = new Set<Layer>(LAYERS);

  it('removes a layer that is currently visible', () => {
    const result = toggleLayer(allLayers, 'bone');
    expect(result.has('bone')).toBe(false);
    expect(result.has('skin')).toBe(true);
    expect(result.has('muscle')).toBe(true);
  });

  it('adds a layer that is currently hidden', () => {
    const noBone = new Set<Layer>(['skin', 'muscle']);
    const result = toggleLayer(noBone, 'bone');
    expect(result.has('bone')).toBe(true);
  });

  it('does not mutate the original set', () => {
    const original = new Set<Layer>(LAYERS);
    toggleLayer(original, 'skin');
    expect(original.has('skin')).toBe(true);
  });

  it('returns a new Set instance', () => {
    const result = toggleLayer(allLayers, 'skin');
    expect(result).not.toBe(allLayers);
  });

  it('can toggle all layers off one by one', () => {
    let visible: ReadonlySet<Layer> = new Set(LAYERS);
    for (const layer of LAYERS) {
      visible = toggleLayer(visible, layer);
    }
    expect(visible.size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { needsBulkLayerConfirmation, showAllPlan } from '../../src/islands/anatomylazy';
import type { Layer } from '../../src/islands/anatomylayers';

describe('phone confirmation for whole-body bulk loads', () => {
  it('requires consent only for two or more additional files on a narrow viewport', () => {
    expect(needsBulkLayerConfirmation(true, 10)).toBe(true);
    expect(needsBulkLayerConfirmation(true, 2)).toBe(true);
    expect(needsBulkLayerConfirmation(true, 1)).toBe(false);
    expect(needsBulkLayerConfirmation(true, 0)).toBe(false);
    expect(needsBulkLayerConfirmation(false, 10)).toBe(false);
  });

  it('rejects invalid, negative and fractional counts', () => {
    for (const files of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(needsBulkLayerConfirmation(true, files)).toBe(false);
    }
  });

  it('counts unique uncached files across layers, not duplicate shared GLB URLs', () => {
    const layers: Layer[] = [
      { id: 'vessels', ids: ['vessel'] },
      { id: 'organs', ids: ['organ'] },
    ];
    const byLayer: Record<string, string[]> = {
      vessels: ['shared.glb', 'vessels.glb'],
      organs: ['shared.glb', 'lungs.glb'],
    };
    const loaded = new Set(['shared.glb']);
    const plan = showAllPlan(layers, new Set(['vessel', 'organ']), (id) => byLayer[id]!, (url) => loaded.has(url));
    const missing = new Set(plan.fetch.flatMap((layer) => byLayer[layer.id]!.filter((url) => !loaded.has(url))));
    expect([...missing].sort()).toEqual(['lungs.glb', 'vessels.glb']);
    expect(needsBulkLayerConfirmation(true, missing.size)).toBe(true);
    loaded.add('lungs.glb');
    const oneMissing = new Set(plan.fetch.flatMap((layer) => byLayer[layer.id]!.filter((url) => !loaded.has(url))));
    expect(needsBulkLayerConfirmation(true, oneMissing.size)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { knownMissingStructureIds, structureLoadNote } from '../../src/islands/anatomylazy';

// Synthetic source paths and IDs only. No anatomy facts or released GLB data.
const filesOfLayer = () => ['a.glb', 'b.glb'];

describe('anatomy GLB structure-owner lookup', () => {
  it('indexes a large source map once, then reuses it across list and missing-count queries', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `model-${i}.glb`);
    const mapped = Object.fromEntries(urls.map((url, file) => [
      url,
      Array.from({ length: 25 }, (_, id) => `part-${file * 25 + id}`),
    ]));
    let enumerations = 0;
    const fileIds = new Proxy(mapped, {
      ownKeys(target) {
        enumerations++;
        return Reflect.ownKeys(target);
      },
    });
    const structures = Array.from({ length: 250 }, (_, i) => ({ id: `part-${i}`, layer: 'organs' as const }));
    const found = new Set<string>();

    expect(knownMissingStructureIds(
      structures, found, filesOfLayer, urls, () => true, fileIds,
    )).toHaveLength(250);
    expect(enumerations).toBe(1);

    for (let i = 0; i < 250; i++) {
      expect(structureLoadNote(
        structures[i]!, found, true, filesOfLayer, urls, () => true, fileIds,
      )).toBe('not in this model');
    }
    // No repeated Object.entries scan for the status of each of 250 rows.
    expect(enumerations).toBe(1);
  });

  it('keeps different catalog objects independent, including pending shared owners', () => {
    const one = { 'ready.glb': ['sample'] };
    const two = { 'pending.glb': ['sample'] };
    const found = new Set<string>();
    const loaded = (url: string) => url === 'ready.glb';
    const status = (fileIds: Readonly<Record<string, readonly string[]>>) =>
      structureLoadNote({ id: 'sample', layer: 'organs' }, found, true,
        filesOfLayer, ['ready.glb', 'pending.glb'], loaded, fileIds);

    expect(status(one)).toBe('not in this model');
    expect(status(two)).toBe('not loaded yet');
    expect(status(one)).toBe('not in this model');
  });

  it('checks each owning URL once even when a file repeats an ID', () => {
    const calls: string[] = [];
    const owners = {
      'ready.glb': ['sample', 'sample'],
      'pending.glb': ['sample', 'sample'],
    };
    expect(structureLoadNote(
      { id: 'sample', layer: 'organs' }, new Set(), true,
      filesOfLayer, Object.keys(owners),
      (url) => { calls.push(url); return url === 'ready.glb'; }, owners,
    )).toBe('not loaded yet');
    expect(calls).toEqual(['ready.glb', 'pending.glb']);
  });
});

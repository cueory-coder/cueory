import { describe, expect, it } from 'vitest';
import { fileReadyForStructureStatus, knownMissingStructureIds } from '../../src/islands/anatomylazy';
import type { AnatomyStructure } from '../../src/islands/anatomylab';

// Entirely synthetic IDs and GLB URLs. One file contains candidates for
// multiple layers; another layer spans two files.
const structures: Array<Pick<AnatomyStructure, 'id' | 'layer'>> = [
  { id: 'sample-a', layer: 'vessels' },
  { id: 'sample-b', layer: 'organs' },
  { id: 'sample-c', layer: 'organs' },
  { id: 'sample-absent', layer: 'organs' },
  { id: 'sample-unlayered' },
];
const layerFiles: Record<string, string[]> = {
  vessels: ['shared.glb', 'vessels.glb'],
  organs: ['shared.glb', 'other.glb'],
};
const allFiles = ['shared.glb', 'vessels.glb', 'other.glb'];
const filesFor = (layer: string): readonly string[] => layerFiles[layer] ?? [];
const missing = (found: ReadonlySet<string>, loaded: ReadonlySet<string>) =>
  knownMissingStructureIds(structures, found, filesFor, allFiles, (url) => loaded.has(url));

describe('whole-body verified missing structure summary', () => {
  it('does not count IDs from model files that have not downloaded yet', () => {
    const loaded = new Set(['shared.glb', 'vessels.glb']);
    const found = new Set(['sample-a', 'sample-b']);
    expect(missing(found, loaded)).toEqual([]);
  });

  it('does not believe a single GLB when another GLB contains the requested ID', () => {
    // All three source files arrived: a mesh found in the second GLB is not
    // missing just because it was not present in the shared GLB.
    const loaded = new Set(allFiles);
    const found = new Set(['sample-a', 'sample-b', 'sample-c']);
    expect(missing(found, loaded)).toEqual(['sample-absent', 'sample-unlayered']);
  });

  it('removes newly found IDs from the summary after a later integration', () => {
    const loaded = new Set(allFiles);
    const found = new Set(['sample-a', 'sample-b', 'sample-c']);
    expect(missing(found, loaded)).toContain('sample-absent');
    found.add('sample-absent');
    expect(missing(found, loaded)).toEqual(['sample-unlayered']);
  });

  it('waits for found IDs to be committed after an overlapping GLB batch finishes', () => {
    const loaded = new Set(allFiles);
    // A shared file completed downloading, but its structure IDs are still
    // held by a second pending file in that same layer's ensure() batch.
    const staged = new Set(['sample-a', 'sample-c']);
    const pendingStatus = (url: string) => fileReadyForStructureStatus(loaded.has(url), 1);
    expect(fileReadyForStructureStatus(true, 1)).toBe(false);
    expect(knownMissingStructureIds(structures, staged, filesFor, allFiles, pendingStatus)).toEqual([]);

    // The batch settles and publishes both the shared file's ID and the rest.
    staged.add('sample-b');
    const settledStatus = (url: string) => fileReadyForStructureStatus(loaded.has(url), 0);
    expect(fileReadyForStructureStatus(true, 0)).toBe(true);
    expect(knownMissingStructureIds(structures, staged, filesFor, allFiles, settledStatus))
      .toEqual(['sample-absent', 'sample-unlayered']);
  });

  it('waits for every system file before reporting an unlayered missing ID', () => {
    const found = new Set(['sample-a', 'sample-b', 'sample-c', 'sample-absent']);
    expect(missing(found, new Set(['shared.glb', 'other.glb']))).toEqual([]);
    expect(missing(found, new Set(allFiles))).toEqual(['sample-unlayered']);
  });
});

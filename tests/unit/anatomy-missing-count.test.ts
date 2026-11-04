import { describe, expect, it } from 'vitest';
import { knownMissingStructureIds } from '../../src/islands/anatomylazy';
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

  it('waits for a file to be published even if its network download finished', () => {
    const downloaded = new Set(allFiles);
    const published = new Set(['vessels.glb']);
    const found = new Set(['sample-a', 'sample-c']);
    expect(downloaded.has('shared.glb')).toBe(true);
    // The shared and other GLBs have not yet published their found IDs.
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles,
      (url) => published.has(url))).toEqual([]);

    // The owning URLs and found IDs become ready in the same state commit.
    published.add('shared.glb');
    found.add('sample-b');
    published.add('other.glb');
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles,
      (url) => published.has(url))).toEqual(['sample-absent', 'sample-unlayered']);
  });

  it('uses the exact owning GLB map for a missing ID, not the entire layer', () => {
    const ownership = {
      'shared.glb': ['sample-a', 'sample-b'],
      'vessels.glb': ['sample-a'],
      'other.glb': ['sample-c', 'sample-absent'],
    };
    const found = new Set(['sample-a', 'sample-b']);
    const loaded = new Set(['shared.glb', 'vessels.glb']);
    const check = (url: string) => loaded.has(url);
    // Missing sample-c is pending because its own file remains unloaded.
    // The unmapped ID is genuinely absent from the declared model inventory.
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles, check, ownership))
      .toEqual(['sample-unlayered']);
    loaded.add('other.glb');
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles, check, ownership))
      .toEqual(['sample-c', 'sample-absent', 'sample-unlayered']);
  });

  it('keeps confirmed missing IDs and adds newly verified owners as files finish', () => {
    const ownership = {
      'shared.glb': ['sample-a'],
      'vessels.glb': ['sample-b'],
      'other.glb': ['sample-c', 'sample-absent'],
    };
    const published = new Set(['other.glb']);
    const found = new Set(['sample-c']);
    const fileReady = (url: string) => published.has(url);
    // The real owner is published; two unrelated URLs remain pending.
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles, fileReady, ownership))
      .toEqual(['sample-absent', 'sample-unlayered']);
    // Nothing about the existing confirmed absences changes while an unrelated
    // GLB has not published its result.
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles, fileReady, ownership))
      .toEqual(['sample-absent', 'sample-unlayered']);

    published.add('vessels.glb');
    // That GLB owns sample-b. Since sample-b is still not in found, it is now
    // a newly verified missing mesh. The previously confirmed IDs remain.
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles, fileReady, ownership))
      .toEqual(['sample-b', 'sample-absent', 'sample-unlayered']);

    published.add('shared.glb');
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles, fileReady, ownership))
      .toEqual(['sample-a', 'sample-b', 'sample-absent', 'sample-unlayered']);

    // A later scene-state update can retract a missing ID only when that mesh
    // is actually published into the combined found set.
    found.add('sample-b');
    expect(knownMissingStructureIds(structures, found, filesFor, allFiles, fileReady, ownership))
      .toEqual(['sample-a', 'sample-absent', 'sample-unlayered']);
  });

  it('waits for every system file before reporting an unlayered missing ID', () => {
    const found = new Set(['sample-a', 'sample-b', 'sample-c', 'sample-absent']);
    expect(missing(found, new Set(['shared.glb', 'other.glb']))).toEqual([]);
    expect(missing(found, new Set(allFiles))).toEqual(['sample-unlayered']);
  });
});

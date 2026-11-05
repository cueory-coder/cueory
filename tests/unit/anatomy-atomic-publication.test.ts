import { describe, expect, it } from 'vitest';
import { knownMissingStructureIds, publishAnatomyFile } from '../../src/islands/anatomylazy';

// Synthetic IDs and paths only, never published anatomical content.
const structures = [
  { id: 'missing-a', layer: 'vessels' as const },
  { id: 'found-b', layer: 'organs' as const },
  { id: 'missing-b', layer: 'organs' as const },
];
const owners = {
  'a.glb': ['missing-a'],
  'b.glb': ['found-b', 'missing-b'],
};
const missing = (found: readonly string[], published: ReadonlySet<string>) =>
  knownMissingStructureIds(
    structures,
    new Set(found),
    (layer) => layer === 'vessels' ? ['a.glb'] : ['b.glb'],
    ['a.glb', 'b.glb'],
    (url) => published.has(url),
    owners,
  );

describe('atomic anatomy file publication', () => {
  it('preserves an existing missing structure while an unrelated GLB is still downloading', () => {
    const first = {
      result: { found: [] as string[], missing: ['missing-a'], triangles: 12 },
      publishedFiles: new Set(['a.glb']),
    };
    const downloaded = new Set(['a.glb', 'b.glb']);
    expect(downloaded.has('b.glb')).toBe(true);
    expect(first.publishedFiles.has('b.glb')).toBe(false);
    expect(missing(first.result.found, first.publishedFiles)).toEqual(['missing-a']);

    const next = publishAnatomyFile(
      first,
      'b.glb',
      { found: ['found-b'], missing: ['missing-b'], triangles: 8 },
    );
    expect(missing(next.result.found, next.publishedFiles)).toEqual(['missing-a', 'missing-b']);
    expect(next.result.triangles).toBe(20);
    expect(next.result.found).toEqual(['found-b']);
  });

  it('does not mutate the previous snapshot and deduplicates repeated structure IDs', () => {
    const earlier = {
      result: { found: ['shared'], missing: ['shared', 'absent'], triangles: 5 },
      publishedFiles: new Set(['first.glb']),
    };
    const next = publishAnatomyFile(
      earlier, 'next.glb',
      { found: ['shared', 'new', 'new'], missing: [], triangles: 7 },
    );
    expect(next.result.found).toEqual(['shared', 'new']);
    expect(next.result.missing).toEqual(['absent']);
    expect(next.publishedFiles).toEqual(new Set(['first.glb', 'next.glb']));
    expect(earlier.result.found).toEqual(['shared']);
    expect(earlier.result.missing).toEqual(['shared', 'absent']);
    expect(earlier.publishedFiles).toEqual(new Set(['first.glb']));
    expect(next.publishedFiles).not.toBe(earlier.publishedFiles);
  });

  it('only changes a confirmed missing result when its own file publishes a found mesh', () => {
    const state = {
      result: { found: [] as string[], missing: ['missing-a'], triangles: 0 },
      publishedFiles: new Set(['a.glb']),
    };
    expect(missing(state.result.found, state.publishedFiles)).toContain('missing-a');
    const next = publishAnatomyFile(
      state, 'another.glb',
      { found: ['missing-a'], missing: [], triangles: 10 },
    );
    expect(missing(next.result.found, next.publishedFiles)).not.toContain('missing-a');
    expect(missing(state.result.found, state.publishedFiles)).toContain('missing-a');
  });
});

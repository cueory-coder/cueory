import { describe, expect, it } from 'vitest';
import type { AnatomyStructure, AnatomySystem } from '../../src/islands/anatomylab';
import { structureLoadNote } from '../../src/islands/anatomylazy';
import {
  LAYERS,
  WHOLE_BODY_KEY,
  isLayer,
  layerShown,
  layersOf,
  missingLayers,
  nextToPeel,
  nextToRestore,
  peel,
  restore,
  toggleLayer,
  unavailableLayersNote,
  wholeBody,
} from '../../src/islands/anatomylayers';

// Placeholder structures (not anatomy): ids and names are made up; only their layers matter here.
const structures: AnatomyStructure[] = [
  { id: 'v1', text: 'sample vessel one', layer: 'vessels' },
  { id: 'o1', text: 'sample organ one', layer: 'organs' },
  { id: 'v2', text: 'sample vessel two', layer: 'vessels' },
  { id: 'b1', text: 'sample bone one', layer: 'skeleton' },
];

describe('layers', () => {
  it('are skin to bone, outside in', () => {
    expect(LAYERS).toEqual(['skin', 'muscle', 'nerves', 'vessels', 'organs', 'skeleton']);
    expect(isLayer('organs')).toBe(true);
    expect(isLayer('bones')).toBe(false);
  });

  it('come from the data: only layers with structures, and the missing ones named', () => {
    expect(layersOf(structures)).toEqual([
      { id: 'vessels', ids: ['v1', 'v2'] },
      { id: 'organs', ids: ['o1'] },
      { id: 'skeleton', ids: ['b1'] },
    ]);
    expect(layersOf(structures, new Set(['v1', 'b1'])).map((l) => l.id)).toEqual(['vessels', 'skeleton']);
    expect(missingLayers(structures)).toEqual(['skin', 'muscle', 'nerves']);
    expect(missingLayers([{ id: 'x', text: 'no layer' }])).toEqual([]);
  });

  it('toggle as a whole', () => {
    const [vessels] = layersOf(structures);
    const hidden = toggleLayer(new Set(), vessels!);
    expect([...hidden].sort()).toEqual(['v1', 'v2']);
    expect(layerShown(vessels!, hidden)).toBe(false);
    // A layer with one structure still showing counts as shown; the button hides the rest.
    expect([...toggleLayer(new Set(['v1']), vessels!)].sort()).toEqual(['v1', 'v2']);
    expect([...toggleLayer(hidden, vessels!)]).toEqual([]);
  });

  it('peel from the outside in, never emptying the view, and put back from the inside out', () => {
    const layers = layersOf(structures);
    let hidden: Set<string> = new Set();
    expect(nextToPeel(layers, hidden)?.id).toBe('vessels');
    hidden = peel(layers, hidden);
    expect(nextToPeel(layers, hidden)?.id).toBe('organs');
    hidden = peel(layers, hidden);
    expect([...hidden].sort()).toEqual(['o1', 'v1', 'v2']);
    expect(nextToPeel(layers, hidden)).toBeNull(); // only the skeleton is left
    expect(peel(layers, hidden)).toEqual(hidden);
    expect(nextToRestore(layers, hidden)?.id).toBe('organs');
    hidden = restore(layers, hidden);
    expect([...hidden].sort()).toEqual(['v1', 'v2']);
    hidden = restore(layers, hidden);
    expect(hidden.size).toBe(0);
    expect(nextToRestore(layers, hidden)).toBeNull();
  });
});

describe('the whole-body view', () => {
  const system = (key: string, ids: string[], status: AnatomySystem['status'] = 'draft'): AnatomySystem => ({
    key,
    title: `sample ${key}`,
    status,
    model: { file: `/models/anatomy/${key}.glb`, release: 'sample release' },
    structures: ids.map((id) => ({ id, text: `sample ${id}`, layer: 'organs' })),
  });

  it('loads every system together, each structure once, as a draft when any part is', () => {
    const body = wholeBody([system('a', ['x', 'y']), system('b', ['y', 'z'], 'approved')])!;
    expect(body.key).toBe(WHOLE_BODY_KEY);
    expect(body.title).toBe('whole body');
    expect(body.status).toBe('draft');
    expect(body.model.files).toEqual(['/models/anatomy/a.glb', '/models/anatomy/b.glb']);
    expect(body.structures.map((s) => s.id)).toEqual(['x', 'y', 'z']);
    // Needed for lazy 3D loads: a shared layer may span files, but each file contains only its own IDs.
    expect(body.model.fileIds).toEqual({
      '/models/anatomy/a.glb': ['x', 'y'],
      '/models/anatomy/b.glb': ['y', 'z'],
    });
  });

  it('shares a physical GLB across layers while preserving exact ID ownership', () => {
    const shared = '/models/anatomy/shared.glb';
    const a: AnatomySystem = {
      ...system('a', ['a']),
      model: { file: shared, release: 'sample release' },
      structures: [{ id: 'a', text: 'sample a', layer: 'vessels' }],
    };
    const b: AnatomySystem = {
      ...system('b', ['b']),
      model: { file: shared, release: 'sample release' },
      structures: [{ id: 'b', text: 'sample b', layer: 'organs' }],
    };
    const body = wholeBody([a, b, system('c', ['c'])])!;
    expect(body.model.files).toEqual([shared, '/models/anatomy/c.glb']);
    expect(body.structures.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(body.model.fileIds?.[shared]).toEqual(['a', 'b']);
    expect(body.model.layerFiles?.['vessels']).toEqual([shared]);
    expect(body.model.layerFiles?.['organs']).toEqual([shared, '/models/anatomy/c.glb']);
    const byId = (id: string, found: ReadonlySet<string>, ready: ReadonlySet<string>) =>
      structureLoadNote(body.structures.find((part) => part.id === id)!, found, true,
        (layerId) => body.model.layerFiles?.[layerId] ?? [], body.model.files ?? [],
        (url) => ready.has(url), body.model.fileIds);
    expect(byId('b', new Set(), new Set())).toBe('not loaded yet');
    expect(byId('b', new Set(), new Set([shared]))).toBe('not in this model');
    expect(byId('b', new Set(['b']), new Set([shared]))).toBeNull();
    expect(byId('c', new Set(), new Set([shared]))).toBe('not loaded yet');
  });

  it('does not blame the source model for layers excluded from an approved-only build', () => {
    // Production keeps only approved systems. Other layers can still exist in
    // the source release as drafts but are not published to this lab.
    const approvedVessels: AnatomySystem = {
      ...system('vessels', ['v1'], 'approved'),
      structures: [{ id: 'v1', text: 'sample vessel', layer: 'vessels' }],
    };
    const approvedOrgans = system('organs', ['o1'], 'approved');
    const publishedBody = wholeBody([approvedVessels, approvedOrgans])!;
    const publishedNote = unavailableLayersNote(publishedBody.structures);
    expect(publishedNote).toBe(
      '3D layers not available in this version of the lab: skin, muscle, nerves, skeleton.',
    );
    expect(publishedNote).not.toMatch(/bodyparts3d|source|release|has none/i);

    // The same source release can have a draft skin system. On a preview with
    // that system included, skin must no longer be listed as unavailable.
    const draftSkin: AnatomySystem = {
      ...system('skin', ['s1']),
      structures: [{ id: 's1', text: 'sample skin', layer: 'skin' }],
    };
    const previewBody = wholeBody([approvedVessels, approvedOrgans, draftSkin])!;
    expect(unavailableLayersNote(previewBody.structures)).toBe(
      '3D layers not available in this version of the lab: muscle, nerves, skeleton.',
    );
    expect(previewBody.status).toBe('draft');
    expect(publishedBody.status).toBe('approved');
  });

  it('omits the unavailable-layer note when every layer is present or labels have no layer', () => {
    expect(unavailableLayersNote(
      LAYERS.map((layer) => ({ id: layer, text: `sample ${layer}`, layer })),
    )).toBeNull();
    expect(unavailableLayersNote([{ id: 'x', text: 'unlayered sample' }])).toBeNull();
    expect(unavailableLayersNote([])).toBeNull();
  });

  it('needs two systems of one release, and leaves the test fixture out', () => {
    expect(wholeBody([system('a', ['x'])])).toBeNull();
    const other = { ...system('b', ['z']), model: { file: '/models/anatomy/b.glb', release: 'other release' } };
    expect(wholeBody([system('a', ['x']), other])).toBeNull();
    expect(wholeBody([system('a', ['x']), { ...system('f', ['q']), fixture: true }])).toBeNull();
  });
});

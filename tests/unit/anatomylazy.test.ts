import { describe, expect, it } from 'vitest';
import type { AnatomyStructure, AnatomySystem } from '../../src/islands/anatomylab';
import { LAYERS, wholeBody, layersOf, layerShown, type Layer } from '../../src/islands/anatomylayers';
import { onlyThis } from '../../src/islands/anatomylab';
import { PartialLoadError, revealTargetPlan, showAllPlan, createGeneration, loadModelsOrDispose, createOnDemandLoader, visibilityAfterLayerDownload, filesForLayer, firstLayer, idsForFiles, initialLayerPlan, layerNeedsReveal, lazyPeel, lazyRestore, structureLoadNote } from '../../src/islands/anatomylazy';

const layers: Layer[] = [
  { id: 'skin', ids: ['s1'] },
  { id: 'muscle', ids: ['m1', 'm2'] },
  { id: 'skeleton', ids: ['b1'] },
];

describe('initial multi-file model cleanup', () => {
  it('preserves file order on success even when requests finish out of order', async () => {
    let finishFirst!: (value: string) => void;
    const disposed: string[] = [];
    const loading = loadModelsOrDispose(
      [
        () => new Promise<string>((resolve) => { finishFirst = resolve; }),
        () => Promise.resolve('second'),
      ],
      (value) => disposed.push(value),
    );
    finishFirst('first');
    await expect(loading).resolves.toEqual(['first', 'second']);
    expect(disposed).toEqual([]);
  });

  it('releases decoded models that succeeded when another file fails', async () => {
    const disposed: string[] = [];
    const failure = new Error('one GLB request failed');
    const loading = loadModelsOrDispose(
      [
        () => Promise.resolve('first'),
        () => Promise.resolve('second'),
        () => Promise.reject(failure),
      ],
      (value) => disposed.push(value),
    );
    await expect(loading).rejects.toBe(failure);
    expect(disposed.sort()).toEqual(['first', 'second']);
  });

  it('releases models arriving after an earlier failure, without blocking the error or retry', async () => {
    let finishLate!: (value: string) => void;
    const disposed: string[] = [];
    const failure = new Error('model unavailable');
    const loading = loadModelsOrDispose(
      [
        () => Promise.reject(failure),
        () => new Promise<string>((resolve) => { finishLate = resolve; }),
      ],
      (value) => disposed.push(value),
    );
    // Do not wait for the other network request before reporting the error.
    await expect(loading).rejects.toBe(failure);
    expect(disposed).toEqual([]);
    finishLate('late');
    // Allow the late request's continuation to release the decoded result.
    await Promise.resolve();
    await Promise.resolve();
    expect(disposed).toEqual(['late']);

    // A separate retry should load fresh models normally.
    await expect(loadModelsOrDispose(
      [() => Promise.resolve('retry')],
      (value) => disposed.push(value),
    )).resolves.toEqual(['retry']);
    expect(disposed).toEqual(['late']);
  });
});

describe('partial failures and show all', () => {
  it('hands over the files that loaded when another file of the layer fails, and retries only the failed one', async () => {
    let failB = true;
    const calls: string[] = [];
    const loader = createOnDemandLoader<string>(async (url) => {
      calls.push(url);
      if (url === 'b' && failB) throw new Error('b failed');
      return url;
    });
    const err = await loader.ensure(['a', 'b']).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartialLoadError);
    expect((err as PartialLoadError<string>).results).toEqual(['a']);
    expect(loader.isLoaded('a')).toBe(true);
    failB = false;
    expect(await loader.ensure(['a', 'b'])).toEqual(['b']);
    expect(calls).toEqual(['a', 'b', 'b']);
  });

  it('show all unhides loaded layers at once and fetches the layers whose files are missing', () => {
    const files: Record<string, string[]> = { skin: ['s'], muscle: ['m'], skeleton: ['k'] };
    const hidden = new Set(['m1', 'm2', 'b1', 'extra']);
    const plan = showAllPlan(layers, hidden, (id) => files[id]!, (url) => url === 's' || url === 'm');
    expect(plan.unhide.sort()).toEqual(['extra', 'm1', 'm2']);
    expect(plan.fetch.map((l) => l.id)).toEqual(['skeleton']);
  });
});

describe('show only this in the lazy view', () => {
  it('keeps structures of unloaded layers hidden, so their layers are still fetched by show all', () => {
    const hidden = onlyThis(['s1', 'm1', 'm2', 'b1'], 's1');
    expect(layerShown(layers[1]!, hidden)).toBe(false);
    const files: Record<string, string[]> = { skin: ['s'], muscle: ['m'], skeleton: ['k'] };
    const plan = showAllPlan(layers, hidden, (id) => files[id]!, (url) => url === 's');
    expect(plan.fetch.map((l) => l.id)).toEqual(['muscle', 'skeleton']);
  });
});

describe('first whole-body files shared across layers', () => {
  it('maps deeper structures in the initial files, keeps them hidden and reuses already downloaded files', async () => {
    // Synthetic structures, not clinical content. The mixed file belongs to both vessels and organs.
    const system = (key: string, structures: AnatomyStructure[]): AnatomySystem => ({
      key,
      title: `sample ${key}`,
      status: 'draft',
      model: { file: `/models/anatomy/${key}.glb`, release: 'test' },
      structures,
    });
    const body = wholeBody([
      system('mixed', [
        { id: 'v1', text: 'sample outer one', layer: 'vessels' },
        { id: 'o1', text: 'sample inner one', layer: 'organs' },
      ]),
      system('outer', [{ id: 'v2', text: 'sample outer two', layer: 'vessels' }]),
      system('inner', [{ id: 'o2', text: 'sample inner two', layer: 'organs' }]),
    ])!;
    const layers = layersOf(body.structures);
    const initial = initialLayerPlan(body, layers)!;

    expect(initial.files).toEqual(['/models/anatomy/mixed.glb', '/models/anatomy/outer.glb']);
    // Scene.load must map o1 even though its organ layer is initially hidden.
    // IDs keep source-file order, not layer order. Each needed mesh is mapped once.
    expect(initial.ids).toEqual(['v1', 'o1', 'v2']);
    expect([...initial.hidden].sort()).toEqual(['o1', 'o2']);
    expect(initial.ids).not.toContain('o2'); // Its file has not been fetched.
    expect(idsForFiles(body, layers, ['/models/anatomy/mixed.glb'])).toEqual(['v1', 'o1']);

    const downloaded: string[] = [];
    const loader = createOnDemandLoader(async (url) => {
      downloaded.push(url);
      return url;
    });
    for (const url of initial.files) loader.markLoaded(url);
    expect(await loader.ensure(filesForLayer(body, 'organs'))).toEqual(['/models/anatomy/inner.glb']);
    expect(downloaded).toEqual(['/models/anatomy/inner.glb']);
    expect(idsForFiles(body, layers, downloaded)).toEqual(['o2']);
  });

  it('falls back to an eager load if the first layer has no model files', () => {
    const body: AnatomySystem = {
      key: 'sample',
      title: 'sample',
      status: 'draft',
      model: { file: '/models/anatomy/sample.glb', release: 'test' },
      structures: [{ id: 'a', text: 'sample part', layer: 'vessels' }],
    };
    expect(initialLayerPlan(body, layersOf(body.structures))).toBeNull();
  });
});

describe('on-demand structure status', () => {
  const files: Record<string, string[]> = { organs: ['heart.glb', 'lungs.glb'], vessels: ['heart.glb', 'vessels.glb'] };
  const allFiles = ['skin.glb', 'heart.glb', 'vessels.glb', 'lungs.glb'];
  const loaded = new Set(['skin.glb', 'heart.glb', 'vessels.glb']);
  const filesOf = (id: string) => files[id] ?? [];
  const isLoaded = (url: string) => loaded.has(url);

  it('says not loaded yet for an absent-looking structure whose file has not been fetched', () => {
    expect(structureLoadNote({ id: 'part-b', layer: 'organs' }, new Set(), true, filesOf, allFiles, isLoaded)).toBe('not loaded yet');
    // A file may be shared between multiple layers; one loaded structure
    // must already be shown instead of marked missing or waiting.
    expect(structureLoadNote({ id: 'part-a', layer: 'organs' }, new Set(['part-a']), true, filesOf, allFiles, isLoaded)).toBeNull();
  });

  it('reserves not in this model for files whose download finished but mesh is absent', () => {
    expect(structureLoadNote({ id: 'missing', layer: 'organs' }, new Set(), true, filesOf, allFiles, () => true)).toBe('not in this model');
    expect(structureLoadNote({ id: 'missing', layer: 'organs' }, new Set(), false, filesOf, allFiles, isLoaded)).toBe('not in this model');
  });

  it('treats an unlayered structure as pending while whole-body files remain unfetched', () => {
    expect(structureLoadNote({ id: 'unlayered' }, new Set(), true, filesOf, allFiles, isLoaded)).toBe('not loaded yet');
  });
});

describe('partially loaded layer button', () => {
  it('fetches missing organ files before toggling a layer whose heart is already visible', async () => {
    const organs: Layer = { id: 'organs', ids: ['heart', 'lung', 'kidney', 'digestive'] };
    const files = ['heart.glb', 'lungs.glb', 'kidneys.glb', 'digestive.glb'];
    const fetched: string[] = [];
    const loader = createOnDemandLoader(async (url) => {
      fetched.push(url);
      return url;
    });
    for (const url of ['skin.glb', 'heart.glb', 'vessels.glb']) loader.markLoaded(url);
    const partlyHidden = new Set(['lung', 'kidney', 'digestive']);

    // Vessels requested heart.glb, so the heart is already shown. The organs
    // button must download the remaining files instead of hiding that heart.
    expect(layerShown(organs, partlyHidden)).toBe(true);
    expect(layerNeedsReveal(organs, partlyHidden, files, loader.isLoaded)).toBe(true);
    expect(await loader.ensure(files)).toEqual(['lungs.glb', 'kidneys.glb', 'digestive.glb']);
    expect(fetched).toEqual(['lungs.glb', 'kidneys.glb', 'digestive.glb']);

    // Only after the entire layer is loaded does its button become a hide toggle.
    expect(layerNeedsReveal(organs, new Set(), files, loader.isLoaded)).toBe(false);
    // A hidden but cached layer is shown from memory, without another request.
    expect(layerNeedsReveal(organs, new Set(organs.ids), files, loader.isLoaded)).toBe(true);
    expect(await loader.ensure(files)).toEqual([]);
    expect(fetched).toHaveLength(3);
  });

  it('does not treat a partially failed layer as complete', () => {
    const organs: Layer = { id: 'organs', ids: ['heart', 'lung'] };
    expect(layerNeedsReveal(organs, new Set(), ['heart.glb', 'lungs.glb'], (url) => url === 'heart.glb')).toBe(true);
    expect(layerNeedsReveal(organs, new Set(), [], () => false)).toBe(false);
  });
});

describe('show all with a mixed-layer model file', () => {
  it('still fetches the organs layer when only the heart (in the vessels file) is loaded and shown', () => {
    const mixed: Layer[] = [
      { id: 'skin', ids: ['s1'] },
      { id: 'vessels', ids: ['v1'] },
      { id: 'organs', ids: ['heart', 'lung', 'kidney'] },
    ];
    const files: Record<string, string[]> = { skin: ['skin'], vessels: ['vessels', 'heart'], organs: ['heart', 'lungs', 'kidneys'] };
    const loaded = new Set(['skin', 'vessels', 'heart']);
    const hidden = new Set(['lung', 'kidney']); // the heart was shown from the list
    const plan = showAllPlan(mixed, hidden, (id) => files[id]!, (url) => loaded.has(url));
    expect(plan.fetch.map((l) => l.id)).toEqual(['organs']);
    expect(plan.unhide).not.toContain('lung');
  });
});

describe('show me in the quiz', () => {
  const files: Record<string, string[]> = { skin: ['s'], muscle: ['m'], skeleton: ['k'] };
  const filesOf = (id: string) => files[id]!;
  it('unhides a hidden target, and its whole layer when the layer was peeled away', () => {
    const plan = revealTargetPlan(layers, new Set(['m1', 'm2']), 'm1', filesOf, () => true, new Set());
    expect(plan).toEqual({ unhide: ['m1', 'm1', 'm2'], fetch: null });
    const single = revealTargetPlan(layers, new Set(['m1']), 'm1', filesOf, () => true, new Set());
    expect(single.unhide).toEqual(['m1']);
  });
  it('fetches the target\'s layer first when its files are not loaded', () => {
    const plan = revealTargetPlan(layers, new Set(['b1']), 'b1', filesOf, (url) => url === 's', new Set());
    expect(plan.fetch?.id).toBe('skeleton');
    expect(plan.unhide).toEqual([]);
  });
});

describe('show me with a loaded target in a partially downloaded layer', () => {
  it('shows the loaded answer without requesting unrelated or failing files', async () => {
    const organLayer: Layer = { id: 'organs', ids: ['fixture-a', 'fixture-b'] };
    const files = ['shared.glb', 'unrelated.glb'];
    const fetched: string[] = [];
    const loader = createOnDemandLoader(async (url) => {
      fetched.push(url);
      if (url === 'unrelated.glb') throw new Error('offline');
      return url;
    });
    loader.markLoaded('shared.glb');
    // The first structure is already in the scene but is hidden while the
    // quiz is active. The other GLB cannot be downloaded.
    const plan = revealTargetPlan(
      [organLayer],
      new Set(['fixture-a', 'fixture-b']),
      'fixture-a',
      () => files,
      loader.isLoaded,
      new Set(['fixture-a']),
    );
    expect(plan).toEqual({ unhide: ['fixture-a'], fetch: null });
    const stillHidden = new Set(['fixture-a', 'fixture-b']);
    for (const id of plan.unhide) stillHidden.delete(id);
    expect(stillHidden).toEqual(new Set(['fixture-b']));
    expect(fetched).toEqual([]);
  });

  it('still fetches a layer for a target whose mesh has not arrived', () => {
    const organLayer: Layer = { id: 'organs', ids: ['fixture-a'] };
    const plan = revealTargetPlan(
      [organLayer], new Set(['fixture-a']), 'fixture-a',
      () => ['missing.glb'], () => false, new Set(),
    );
    expect(plan).toEqual({ unhide: [], fetch: organLayer });
  });
});

describe('system generation', () => {
  it('a token taken before a system change is no longer current', () => {
    const gen = createGeneration();
    const mine = gen.token();
    expect(gen.isCurrent(mine)).toBe(true);
    gen.bump();
    expect(gen.isCurrent(mine)).toBe(false);
    expect(gen.isCurrent(gen.token())).toBe(true);
  });
});

describe('a delayed layer must not undo newer visibility choices', () => {
  it('keeps successful downloads but preserves show-only when an older reveal finishes later', async () => {
    const intents = createGeneration();
    const older = intents.token();
    let finish!: (value: string) => void;
    const loader = createOnDemandLoader<string>(() => new Promise((resolve) => { finish = resolve; }));
    const pending = loader.ensure(['organs.glb']);

    // A later click replaces the prior "show all" with "show only skin".
    intents.bump();
    const onlySkin = new Set(['heart', 'lung', 'bone']);
    finish('organs.glb');
    expect(await pending).toEqual(['organs.glb']);
    expect(loader.isLoaded('organs.glb')).toBe(true);
    const result = visibilityAfterLayerDownload(onlySkin, ['heart', 'lung'], [], intents.isCurrent(older));
    expect(result).toBe(onlySkin);
    expect([...result]).toEqual(['heart', 'lung', 'bone']);
  });

  it('applies the newest request, including the hide-after side of a peel', () => {
    const hidden = new Set(['organ']);
    const changed = visibilityAfterLayerDownload(hidden, ['organ'], ['skin'], true);
    expect(changed).toEqual(new Set(['skin']));
    expect(hidden).toEqual(new Set(['organ']));
  });

  it('does not unhide or hide anything for a superseded peel', () => {
    const newer = new Set(['organ']);
    expect(visibilityAfterLayerDownload(newer, ['organ'], ['skin'], false)).toBe(newer);
  });
});

describe('on-demand loader', () => {
  it('fetches each file once, even when asked twice at the same time', async () => {
    const calls: string[] = [];
    const loader = createOnDemandLoader(async (url) => {
      calls.push(url);
      return url;
    });
    const [a, b] = await Promise.all([loader.ensure(['a', 'b']), loader.ensure(['b', 'c'])]);
    expect(calls.sort()).toEqual(['a', 'b', 'c']);
    expect([...a, ...b].sort()).toEqual(['a', 'b', 'c']);
    expect(loader.loadedCount()).toBe(3);
  });

  it('ignores a file that arrives after the loader is retired, and fetches nothing more', async () => {
    let release!: (v: string) => void;
    const calls: string[] = [];
    const loader = createOnDemandLoader<string>((url) => {
      calls.push(url);
      return new Promise<string>((resolve) => (release = resolve));
    });
    const pending = loader.ensure(['late']);
    loader.retire();
    release('late');
    expect(await pending).toEqual([]);
    expect(loader.isRetired()).toBe(true);
    expect(loader.isLoaded('late')).toBe(false);
    loader.markLoaded('x');
    expect(loader.loadedCount()).toBe(0);
    expect(await loader.ensure(['other'])).toEqual([]);
    expect(calls).toEqual(['late']);
  });

  it('a failure after retiring is swallowed, not shown for the new system', async () => {
    let fail!: (e: Error) => void;
    const loader = createOnDemandLoader<string>(() => new Promise<string>((_, reject) => (fail = reject)));
    const pending = loader.ensure(['late']);
    loader.retire();
    fail(new Error('old system layer failed'));
    expect(await pending).toEqual([]);
  });

  it('keeps loaded files: asking again fetches nothing', async () => {
    let n = 0;
    const loader = createOnDemandLoader(async () => ++n);
    await loader.ensure(['a']);
    expect(await loader.ensure(['a'])).toEqual([]);
    expect(n).toBe(1);
  });

  it('does not fetch a file marked as already loaded', async () => {
    const calls: string[] = [];
    const loader = createOnDemandLoader(async (url) => void calls.push(url));
    loader.markLoaded('skin');
    await loader.ensure(['skin', 'muscle']);
    expect(calls).toEqual(['muscle']);
    expect(loader.isLoaded('skin')).toBe(true);
  });

  it('forgets a failure, so retrying fetches again', async () => {
    let fail = true;
    let calls = 0;
    const loader = createOnDemandLoader(async (url) => {
      calls++;
      if (fail) throw new Error('network down');
      return url;
    });
    await expect(loader.ensure(['a'])).rejects.toThrow('network down');
    expect(loader.isLoaded('a')).toBe(false);
    fail = false;
    expect(await loader.ensure(['a'])).toEqual(['a']);
    expect(calls).toBe(2);
  });
});

describe('lazy peeling', () => {
  it('starts with the outermost layer', () => {
    expect(firstLayer(layers)?.id).toBe('skin');
    expect(firstLayer([])).toBeNull();
  });

  it('peels to the layer just under the outermost shown one, and never empties the view', () => {
    const start = new Set(['m1', 'm2', 'b1']);
    expect(lazyPeel(layers, start)).toEqual({ show: layers[1], hide: layers[0] });
    const second = new Set(['s1', 'b1']);
    expect(lazyPeel(layers, second)).toEqual({ show: layers[2], hide: layers[1] });
    expect(lazyPeel(layers, new Set(['s1', 'm1', 'm2']))).toBeNull();
  });

  it('puts back the layer just outside the outermost shown one', () => {
    expect(lazyRestore(layers, new Set(['s1', 'b1']))).toEqual(layers[0]);
    expect(lazyRestore(layers, new Set(['m1', 'm2', 'b1']))).toBeNull();
  });
});

describe('layer files', () => {
  it('whole body records which model files each layer needs', () => {
    const mk = (key: string, layer: string, ids: string[]) => ({
      key,
      title: key,
      status: 'approved' as const,
      model: { file: `/${key}.glb`, release: '4.0' },
      structures: ids.map((id) => ({ id, text: id, layer }) as AnatomyStructure),
    });
    const body = wholeBody([mk('skin', 'skin', ['a']), mk('heart', 'organs', ['b']), mk('lungs', 'organs', ['c'])])!;
    expect(filesForLayer(body, 'skin')).toEqual(['/skin.glb']);
    expect(filesForLayer(body, 'organs')).toEqual(['/heart.glb', '/lungs.glb']);
    expect(filesForLayer(body, 'bone')).toEqual([]);
    expect(LAYERS).toContain('skin');
  });
});

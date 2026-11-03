import { describe, expect, it } from 'vitest';
import type { AnatomyStructure } from '../../src/islands/anatomylab';
import { LAYERS, wholeBody, type Layer } from '../../src/islands/anatomylayers';
import { createGeneration, createOnDemandLoader, filesForLayer, firstLayer, lazyPeel, lazyRestore } from '../../src/islands/anatomylazy';

const layers: Layer[] = [
  { id: 'skin', ids: ['s1'] },
  { id: 'muscle', ids: ['m1', 'm2'] },
  { id: 'skeleton', ids: ['b1'] },
];

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

import { describe, expect, it } from 'vitest';
import { createOnDemandLoader, MAX_CONCURRENT_ANATOMY_MODELS, PartialLoadError } from '../../src/islands/anatomylazy';

/** Allow the completed fetch's promise callbacks to release the next queued download. */
async function flushQueue() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('anatomy on-demand download limit', () => {
  it('bounds concurrent model work across overlapping layer requests, without double fetching a URL', async () => {
    expect(MAX_CONCURRENT_ANATOMY_MODELS).toBe(2);
    const started: string[] = [];
    const complete = new Map<string, () => void>();
    let active = 0;
    let peak = 0;
    const loader = createOnDemandLoader<string>((url) => {
      started.push(url);
      active++;
      peak = Math.max(peak, active);
      return new Promise<string>((resolve) => complete.set(url, () => {
        active--;
        resolve(url);
      }));
    });

    // "Show all" can call ensure() independently for each layer, including a shared model URL.
    const firstLayer = loader.ensure(['a', 'b', 'c']);
    const secondLayer = loader.ensure(['d', 'e', 'f', 'a']);
    expect(started).toEqual(['a', 'b']);

    complete.get('a')!();
    await flushQueue();
    expect(started).toEqual(['a', 'b', 'c']);

    complete.get('b')!();
    await flushQueue();
    expect(started).toEqual(['a', 'b', 'c', 'd']);

    complete.get('c')!();
    await flushQueue();
    expect(started).toEqual(['a', 'b', 'c', 'd', 'e']);

    complete.get('d')!();
    await flushQueue();
    expect(started).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

    complete.get('e')!();
    complete.get('f')!();
    expect([...(await firstLayer), ...(await secondLayer)].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(peak).toBe(2);
    expect(loader.loadedCount()).toBe(6);
  });

  it('skips a queued model that was loaded elsewhere and keeps draining later work', async () => {
    const started: string[] = [];
    const complete = new Map<string, (value: string) => void>();
    const loader = createOnDemandLoader<string>((url) => {
      started.push(url);
      return new Promise<string>((resolve) => complete.set(url, resolve));
    });

    const first = loader.ensure(['a', 'b']);
    const second = loader.ensure(['c', 'd']);
    expect(started).toEqual(['a', 'b']);

    // A separate completed load makes c available while both slots are occupied.
    loader.markLoaded('c');
    complete.get('a')!('a');
    await flushQueue();
    expect(started).toEqual(['a', 'b', 'd']);
    complete.get('b')!('b');
    complete.get('d')!('d');

    expect(await first).toEqual(['a', 'b']);
    expect(await second).toEqual(['d']);
    expect(loader.isLoaded('c')).toBe(true);
    expect(loader.loadedCount()).toBe(4);
    expect(await loader.ensure(['c'])).toEqual([]);
  });

  it('drops waiting downloads after a system change and does not hang callers', async () => {
    const started: string[] = [];
    const complete = new Map<string, (value: string) => void>();
    const loader = createOnDemandLoader<string>((url) => {
      started.push(url);
      return new Promise<string>((resolve) => complete.set(url, resolve));
    });
    const pending = loader.ensure(['a', 'b', 'c', 'd']);
    expect(started).toEqual(['a', 'b']);
    loader.retire();
    complete.get('a')!('a');
    complete.get('b')!('b');
    expect(await pending).toEqual([]);
    expect(started).toEqual(['a', 'b']);
    expect(loader.loadedCount()).toBe(0);
    expect(await loader.ensure(['new'])).toEqual([]);
  });

  it('keeps successful queued downloads after a partial failure and retries only the failed file', async () => {
    const started: string[] = [];
    let fail = true;
    const loader = createOnDemandLoader(async (url: string) => {
      started.push(url);
      if (url === 'b' && fail) throw new Error('network unavailable');
      return url;
    });
    const error = await loader.ensure(['a', 'b', 'c']).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(PartialLoadError);
    expect((error as PartialLoadError<string>).results).toEqual(['a', 'c']);
    expect(loader.loadedCount()).toBe(2);

    fail = false;
    expect(await loader.ensure(['a', 'b', 'c'])).toEqual(['b']);
    expect(started).toEqual(['a', 'b', 'c', 'b']);
  });

  it('recovers when the fetch function throws before returning a Promise', async () => {
    let attempt = 0;
    const loader = createOnDemandLoader<string>((url) => {
      if (++attempt === 1) throw new Error('decoder unavailable');
      return Promise.resolve(url);
    });
    await expect(loader.ensure(['model'])).rejects.toThrow('decoder unavailable');
    expect(await loader.ensure(['model'])).toEqual(['model']);
    expect(attempt).toBe(2);
  });
});

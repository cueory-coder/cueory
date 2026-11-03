/**
 * Load-on-demand for the anatomy lab's whole-body view (Task 178): the first view fetches only the outermost layer's
 * model files, and each deeper layer's files are fetched when the student peels to it or turns it on. Fetched files
 * stay in memory (the scene keeps them), a file in flight is never requested twice, and a failed file can be retried.
 * Pure logic, unit tested in tests/unit/anatomylazy.test.ts.
 */
import { layerShown, type Layer } from './anatomylayers';
import type { AnatomySystem } from './anatomylab';

export interface OnDemandLoader<R> {
  /** Fetches the files not yet loaded (once each) and resolves with the results of the ones fetched now. */
  ensure(urls: readonly string[]): Promise<R[]>;
  /** Records a file loaded some other way (the first view), so it is not fetched again. */
  markLoaded(url: string): void;
  isLoaded(url: string): boolean;
  loadedCount(): number;
  /** Retires the loader: files still in flight are ignored when they arrive, and later asks fetch nothing. */
  retire(): void;
  /** True once retired: callers check this before any state change or announcement after an await. */
  isRetired(): boolean;
}

/** A counter for work that must be dropped when the system changes: take a token, then ask if it is still current. */
export function createGeneration() {
  let n = 0;
  return {
    bump: () => ++n,
    token: () => n,
    isCurrent: (token: number) => token === n,
  };
}

export function createOnDemandLoader<R>(fetchOne: (url: string) => Promise<R>): OnDemandLoader<R> {
  const done = new Set<string>();
  const inFlight = new Map<string, Promise<R | null>>();
  let retired = false;
  function one(url: string): Promise<R | null> {
    if (retired || done.has(url)) return Promise.resolve(null);
    const running = inFlight.get(url);
    if (running) return running.then(() => null);
    const promise = fetchOne(url).then(
      (result) => {
        if (retired) return null;
        done.add(url);
        inFlight.delete(url);
        return result;
      },
      (err: unknown) => {
        // A failure is forgotten, so asking again tries again.
        inFlight.delete(url);
        if (retired) return null;
        throw err;
      },
    );
    inFlight.set(url, promise);
    return promise;
  }
  return {
    async ensure(urls) {
      const results = await Promise.all([...new Set(urls)].map(one));
      return results.filter((r): r is Awaited<R> => r !== null) as R[];
    },
    markLoaded: (url) => {
      if (!retired) done.add(url);
    },
    isLoaded: (url) => done.has(url),
    loadedCount: () => done.size,
    isRetired: () => retired,
    retire() {
      retired = true;
      done.clear();
      inFlight.clear();
    },
  };
}

/** The model files a layer needs; empty when the system has no per-layer map (then everything loads up front). */
export function filesForLayer(system: Pick<AnatomySystem, 'model'>, layerId: string): string[] {
  return system.model.layerFiles?.[layerId] ?? [];
}

/** The outermost layer, which is all the whole-body view fetches at first. */
export function firstLayer(layers: readonly Layer[]): Layer | null {
  return layers[0] ?? null;
}

/**
 * Peel in the lazy view: show the layer just under the outermost shown one (it may need fetching), then hide the
 * outermost. Null when nothing is deeper. The view is never empty, because the deeper layer is shown first.
 */
export function lazyPeel(layers: readonly Layer[], hidden: ReadonlySet<string>): { show: Layer; hide: Layer } | null {
  const at = layers.findIndex((layer) => layerShown(layer, hidden));
  const next = at >= 0 ? layers[at + 1] : undefined;
  return next ? { show: next, hide: layers[at]! } : null;
}

/** Put back: the layer just outside the outermost shown one, if it was peeled away. */
export function lazyRestore(layers: readonly Layer[], hidden: ReadonlySet<string>): Layer | null {
  const at = layers.findIndex((layer) => layerShown(layer, hidden));
  const prev = at > 0 ? layers[at - 1] : undefined;
  return prev ?? null;
}

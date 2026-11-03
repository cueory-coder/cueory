/**
 * Load-on-demand for the anatomy lab's whole-body view (Task 178): the first view fetches only the outermost layer's
 * model files, and each deeper layer's files are fetched when the student peels to it or turns it on. Fetched files
 * stay in memory (the scene keeps them), a file in flight is never requested twice, and a failed file can be retried.
 * Pure logic, unit tested in tests/unit/anatomylazy.test.ts.
 */
import { layerShown, type Layer } from './anatomylayers';
import type { AnatomyStructure, AnatomySystem } from './anatomylab';

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

/** 
 * A model may finish downloading after the student chose a newer visibility state.
 * Always keep its geometry, but never let an older reveal undo a later show-only or hide choice.
 */
export function visibilityAfterLayerDownload(
  hidden: ReadonlySet<string>,
  showIds: readonly string[],
  hideAfterIds: readonly string[],
  intentStillCurrent: boolean,
): ReadonlySet<string> {
  if (!intentStillCurrent) return hidden;
  const next = new Set(hidden);
  for (const id of showIds) next.delete(id);
  for (const id of hideAfterIds) next.add(id);
  return next;
}

/**
 * An initial multi-file scene is all-or-nothing. If any model request fails,
 * dispose decoded models that already arrived, including requests that finish
 * after the first failure. Unlike the on-demand loader below, these models
 * were never integrated into the visible scene and cannot be reused on retry.
 *
 * Reject as soon as a load fails, rather than waiting for every in-flight
 * request. The late requests still release their decoded resources.
 */
export async function loadModelsOrDispose<T>(
  loads: readonly (() => Promise<T>)[],
  dispose: (value: T) => void,
): Promise<T[]> {
  const completed: T[] = [];
  let failed = false;
  try {
    // Promise.all preserves input order even when model requests finish out of order.
    return await Promise.all(loads.map(async (load) => {
      const value = await load();
      if (failed) dispose(value);
      else completed.push(value);
      return value;
    }));
  } catch (error) {
    failed = true;
    for (const value of completed) dispose(value);
    throw error;
  }
}
}

/** Some of a layer's files loaded and some failed: the loaded ones are kept here so the caller can still use them. */
export class PartialLoadError<R> extends Error {
  constructor(
    readonly results: R[],
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

/** 
 * A layer button must finish downloading all of its model files before it can act as a hide toggle.
 * A shared model can make one organ visible even while its other files are still missing.
 */
export function layerNeedsReveal(
  layer: Layer,
  hidden: ReadonlySet<string>,
  files: readonly string[],
  isLoaded: (url: string) => boolean,
): boolean {
  return !layerShown(layer, hidden) || files.some((url) => !isLoaded(url));
}

/** A missing mesh can be waiting for a download, or truly absent after its model file loaded. */
export function structureLoadNote(
  structure: Pick<AnatomyStructure, 'id' | 'layer'>,
  found: ReadonlySet<string>,
  lazy: boolean,
  filesOfLayer: (layerId: string) => readonly string[],
  filesOfSystem: readonly string[],
  isLoaded: (url: string) => boolean,
): 'not loaded yet' | 'not in this model' | null {
  if (found.has(structure.id)) return null;
  if (lazy) {
    const layerFiles = structure.layer ? filesOfLayer(structure.layer) : [];
    const files = layerFiles.length ? layerFiles : filesOfSystem;
    if (files.some((url) => !isLoaded(url))) return 'not loaded yet';
  }
  return 'not in this model';
}

/**
 * "Show all" in the lazy view: the structures to unhide right away (those in layers whose files are all loaded, and any
 * in no layer) and the layers that must be fetched first, each shown only once its files are there.
 */
export function showAllPlan(
  layers: readonly Layer[],
  hidden: ReadonlySet<string>,
  filesOf: (layerId: string) => readonly string[],
  isLoaded: (url: string) => boolean,
): { unhide: string[]; fetch: Layer[] } {
  const inLayer = new Set(layers.flatMap((l) => l.ids));
  const ready = layers.filter((l) => filesOf(l.id).every(isLoaded));
  return {
    unhide: [...hidden].filter((id) => !inLayer.has(id) || ready.some((l) => l.ids.includes(id))),
    // By loaded files, not by what is visible: a file loaded for another layer (a heart in the vessels' file) can show
    // some of a layer's structures while the rest of its files are still missing.
    fetch: layers.filter((l) => !ready.includes(l)),
  };
}

/**
 * What "show me" must do so the quiz target is really on screen: unhide the target (and its whole layer, when the whole
 * layer was hidden), or fetch its layer first when the layer's model files are not loaded yet.
 */
export function revealTargetPlan(
  layers: readonly Layer[],
  hidden: ReadonlySet<string>,
  targetId: string,
  filesOf: (layerId: string) => readonly string[],
  isLoaded: (url: string) => boolean,
): { unhide: string[]; fetch: Layer | null } {
  const layer = layers.find((l) => l.ids.includes(targetId));
  if (layer && !filesOf(layer.id).every(isLoaded) && filesOf(layer.id).length > 0) return { unhide: [], fetch: layer };
  const wholeLayerHidden = layer !== undefined && layer.ids.every((id) => hidden.has(id));
  return { unhide: [targetId, ...(wholeLayerHidden ? layer.ids : [])], fetch: null };
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
      const settled = await Promise.allSettled([...new Set(urls)].map(one));
      const results = settled.flatMap((s) => (s.status === 'fulfilled' && s.value !== null ? [s.value] : []));
      const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      // Files that did load stay loaded (and in the scene), so they are handed over with the error rather than lost.
      if (failed) throw new PartialLoadError(results as R[], failed.reason);
      return results as R[];
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
 * All structure IDs represented by the requested model files, including deeper-layer IDs when a file is shared.
 * The scene needs these IDs on its FIRST load: once a file is cached it will not be added again.
 */
export function idsForFiles(system: Pick<AnatomySystem, 'model'>, layers: readonly Layer[], urls: readonly string[]): string[] {
  // A layer can span several files, so its full ID list would include meshes not downloaded yet.
  // The whole-body builder records the exact file-to-ID mapping from each original system.
  if (system.model.fileIds) return [...new Set(urls.flatMap((url) => system.model.fileIds?.[url] ?? []))];
  const wanted = new Set(urls);
  return [...new Set(layers.filter((layer) => filesForLayer(system, layer.id).some((url) => wanted.has(url))).flatMap((layer) => layer.ids))];
}

/** Start with only the outermost layer's files, but map every structure in those files before caching them. */
export function initialLayerPlan(
  system: AnatomySystem,
  layers: readonly Layer[],
): { files: string[]; ids: string[]; hidden: Set<string> } | null {
  const first = firstLayer(layers);
  if (!first) return null;
  const files = filesForLayer(system, first.id);
  if (files.length === 0) return null;
  const visible = new Set(first.ids);
  return {
    files,
    ids: idsForFiles(system, layers, files),
    hidden: new Set(system.structures.filter((structure) => !visible.has(structure.id)).map((structure) => structure.id)),
  };
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

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

/** Deduplicate model downloads at the actual scene-load boundary, preserving source order. */
export function uniqueAnatomyModelUrls(urls: string | readonly string[]): string[] {
  return [...new Set(typeof urls === 'string' ? [urls] : urls)];
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
  // Reserve the results by input index, not completion order.
  const results = new Array<T>(loads.length);
  let next = 0;
  let failed = false;
  // A damaged WebGL context may throw during cleanup. Preserve the original
  // load failure and continue releasing all completed or late-arriving scenes.
  const disposeBestEffort = (value: T): void => {
    try {
      dispose(value);
    } catch {
      // Resource disposal is best effort after a failed batch.
    }
  };
  const worker = async (): Promise<void> => {
    while (!failed && next < loads.length) {
      const index = next++;
      let value: T;
      try {
        value = await loads[index]!();
      } catch (error) {
        // Stop the queue before another worker can start another decode.
        // In-flight peers are still observed and their results disposed.
        failed = true;
        throw error;
      }
      if (failed) disposeBestEffort(value);
      else {
        results[index] = value;
        completed.push(value);
      }
    }
  };
  try {
    // The same two-file limit used by the on-demand loader protects the
    // initial whole-body batch from starting every GLB decode at once.
    await Promise.all(Array.from(
      { length: Math.min(loads.length, MAX_CONCURRENT_ANATOMY_MODELS) },
      () => worker(),
    ));
    return results;
  } catch (error) {
    failed = true;
    for (const value of completed) disposeBestEffort(value);
    throw error;
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

/**
 * A large structure catalog should not rescan every file for every name and
 * missing-count entry. Immutable per-system manifests are cached by identity.
 */
const fileOwnerIndexes = new WeakMap<
  Readonly<Record<string, readonly string[]>>,
  ReadonlyMap<string, readonly string[]>
>();

function filesOwningStructure(
  fileIds: Readonly<Record<string, readonly string[]>>,
  structureId: string,
): readonly string[] {
  let index = fileOwnerIndexes.get(fileIds);
  if (!index) {
    const owners = new Map<string, string[]>();
    for (const [url, ids] of Object.entries(fileIds)) {
      for (const id of new Set(ids)) {
        const paths = owners.get(id);
        if (paths) paths.push(url);
        else owners.set(id, [url]);
      }
    }
    index = owners;
    fileOwnerIndexes.set(fileIds, index);
  }
  return index.get(structureId) ?? [];
}

/** A missing mesh can be waiting for a download, or truly absent after its model file loaded. */
export function structureLoadNote(
  structure: Pick<AnatomyStructure, 'id' | 'layer'>,
  found: ReadonlySet<string>,
  lazy: boolean,
  filesOfLayer: (layerId: string) => readonly string[],
  filesOfSystem: readonly string[],
  isLoaded: (url: string) => boolean,
  fileIds?: Readonly<Record<string, readonly string[]>>,
): 'not loaded yet' | 'not in this model' | null {
  if (found.has(structure.id)) return null;
  if (lazy) {
    const layerFiles = structure.layer ? filesOfLayer(structure.layer) : [];
    // The whole-body manifest records exact GLB owners for each ID. An
    // unrelated pending file in the same layer is not an owner.
    const files = fileIds
      ? filesOwningStructure(fileIds, structure.id)
      : layerFiles.length ? layerFiles : filesOfSystem;
    if (files.some((url) => !isLoaded(url))) return 'not loaded yet';
  }
  return 'not in this model';
}

/**
 * Download completion can precede the React render that publishes the file's
 * mesh IDs. Suppress missing warnings during a pending layer batch.
 */
export function fileReadyForStructureStatus(isLoaded: boolean, pendingLayerBatches: number): boolean {
  return isLoaded && pendingLayerBatches === 0;
}

/**
 * One atomic publication for a completed GLB: its structure IDs and URL
 * become visible in the same React state update. This prevents a new download
 * from retracting confirmed missing statuses for unrelated owner files.
 *
 * The returned state never mutates its input (including publishedFiles).
 */
export interface PublishedAnatomyFileState {
  result: { found: string[]; missing: string[]; triangles: number };
  publishedFiles: ReadonlySet<string>;
}

export function publishAnatomyFile(
  previous: PublishedAnatomyFileState,
  url: string,
  incoming: PublishedAnatomyFileState['result'],
): PublishedAnatomyFileState {
  const found = [...new Set([...previous.result.found, ...incoming.found])];
  const foundSet = new Set(found);
  return {
    result: {
      found,
      missing: previous.result.missing.filter((id) => !foundSet.has(id)),
      triangles: previous.result.triangles + incoming.triangles,
    },
    publishedFiles: new Set([...previous.publishedFiles, url]),
  };
}

/** Count only verified missing IDs using the same owning-file rule as the list. */
export function knownMissingStructureIds(
  structures: readonly Pick<AnatomyStructure, 'id' | 'layer'>[],
  found: ReadonlySet<string>,
  filesOfLayer: (layerId: string) => readonly string[],
  filesOfSystem: readonly string[],
  isLoaded: (url: string) => boolean,
  fileIds?: Readonly<Record<string, readonly string[]>>,
): string[] {
  return structures
    .filter((structure) =>
      structureLoadNote(structure, found, true, filesOfLayer, filesOfSystem, isLoaded, fileIds) === 'not in this model',
    )
    .map((structure) => structure.id);
}

/**
 * Ask before downloading two or more unique uncached model GLBs at phone widths.
 */
export function needsBulkLayerConfirmation(narrowViewport: boolean, missingFiles: number): boolean {
  return narrowViewport && Number.isSafeInteger(missingFiles) && missingFiles >= 2;
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
 * "Show me" always reveals a quiz target that is already in the scene. A target
 * chosen from the visible quiz pool has already been fetched, even if some
 * other model files for its layer have not loaded. Do not download unrelated
 * anatomy (or wait for a failing file) just to display a known target.
 * For a target not in the scene, retain the existing on-demand layer fallback.
 */
export function revealTargetPlan(
  layers: readonly Layer[],
  hidden: ReadonlySet<string>,
  targetId: string,
  filesOf: (layerId: string) => readonly string[],
  isLoaded: (url: string) => boolean,
  found: ReadonlySet<string>,
): { unhide: string[]; fetch: Layer | null } {
  if (found.has(targetId)) return { unhide: [targetId], fetch: null };
  const layer = layers.find((l) => l.ids.includes(targetId));
  if (layer && !filesOf(layer.id).every(isLoaded) && filesOf(layer.id).length > 0) return { unhide: [], fetch: layer };
  const wholeLayerHidden = layer !== undefined && layer.ids.every((id) => hidden.has(id));
  return { unhide: [targetId, ...(wholeLayerHidden ? layer.ids : [])], fetch: null };
}

/** At most two on-demand GLBs decode at once, including requests from different layer buttons. */
export const MAX_CONCURRENT_ANATOMY_MODELS = 2;

/**
 * Emit each newly completed file once, as soon as its scene.add finishes.
 * Other callers may be awaiting slower files in the same layer; the callback
 * allows the structure catalog to use completed meshes without waiting.
 * Never invoke it for cached URLs, shared in-flight followers or retired loads.
 */
export function createOnDemandLoader<R>(
  fetchOne: (url: string) => Promise<R>,
  onFileLoaded?: (url: string, result: R) => void,
  onNotificationError?: (error: unknown) => void,
): OnDemandLoader<R> {
  const done = new Set<string>();
  const inFlight = new Map<string, Promise<R | null>>();
  // Active downloads may never settle. Retiring a system must release their
  // batch callers now, while late fetch results are still ignored safely.
  const cancelInFlight = new Map<string, () => void>();
  const waiting: Array<{ url: string; start: () => void; cancel: () => void }> = [];
  let active = 0;
  let retired = false;

  /** A shared queue bounds simultaneous model downloads across separate ensure() calls. */
  function drain() {
    while (!retired && active < MAX_CONCURRENT_ANATOMY_MODELS && waiting.length > 0) {
      const job = waiting.shift()!;
      // Another path might have marked a queued file loaded (for example, the first view).
      if (done.has(job.url)) {
        inFlight.delete(job.url);
        cancelInFlight.delete(job.url);
        job.cancel();
        continue;
      }
      active++;
      job.start();
    }
  }

  function one(url: string): Promise<R | null> {
    if (retired || done.has(url)) return Promise.resolve(null);
    const running = inFlight.get(url);
    if (running) return running.then(() => null);

    let resolve!: (value: R | null) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<R | null>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    // Register before enqueueing: overlapping layers must share the same download.
    inFlight.set(url, promise);
    cancelInFlight.set(url, () => resolve(null));
    waiting.push({
      url,
      cancel: () => resolve(null),
      start: () => {
        let fetch: Promise<R>;
        try {
          fetch = Promise.resolve(fetchOne(url));
        } catch (err) {
          fetch = Promise.reject(err);
        }
        void fetch.then(
          (result) => {
            inFlight.delete(url);
            cancelInFlight.delete(url);
            if (retired) resolve(null);
            else {
              done.add(url);
              // A successful GLB is already integrated in the scene. The
              // optional UI progress observer must never turn that success
              // into a failed download (or a cached URL that cannot retry).
              try {
                onFileLoaded?.(url, result);
              } catch (error) {
                // Keep the observer fault separate from model fetch errors.
                // Even a faulty error handler cannot invalidate this GLB.
                try {
                  onNotificationError?.(error);
                } catch {
                  // No-op: do not reject a successful model download.
                }
              }
              resolve(result);
            }
          },
          (err: unknown) => {
            // Failure is not cached, so a later layer action can retry.
            inFlight.delete(url);
            cancelInFlight.delete(url);
            if (retired) resolve(null);
            else reject(err);
          },
        ).finally(() => {
          active--;
          drain();
        });
      },
    });
    drain();
    return promise;
  }

  return {
    async ensure(urls) {
      const settled = await Promise.allSettled([...new Set(urls)].map(one));
      const results = settled.flatMap((s) => (s.status === 'fulfilled' && s.value !== null ? [s.value] : []));
      const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      // A failed file must not hide other files that successfully loaded in the same batch.
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
      // Resolve outstanding batches even if a request is stalled indefinitely.
      // The underlying fetch may still finish, but its retired result cannot
      // reach the UI and the shared queue will not launch more downloads.
      for (const cancel of cancelInFlight.values()) cancel();
      cancelInFlight.clear();
      inFlight.clear();
      for (const job of waiting.splice(0)) job.cancel();
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

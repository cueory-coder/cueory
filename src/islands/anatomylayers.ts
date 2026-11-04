/**
 * Layer peeling for the anatomy lab (Christian's request: skin, then nerves, vessels and organs, down to bone). Pure
 * logic, unit tested in tests/unit/anatomylayers.test.ts.
 *
 * Each structure's layer comes from the model's source file (`layer`, set by scripts/build-anatomy.mjs from
 * BodyParts3D's own hierarchy), never from here. The lab works with whatever layers the data has: a layer with no
 * structures gets no button, and the lab says it has no 3D models yet.
 */
import type { AnatomyStructure, AnatomySystem } from './anatomylab';

/** The layers, outside in: the order "peel" removes them. */
export const LAYERS = ['skin', 'muscle', 'nerves', 'vessels', 'organs', 'skeleton'] as const;
export type LayerId = (typeof LAYERS)[number];

export function isLayer(value: unknown): value is LayerId {
  return typeof value === 'string' && (LAYERS as readonly string[]).includes(value);
}

export interface Layer {
  id: LayerId;
  /** The structure ids in this layer, in list order. */
  ids: string[];
}

/** The layers the structures have, outside in; layers with no structure are left out. */
export function layersOf(structures: readonly AnatomyStructure[], available?: ReadonlySet<string>): Layer[] {
  return LAYERS.map((id) => ({
    id,
    ids: structures.filter((s) => s.layer === id && (!available || available.has(s.id))).map((s) => s.id),
  })).filter((layer) => layer.ids.length > 0);
}

/** The layers with no structure at all, outside in (shown as "no 3D models yet"). */
export function missingLayers(structures: readonly AnatomyStructure[]): LayerId[] {
  if (!structures.some((s) => s.layer)) return [];
  return LAYERS.filter((id) => !structures.some((s) => s.layer === id));
}

/**
 * Describe only what this lab build offers. Production may exclude draft
 * systems, so a missing layer does not mean BodyParts3D lacks that anatomy.
 */
export function unavailableLayersNote(structures: readonly AnatomyStructure[]): string | null {
  const missing = missingLayers(structures);
  return missing.length > 0
    ? `3D layers not available in this version of the lab: ${missing.join(', ')}.`
    : null;
}

/** A layer is shown while any of its structures is. */
export function layerShown(layer: Layer, hidden: ReadonlySet<string>): boolean {
  return layer.ids.some((id) => !hidden.has(id));
}

/** The layer button: hides every structure of a shown layer, or shows every structure of a hidden one. */
export function toggleLayer(hidden: ReadonlySet<string>, layer: Layer): Set<string> {
  const next = new Set(hidden);
  if (layerShown(layer, hidden)) for (const id of layer.ids) next.add(id);
  else for (const id of layer.ids) next.delete(id);
  return next;
}

/** The outermost layer still shown, unless it is the only one left (peeling never empties the view). */
export function nextToPeel(layers: readonly Layer[], hidden: ReadonlySet<string>): Layer | null {
  const shown = layers.filter((layer) => layerShown(layer, hidden));
  return shown.length > 1 ? shown[0]! : null;
}

/** The innermost layer that is wholly hidden: "put back" shows it again. */
export function nextToRestore(layers: readonly Layer[], hidden: ReadonlySet<string>): Layer | null {
  const gone = layers.filter((layer) => !layerShown(layer, hidden));
  return gone.length > 0 ? gone[gone.length - 1]! : null;
}

export function peel(layers: readonly Layer[], hidden: ReadonlySet<string>): Set<string> {
  const layer = nextToPeel(layers, hidden);
  return layer ? toggleLayer(hidden, layer) : new Set(hidden);
}

export function restore(layers: readonly Layer[], hidden: ReadonlySet<string>): Set<string> {
  const layer = nextToRestore(layers, hidden);
  return layer ? toggleLayer(hidden, layer) : new Set(hidden);
}

/** The key of the whole-body view in the system picker. */
export const WHOLE_BODY_KEY = 'whole-body';

/**
 * The whole-body view: every system's model loaded together (all share BodyParts3D's one coordinate frame), so the
 * layers can be peeled across the body. Its structures keep their official names, groups and layers; it is a draft
 * when any part is. Null with fewer than two systems, or when the systems come from different model releases.
 */
export function wholeBody(systems: readonly AnatomySystem[]): AnatomySystem | null {
  const real = systems.filter((s) => !s.fixture);
  if (real.length < 2) return null;
  const release = real[0]!.model.release;
  if (real.some((s) => s.model.release !== release)) return null;
  const seen = new Set<string>();
  const structures: AnatomyStructure[] = [];
  // Distinct systems can reference the same physical GLB. Decode it only once.
  const modelFiles = [...new Set(real.map((system) => system.model.file))];
  const layerFiles: Record<string, string[]> = {};
  // Preserve the exact IDs from each source file; layerFiles alone cannot say which file owns a given ID.
  const fileIds: Record<string, string[]> = {};
  for (const system of real) {
    const ids = (fileIds[system.model.file] ??= []);
    for (const structure of system.structures) {
      if (!ids.includes(structure.id)) ids.push(structure.id);
      if (structure.layer) {
        const files = (layerFiles[structure.layer] ??= []);
        if (!files.includes(system.model.file)) files.push(system.model.file);
      }
      if (seen.has(structure.id)) continue;
      seen.add(structure.id);
      structures.push(structure);
    }
  }
  const out: AnatomySystem = {
    key: WHOLE_BODY_KEY,
    title: 'whole body',
    status: real.every((s) => s.status === 'approved') ? 'approved' : 'draft',
    model: { file: modelFiles[0]!, files: modelFiles, release, layerFiles, fileIds },
    structures,
  };
  if (real[0]!.model.via) out.model.via = real[0]!.model.via;
  return out;
}

/**
 * The page sends individual systems only. Build the combined whole-body grouping in the client once the lab
 * is open, not in the serialized Astro island props or on the closed cover screen. The optional fixture comes
 * first and is never included in the whole-body aggregate.
 */
export function systemsForView(
  baseSystems: readonly AnatomySystem[],
  includeWholeBody: boolean,
  fixture: AnatomySystem | null = null,
): AnatomySystem[] {
  const body = includeWholeBody ? wholeBody(baseSystems) : null;
  return [...(fixture ? [fixture] : []), ...baseSystems, ...(body ? [body] : [])];
}

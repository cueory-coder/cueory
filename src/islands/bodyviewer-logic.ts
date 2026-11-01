/** Pure logic for the 3D body viewer (D-83). No three.js import here — unit-testable without a DOM. */

export type Layer = 'skin' | 'muscle' | 'bone';
export const LAYERS: readonly Layer[] = ['skin', 'muscle', 'bone'];

/** Budget limits for a 3D model (the phone budget). */
export const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
export const MAX_TRIANGLES = 150_000;

/**
 * Checks whether a model fits within the phone budget.
 * Returns a plain English error string, or null when the model is within budget.
 */
export function checkModelBudget(sizeBytes: number, triangles: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return 'Model size is not a valid number.';
  if (!Number.isFinite(triangles) || triangles < 0) return 'Triangle count is not a valid number.';
  if (sizeBytes > MAX_SIZE_BYTES)
    return `Model is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB; the phone budget is 3 MB.`;
  if (triangles > MAX_TRIANGLES)
    return `Model has ${triangles.toLocaleString()} triangles; the phone budget is 150,000.`;
  return null;
}

/** Toggles a layer's visibility in the current set, returning a new Set. */
export function toggleLayer(visible: ReadonlySet<Layer>, layer: Layer): Set<Layer> {
  const next = new Set(visible);
  if (next.has(layer)) {
    next.delete(layer);
  } else {
    next.add(layer);
  }
  return next;
}

/** Plain-language triangle notices for the Anatomy Lab, without a 3D or DOM dependency. */
import { checkTriangleBudget, MAX_TRIANGLES } from './bodyviewer-logic';

/**
 * The 150,000-triangle phone limit belongs to each downloaded GLB file, not to
 * the combined whole-body view. Summing several individually valid files must
 * not be reported as a violation by a single model.
 *
 * The full scene's triangle count is still worth showing as a performance
 * caution. These are loaded triangles, not necessarily triangles currently
 * visible after a layer has been peeled away.
 */
export function anatomyTriangleNote(
  triangles: number,
  loadedFiles: number,
  layeredWholeBody: boolean,
): string | null {
  const perModelNote = checkTriangleBudget(triangles);
  if (!perModelNote) return null;

  if (!layeredWholeBody || !Number.isInteger(loadedFiles) || loadedFiles < 2 ||
      !Number.isFinite(triangles) || triangles < 0) {
    return perModelNote;
  }

  return `whole-body view has ${triangles.toLocaleString()} loaded triangles across ${loadedFiles} model files. The ${MAX_TRIANGLES.toLocaleString()}-triangle phone budget applies to each file, not their combined total. Showing many layers may slow down phones.`;
}

/**
 * The ID/occlusion pass temporarily replaces visible mesh materials with
 * flat colors. Always restore each mesh's original material and draw order,
 * even if preparing the pass, rendering, or reading pixels throws.
 *
 * Each mesh is saved once because one mesh may appear in multiple buckets.
 * This guard is synchronous: WebGLRenderer's render/read calls are synchronous.
 */
import type { Mesh } from 'three';

export function withTemporaryMeshAppearance<T>(
  apply: (remember: (mesh: Mesh) => void) => void,
  draw: () => T,
): T {
  const originals = new Map<Mesh, { material: Mesh['material']; renderOrder: number }>();
  const remember = (mesh: Mesh) => {
    if (!originals.has(mesh)) {
      originals.set(mesh, { material: mesh.material, renderOrder: mesh.renderOrder });
    }
  };

  try {
    apply(remember);
    return draw();
  } finally {
    for (const [mesh, original] of originals) {
      mesh.material = original.material;
      mesh.renderOrder = original.renderOrder;
    }
  }
}

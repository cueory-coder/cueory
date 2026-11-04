/**
 * Mesh registration for the Anatomy Lab's 3D scene.
 *
 * Several BodyParts3D source models may contain a structure with the same ID.
 * A newly loaded mesh must join that ID's existing bucket rather than becoming
 * an unlabeled mesh just because another GLB registered the name first.
 *
 * This module uses Three.js object trees but no renderer or browser APIs, so
 * the ownership behavior can be tested with synthetic groups in Vitest.
 */
import * as THREE from 'three';

export interface IndexedAnatomyMeshes {
  /** IDs whose mesh lists changed; their bounds must be recalculated. */
  touched: string[];
  triangles: number;
}

/**
 * Three.js leaves texture disposal to callers even after Material.dispose().
 * Converted glTF materials and discarded GLB groups own their textures here.
 * Track shared texture identities across the entire group, not per mesh.
 * https://threejs.org/manual/pages/how-to-dispose-of-objects.html
 */
function disposeMaterialTextures(material: THREE.Material, seen: Set<THREE.Texture>): void {
  for (const value of Object.values(material)) {
    if (!(value instanceof THREE.Texture) || seen.has(value)) continue;
    seen.add(value);
    try {
      value.dispose();
    } catch {
      // Keep cleaning other textures and meshes if a GPU resource fails.
    }
  }
}

/**
 * Register the meshes in one decoded GLB group with the scene's existing index.
 *
 * The nearest named ancestor owns each mesh, matching the glTF node hierarchy.
 * Previously indexed IDs are deliberately accepted: their new meshes need the
 * same pick, hide, highlight and label behavior as the original meshes.
 */
export function indexAnatomyGroup(
  group: THREE.Object3D,
  ids: readonly string[],
  meshesById: Map<string, THREE.Mesh[]>,
  unlabeled: THREE.Mesh[],
): IndexedAnatomyMeshes {
  const wanted = new Set(ids);
  const owners = new Map<THREE.Object3D, string>();

  group.traverse((object) => {
    const name = typeof object.userData['name'] === 'string' ? object.userData['name'] as string : object.name;
    if (!wanted.has(name)) return;
    if (!meshesById.has(name)) meshesById.set(name, []);
    // Even if a different GLB already registered this ID, its new node
    // must own the meshes beneath it.
    owners.set(object, name);
  });

  let triangles = 0;
  const touched = new Set<string>();
  // glTF meshes often share their original materials. Release each material
  // at most once as all meshes receive the lab's own Lambert materials.
  const originalMaterials = new Set<THREE.Material>();
  const originalTextures = new Set<THREE.Texture>();
  // Every mesh under one structure uses the same color/opacity state. Share one
  // viewer material per owner to bound the number of GPU material instances.
  // Keep this cache local to a GLB group so disposal cannot affect other files.
  const labMaterials = new Map<string, THREE.MeshLambertMaterial>();
  let unlabeledMaterial: THREE.MeshLambertMaterial | undefined;

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Empty or malformed glTF placeholders have no drawable triangles.
    // Skip only these non-drawable nodes; keep indexing their valid siblings.
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    if (!position || position.count < 3 || (index !== null && index.count < 3)) return;

    let owner: string | undefined;
    for (let at: THREE.Object3D | null = mesh; at && !owner; at = at.parent) {
      owner = owners.get(at);
    }

    for (const material of ([] as THREE.Material[]).concat(mesh.material)) {
      if (originalMaterials.has(material)) continue;
      originalMaterials.add(material);
      disposeMaterialTextures(material, originalTextures);
      try {
        material.dispose();
      } catch {
        // A lost WebGL context must not prevent indexing the other meshes.
      }
    }
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
    let labMaterial = owner ? labMaterials.get(owner) : unlabeledMaterial;
    if (!labMaterial) {
      labMaterial = new THREE.MeshLambertMaterial();
      if (owner) labMaterials.set(owner, labMaterial);
      else unlabeledMaterial = labMaterial;
    }
    mesh.material = labMaterial;

    triangles += (index ? index.count : position.count) / 3;

    if (owner) {
      mesh.userData['structureId'] = owner;
      meshesById.get(owner)!.push(mesh);
      touched.add(owner);
    } else {
      unlabeled.push(mesh);
    }
  });

  return { touched: [...touched], triangles: Math.round(triangles) };
}

/**
 * Release decoded GLB mesh resources after replacement, cancellation, or
 * failure. A corrupted/lost GPU resource may throw in dispose(), but that
 * must not prevent the remaining mesh resources from being released.
 *
 * Geometry and material objects can be shared by several meshes in one GLB.
 * Each distinct resource is disposed at most once.
 */
export function disposeAnatomyMeshResources(group: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry);
      try {
        mesh.geometry.dispose();
      } catch {
        // Continue releasing the other resources even after a GPU failure.
      }
    }
    for (const material of ([] as THREE.Material[]).concat(mesh.material)) {
      if (materials.has(material)) continue;
      materials.add(material);
      disposeMaterialTextures(material, textures);
      try {
        material.dispose();
      } catch {
        // A throwing material cleanup must not abandon the remaining meshes.
      }
    }
  });
}

/**
 * Release temporary ID/occlusion materials safely during system switching.
 * Deduplicate shared materials and continue after a disposal exception.
 */
export function disposeAnatomyMaterials(materials: readonly THREE.Material[]): void {
  const seen = new Set<THREE.Material>();
  for (const material of materials) {
    if (seen.has(material)) continue;
    seen.add(material);
    try {
      material.dispose();
    } catch {
      // Best-effort cleanup must not interrupt switching systems.
    }
  }
}

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
  // Every mesh under one structure uses the same color/opacity state. Share one
  // viewer material per owner to bound the number of GPU material instances.
  // Keep this cache local to a GLB group so disposal cannot affect other files.
  const labMaterials = new Map<string, THREE.MeshLambertMaterial>();
  let unlabeledMaterial: THREE.MeshLambertMaterial | undefined;

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    let owner: string | undefined;
    for (let at: THREE.Object3D | null = mesh; at && !owner; at = at.parent) {
      owner = owners.get(at);
    }

    for (const material of ([] as THREE.Material[]).concat(mesh.material)) {
      if (originalMaterials.has(material)) continue;
      originalMaterials.add(material);
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

    const index = mesh.geometry.getIndex();
    triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3;

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
      try {
        material.dispose();
      } catch {
        // A throwing material cleanup must not abandon the remaining meshes.
      }
    }
  });
}

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

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    let owner: string | undefined;
    for (let at: THREE.Object3D | null = mesh; at && !owner; at = at.parent) {
      owner = owners.get(at);
    }

    for (const material of ([] as THREE.Material[]).concat(mesh.material)) material.dispose();
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
    mesh.material = new THREE.MeshLambertMaterial();

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

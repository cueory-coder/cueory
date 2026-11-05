import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { withTemporaryMeshAppearance } from '../../src/islands/anatomyidpass';

/** Synthetic meshes only: no real anatomy models, structure names, or clinical facts. */
describe('Anatomy Lab ID-pass mesh appearance restoration', () => {
  it('restores materials and render order after a successful ID pass, even for repeated meshes', () => {
    const original = new THREE.MeshBasicMaterial();
    const replacement = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);
    mesh.renderOrder = 4;

    const result = withTemporaryMeshAppearance(
      (remember) => {
        remember(mesh);
        mesh.material = replacement;
        mesh.renderOrder = 10;
        remember(mesh); // repeated bucket must not overwrite the original snapshot
      },
      () => {
        expect(mesh.material).toBe(replacement);
        expect(mesh.renderOrder).toBe(10);
        return new Uint8Array([1, 2, 3]);
      },
    );

    expect(result).toEqual(new Uint8Array([1, 2, 3]));
    expect(mesh.material).toBe(original);
    expect(mesh.renderOrder).toBe(4);
  });

  it('restores both ordinary and multi-material meshes after a render/readback failure', () => {
    const firstOriginal = new THREE.MeshBasicMaterial();
    const secondOriginal = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const first = new THREE.Mesh(new THREE.BoxGeometry(), firstOriginal);
    const second = new THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>(
      new THREE.BoxGeometry(), secondOriginal,
    );
    first.renderOrder = 2;
    second.renderOrder = 7;
    const flat = new THREE.MeshBasicMaterial();

    expect(() => withTemporaryMeshAppearance(
      (remember) => {
        remember(first);
        first.material = flat;
        first.renderOrder = 10;
        remember(second);
        second.material = flat;
        second.renderOrder = 0;
      },
      () => { throw new Error('GPU pixel readback failed'); },
    )).toThrow('GPU pixel readback failed');

    expect(first.material).toBe(firstOriginal);
    expect(first.renderOrder).toBe(2);
    expect(second.material).toBe(secondOriginal);
    expect(second.renderOrder).toBe(7);
  });

  it('restores already-swapped meshes when preparing a later override throws', () => {
    const original = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);
    mesh.renderOrder = 3;
    const flat = new THREE.MeshBasicMaterial();
    let renderCalled = false;

    expect(() => withTemporaryMeshAppearance(
      (remember) => {
        remember(mesh);
        mesh.material = flat;
        mesh.renderOrder = 10;
        throw new Error('could not prepare ID material');
      },
      () => { renderCalled = true; },
    )).toThrow('could not prepare ID material');

    expect(renderCalled).toBe(false);
    expect(mesh.material).toBe(original);
    expect(mesh.renderOrder).toBe(3);
  });
});

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeAnatomyMeshResources, indexAnatomyGroup } from '../../src/islands/anatomymeshindex';

/** Test-only boxes and made-up IDs, never real anatomical content. */
function sampleGroup(id: string, meshName = ''): { group: THREE.Group; mesh: THREE.Mesh; material: THREE.Material } {
  const group = new THREE.Group();
  const structure = new THREE.Group();
  structure.userData['name'] = id;
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.name = meshName;
  structure.add(mesh);
  group.add(structure);
  return { group, mesh, material };
}

describe('anatomy GLB mesh registration', () => {
  it('converts a glTF material shared by nested meshes without disposing it twice', () => {
    const group = new THREE.Group();
    const structure = new THREE.Group();
    structure.name = 'TEST_SHARED_MATERIAL';
    const nested = new THREE.Group();
    group.add(structure);
    structure.add(nested);
    const oldMaterial = new THREE.MeshBasicMaterial();
    const disposed = vi.spyOn(oldMaterial, 'dispose');
    const upper = new THREE.Mesh(new THREE.BoxGeometry(), oldMaterial);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(), oldMaterial);
    structure.add(upper);
    nested.add(lower);
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    expect(indexAnatomyGroup(group, ['TEST_SHARED_MATERIAL'], indexed, unlabeled))
      .toEqual({ touched: ['TEST_SHARED_MATERIAL'], triangles: 24 });
    expect(disposed).toHaveBeenCalledOnce();
    expect(indexed.get('TEST_SHARED_MATERIAL')).toEqual([upper, lower]);
    expect(unlabeled).toEqual([]);
    expect(upper.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(lower.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(upper.material).not.toBe(lower.material);
  });

  it('continues registering later meshes if disposing an original material throws', () => {
    const group = new THREE.Group();
    group.name = 'TEST_GPU_LOSS';
    const broken = new THREE.MeshBasicMaterial();
    const healthy = new THREE.MeshBasicMaterial();
    const brokenDispose = vi.spyOn(broken, 'dispose')
      .mockImplementation(() => { throw new Error('lost WebGL context'); });
    const healthyDispose = vi.spyOn(healthy, 'dispose');
    const first = new THREE.Mesh(new THREE.BoxGeometry(), broken);
    const second = new THREE.Mesh(new THREE.BoxGeometry(), healthy);
    group.add(first, second);
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    expect(indexAnatomyGroup(group, ['TEST_GPU_LOSS'], indexed, unlabeled))
      .toEqual({ touched: ['TEST_GPU_LOSS'], triangles: 24 });
    expect(brokenDispose).toHaveBeenCalledOnce();
    expect(healthyDispose).toHaveBeenCalledOnce();
    expect(indexed.get('TEST_GPU_LOSS')).toEqual([first, second]);
    expect(first.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(second.material).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('adds duplicate structure IDs from later files to the same hide/pick/highlight bucket', () => {
    const first = sampleGroup('TEST_SHARED');
    const second = sampleGroup('TEST_SHARED');
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    expect(indexAnatomyGroup(first.group, ['TEST_SHARED'], indexed, unlabeled))
      .toEqual({ touched: ['TEST_SHARED'], triangles: 12 });
    expect(indexAnatomyGroup(second.group, ['TEST_SHARED'], indexed, unlabeled))
      .toEqual({ touched: ['TEST_SHARED'], triangles: 12 });

    expect(indexed.get('TEST_SHARED')).toEqual([first.mesh, second.mesh]);
    expect(unlabeled).toEqual([]);
    expect(first.mesh.userData['structureId']).toBe('TEST_SHARED');
    expect(second.mesh.userData['structureId']).toBe('TEST_SHARED');
    expect(first.mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(second.mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('tracks a repeated ID as changed so its bounds can be refreshed', () => {
    const first = sampleGroup('TEST_SHARED');
    const second = sampleGroup('TEST_SHARED');
    second.group.position.set(100, 0, 0);
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    indexAnatomyGroup(first.group, ['TEST_SHARED'], indexed, unlabeled);
    const before = new THREE.Box3().setFromObject(first.mesh);
    second.group.updateMatrixWorld(true);
    const { touched } = indexAnatomyGroup(second.group, ['TEST_SHARED'], indexed, unlabeled);
    const combined = new THREE.Box3();
    for (const mesh of indexed.get('TEST_SHARED')!) combined.expandByObject(mesh);

    expect(touched).toEqual(['TEST_SHARED']);
    expect(combined.max.x).toBeGreaterThan(before.max.x);
  });

  it('does not give a new unlabeled mesh a previous file’s structure ID', () => {
    const first = sampleGroup('TEST_A');
    const second = sampleGroup('TEST_NOT_REQUESTED');
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    indexAnatomyGroup(first.group, ['TEST_A'], indexed, unlabeled);
    const result = indexAnatomyGroup(second.group, ['TEST_A'], indexed, unlabeled);

    expect(result.touched).toEqual([]);
    expect(indexed.get('TEST_A')).toEqual([first.mesh]);
    expect(unlabeled).toEqual([second.mesh]);
    expect(second.mesh.userData['structureId']).toBeUndefined();
  });

  it('uses the closest named node when a mesh is nested beneath another structure', () => {
    const group = new THREE.Group();
    const outer = new THREE.Group();
    outer.name = 'TEST_OUTER';
    const inner = new THREE.Group();
    inner.name = 'TEST_INNER';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    inner.add(mesh);
    outer.add(inner);
    group.add(outer);
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];
    const oldDispose = vi.spyOn(mesh.material as THREE.Material, 'dispose');

    const result = indexAnatomyGroup(group, ['TEST_OUTER', 'TEST_INNER'], indexed, unlabeled);

    expect(result).toEqual({ touched: ['TEST_INNER'], triangles: 12 });
    expect(indexed.get('TEST_INNER')).toEqual([mesh]);
    expect(indexed.has('TEST_OUTER')).toBe(true);
    expect(mesh.userData['structureId']).toBe('TEST_INNER');
    expect(oldDispose).toHaveBeenCalledOnce();
  });
});

describe('anatomy GLB mesh cleanup', () => {
  it('disposes shared geometry and material only once across nested meshes', () => {
    const group = new THREE.Group();
    const nested = new THREE.Group();
    group.add(nested);
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    group.add(new THREE.Mesh(geometry, material));
    nested.add(new THREE.Mesh(geometry, material));

    disposeAnatomyMeshResources(group);

    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });

  it('continues cleanup after geometry and material disposal throw', () => {
    const group = new THREE.Group();
    const brokenGeometry = new THREE.BoxGeometry();
    const brokenMaterial = new THREE.MeshBasicMaterial();
    const healthyGeometry = new THREE.BoxGeometry();
    const healthyMaterial = new THREE.MeshBasicMaterial();
    const firstGeometry = vi.spyOn(brokenGeometry, 'dispose')
      .mockImplementation(() => { throw new Error('lost geometry context'); });
    const firstMaterial = vi.spyOn(brokenMaterial, 'dispose')
      .mockImplementation(() => { throw new Error('lost material context'); });
    const laterGeometry = vi.spyOn(healthyGeometry, 'dispose');
    const laterMaterial = vi.spyOn(healthyMaterial, 'dispose');
    group.add(new THREE.Mesh(brokenGeometry, brokenMaterial));
    group.add(new THREE.Mesh(healthyGeometry, healthyMaterial));

    expect(() => disposeAnatomyMeshResources(group)).not.toThrow();
    expect(firstGeometry).toHaveBeenCalledOnce();
    expect(firstMaterial).toHaveBeenCalledOnce();
    expect(laterGeometry).toHaveBeenCalledOnce();
    expect(laterMaterial).toHaveBeenCalledOnce();
  });

  it('handles empty GLB groups without attempting resource disposal', () => {
    expect(() => disposeAnatomyMeshResources(new THREE.Group())).not.toThrow();
  });
});

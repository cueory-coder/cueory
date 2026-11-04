import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeAnatomyMaterials, disposeAnatomyMeshResources, indexAnatomyGroup } from '../../src/islands/anatomymeshindex';

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
  it('skips a placeholder without positions but still indexes a valid sibling', () => {
    const group = new THREE.Group();
    const emptyOwner = new THREE.Group();
    emptyOwner.name = 'TEST_EMPTY_PLACEHOLDER';
    const drawableOwner = new THREE.Group();
    drawableOwner.name = 'TEST_DRAWABLE_SIBLING';
    const emptyMaterial = new THREE.MeshBasicMaterial();
    const emptyDispose = vi.spyOn(emptyMaterial, 'dispose');
    const empty = new THREE.Mesh(new THREE.BufferGeometry(), emptyMaterial);
    const drawable = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    emptyOwner.add(empty);
    drawableOwner.add(drawable);
    group.add(emptyOwner, drawableOwner);
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    expect(indexAnatomyGroup(group, ['TEST_EMPTY_PLACEHOLDER', 'TEST_DRAWABLE_SIBLING'], indexed, unlabeled))
      .toEqual({ touched: ['TEST_DRAWABLE_SIBLING'], triangles: 12 });
    expect(indexed.get('TEST_EMPTY_PLACEHOLDER')).toEqual([]);
    expect(indexed.get('TEST_DRAWABLE_SIBLING')).toEqual([drawable]);
    expect(unlabeled).toEqual([]);
    expect(empty.material).toBe(emptyMaterial);
    expect(emptyDispose).not.toHaveBeenCalled();
    expect(drawable.material).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('does not mark zero-index and fewer-than-three-vertex meshes as found', () => {
    const group = new THREE.Group();
    group.name = 'TEST_NO_TRIANGLES';
    const zeroIndex = new THREE.BoxGeometry();
    zeroIndex.setIndex([]);
    const twoPoints = new THREE.BufferGeometry();
    twoPoints.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
    const first = new THREE.Mesh(zeroIndex, new THREE.MeshBasicMaterial());
    const second = new THREE.Mesh(twoPoints, new THREE.MeshBasicMaterial());
    group.add(first, second);
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    expect(indexAnatomyGroup(group, ['TEST_NO_TRIANGLES'], indexed, unlabeled))
      .toEqual({ touched: [], triangles: 0 });
    expect(indexed.get('TEST_NO_TRIANGLES')).toEqual([]);
    expect(unlabeled).toEqual([]);
    expect(first.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(second.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('converts a glTF material shared by nested meshes without disposing it twice', () => {
    const group = new THREE.Group();
    const structure = new THREE.Group();
    structure.name = 'TEST_SHARED_MATERIAL';
    const nested = new THREE.Group();
    group.add(structure);
    structure.add(nested);
    const texture = new THREE.Texture();
    const disposedTexture = vi.spyOn(texture, 'dispose');
    const oldMaterial = new THREE.MeshBasicMaterial({ map: texture });
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
    expect(disposedTexture).toHaveBeenCalledOnce();
    expect(indexed.get('TEST_SHARED_MATERIAL')).toEqual(expect.arrayContaining([upper, lower]));
    expect(indexed.get('TEST_SHARED_MATERIAL')).toHaveLength(2);
    expect(unlabeled).toEqual([]);
    expect(upper.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(lower.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(upper.material).toBe(lower.material);
  });

  it('disposes a texture shared by different source materials exactly once', () => {
    const group = new THREE.Group();
    group.name = 'TEST_TEXTURE_OWNERS';
    const texture = new THREE.Texture();
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const first = new THREE.Mesh(
      new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: texture, normalMap: texture }),
    );
    const second = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture }));
    group.add(first, second);
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    expect(indexAnatomyGroup(group, ['TEST_TEXTURE_OWNERS'], indexed, unlabeled).triangles).toBe(24);
    expect(disposeTexture).toHaveBeenCalledOnce();
    expect(indexed.get('TEST_TEXTURE_OWNERS')).toHaveLength(2);
    expect(first.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(second.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(first.material).toBe(second.material);
  });

  it('continues registering later meshes if disposing an original material throws', () => {
    const group = new THREE.Group();
    group.name = 'TEST_GPU_LOSS';
    const brokenTexture = new THREE.Texture();
    const healthyTexture = new THREE.Texture();
    const brokenTextureDispose = vi.spyOn(brokenTexture, 'dispose')
      .mockImplementation(() => { throw new Error('lost texture context'); });
    const healthyTextureDispose = vi.spyOn(healthyTexture, 'dispose');
    const broken = new THREE.MeshBasicMaterial({ map: brokenTexture });
    const healthy = new THREE.MeshBasicMaterial({ map: healthyTexture });
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
    expect(brokenTextureDispose).toHaveBeenCalledOnce();
    expect(healthyTextureDispose).toHaveBeenCalledOnce();
    expect(indexed.get('TEST_GPU_LOSS')).toEqual([first, second]);
    expect(first.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(second.material).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('shares viewer materials within an owner, but not between owners or unlabeled meshes', () => {
    const group = new THREE.Group();
    const ownerA = new THREE.Group();
    ownerA.name = 'TEST_OWNER_A';
    const ownerB = new THREE.Group();
    ownerB.name = 'TEST_OWNER_B';
    const a1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const a2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const unnamed1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const unnamed2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    ownerA.add(a1, a2);
    ownerB.add(b1);
    group.add(ownerA, ownerB, unnamed1, unnamed2);
    const indexed = new Map<string, THREE.Mesh[]>();
    const unlabeled: THREE.Mesh[] = [];

    expect(indexAnatomyGroup(group, ['TEST_OWNER_A', 'TEST_OWNER_B'], indexed, unlabeled))
      .toEqual({ touched: ['TEST_OWNER_A', 'TEST_OWNER_B'], triangles: 60 });
    expect(indexed.get('TEST_OWNER_A')).toEqual([a1, a2]);
    expect(indexed.get('TEST_OWNER_B')).toEqual([b1]);
    expect(unlabeled).toEqual([unnamed1, unnamed2]);

    expect(a1.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(a1.material).toBe(a2.material);
    expect(a1.material).not.toBe(b1.material);
    expect(unnamed1.material).toBe(unnamed2.material);
    expect(unnamed1.material).not.toBe(a1.material);

    const sharedDispose = vi.spyOn(a1.material as THREE.Material, 'dispose');
    const unnamedDispose = vi.spyOn(unnamed1.material as THREE.Material, 'dispose');
    disposeAnatomyMeshResources(group);
    expect(sharedDispose).toHaveBeenCalledOnce();
    expect(unnamedDispose).toHaveBeenCalledOnce();
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

describe('anatomy ID-pass material cleanup', () => {
  it('releases each temporary material once and continues after a GPU disposal error', () => {
    const broken = new THREE.MeshBasicMaterial();
    const shared = new THREE.MeshBasicMaterial();
    const last = new THREE.MeshBasicMaterial();
    const brokenDispose = vi.spyOn(broken, 'dispose')
      .mockImplementation(() => { throw new Error('WebGL context lost'); });
    const sharedDispose = vi.spyOn(shared, 'dispose');
    const lastDispose = vi.spyOn(last, 'dispose');

    expect(() => disposeAnatomyMaterials([broken, shared, shared, last])).not.toThrow();
    expect(brokenDispose).toHaveBeenCalledOnce();
    expect(sharedDispose).toHaveBeenCalledOnce();
    expect(lastDispose).toHaveBeenCalledOnce();
  });

  it('allows clearing an empty ID-pass material array', () => {
    expect(() => disposeAnatomyMaterials([])).not.toThrow();
  });
});

describe('anatomy GLB mesh cleanup', () => {
  it('disposes shared geometry and material only once across nested meshes', () => {
    const group = new THREE.Group();
    const nested = new THREE.Group();
    group.add(nested);
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    group.add(new THREE.Mesh(geometry, material));
    nested.add(new THREE.Mesh(geometry, material));

    disposeAnatomyMeshResources(group);

    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(disposeTexture).toHaveBeenCalledOnce();
  });

  it('continues cleanup after geometry and material disposal throw', () => {
    const group = new THREE.Group();
    const brokenGeometry = new THREE.BoxGeometry();
    const brokenTexture = new THREE.Texture();
    const healthyTexture = new THREE.Texture();
    const brokenMaterial = new THREE.MeshBasicMaterial({ map: brokenTexture });
    const healthyGeometry = new THREE.BoxGeometry();
    const healthyMaterial = new THREE.MeshBasicMaterial({ map: healthyTexture });
    const failedTexture = vi.spyOn(brokenTexture, 'dispose')
      .mockImplementation(() => { throw new Error('lost texture context'); });
    const laterTexture = vi.spyOn(healthyTexture, 'dispose');
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
    expect(failedTexture).toHaveBeenCalledOnce();
    expect(laterTexture).toHaveBeenCalledOnce();
  });

  it('handles empty GLB groups without attempting resource disposal', () => {
    expect(() => disposeAnatomyMeshResources(new THREE.Group())).not.toThrow();
  });
});

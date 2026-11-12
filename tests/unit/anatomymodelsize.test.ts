import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { modelBytesFor } from '../../src/islands/anatomymodelsize';
import type { AnatomySystem } from '../../src/islands/anatomylab';

const publicDir = new URL('file:///site/public/');
const system = (key: string, file: string, fixture = false) =>
  ({ key, fixture, model: { file } as AnatomySystem['model'] });

describe('anatomy model sizes for the download notes', () => {
  it("measures each shown system's own model file under public/", () => {
    const asked: string[] = [];
    const sizes = modelBytesFor(
      [system('one', '/models/anatomy/one.glb'), system('two-b', '/models/anatomy/two-b.glb')],
      publicDir,
      (path) => {
        asked.push(path);
        return path.endsWith('one.glb') ? 1234 : 5678;
      },
    );
    expect(sizes).toEqual({ one: 1234, 'two-b': 5678 });
    expect(asked).toEqual([
      fileURLToPath(new URL('models/anatomy/one.glb', publicDir)),
      fileURLToPath(new URL('models/anatomy/two-b.glb', publicDir)),
    ]);
  });

  it('never reads a path outside /models/anatomy, and skips the fixture', () => {
    const asked: string[] = [];
    const sizes = modelBytesFor(
      [
        system('fixture', '/preview/anatomy-fixture/fixture.glb', true),
        system('up', '/models/anatomy/../../secret.glb'),
        system('deep', '/models/anatomy/a/b.glb'),
        system('other', '/models/other/one.glb'),
        system('upper', '/models/anatomy/One.glb'),
        system('web', 'https://example.com/models/anatomy/one.glb'),
        system('ext', '/models/anatomy/one.gltf'),
      ],
      publicDir,
      (path) => {
        asked.push(path);
        return 1;
      },
    );
    expect(sizes).toEqual({});
    expect(asked).toEqual([]);
  });

  it('leaves out a model that is missing or empty, so no note shows a wrong size', () => {
    const sizes = modelBytesFor(
      [system('gone', '/models/anatomy/gone.glb'), system('empty', '/models/anatomy/empty.glb')],
      publicDir,
      (path) => (path.endsWith('gone.glb') ? null : 0),
    );
    expect(sizes).toEqual({});
  });

  it('reads real sizes from disk by default and survives a missing folder', () => {
    expect(modelBytesFor([system('gone', '/models/anatomy/gone.glb')], new URL('file:///no/such/folder/'))).toEqual({});
  });
});

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_SIZE_BYTES } from '../../src/islands/bodyviewer-logic';

/** Finds 3D model files under a folder. With none present, the list is empty and the test passes. */
function modelFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...modelFiles(full));
    else if (/\.(glb|gltf)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

describe('3D model size budget (phone budget, 3 MB)', () => {
  it('no model file under public/ is larger than 3 MB', () => {
    const tooBig = modelFiles('public')
      .map((f) => ({ f, size: statSync(f).size }))
      .filter(({ size }) => size > MAX_SIZE_BYTES)
      .map(({ f, size }) => `${f} is ${(size / 1024 / 1024).toFixed(1)} MB`);
    expect(tooBig).toEqual([]);
  });
});

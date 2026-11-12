/**
 * Model download sizes for the anatomy lab's notes, read at build time (the page's frontmatter calls this; it never
 * runs in the browser). Only the systems the build shows are measured, and only their own /models/anatomy/*.glb files:
 * the fixture's model is made by a route, so it has no size here.
 */
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AnatomySystem } from './anatomylab';

const MODEL_PATH = /^\/models\/anatomy\/[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/;

export function modelBytesFor(
  systems: ReadonlyArray<Pick<AnatomySystem, 'key' | 'model' | 'fixture'>>,
  publicDir: URL,
  size: (path: string) => number | null = (path) => {
    try {
      return statSync(path).size;
    } catch {
      return null;
    }
  },
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const system of systems) {
    if (system.fixture || !MODEL_PATH.test(system.model.file)) continue;
    const bytes = size(fileURLToPath(new URL(system.model.file.slice(1), publicDir)));
    if (bytes !== null && bytes > 0) out[system.key] = bytes;
  }
  return out;
}

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// These two suites belong to the anatomy worker and already contain time-based checks.
// They are the only exceptions. Every other E2E file must avoid fixed browser sleeps.
const allowed = new Set(['anatomy-export-switch.spec.ts', 'anatomy-lab.spec.ts']);
const root = fileURLToPath(new URL('../e2e/', import.meta.url));

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe('fixed browser waits', () => {
  it('allows them only in the two independently owned anatomy specs', () => {
    const offenders = testFiles(root).flatMap((file) => {
      const name = relative(root, file).replaceAll('\\', '/');
      if (allowed.has(name)) return [];
      return readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line, index) =>
        /\bwaitForTimeout\b/.test(line) ? [`${name}:${index + 1}`] : []);
    });
    expect(offenders).toEqual([]);
  });
});

import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const guide = readFileSync(join(root, 'docs/ARCHITECTURE.md'), 'utf8');

/** Repository files and folders must be written as inline-code paths. */
function repositoryPaths(): string[] {
  const matches = [...guide.matchAll(/`((?:src|content|docs|tests|public|scripts)\/[^`\r\n]+)`/g)];
  return [...new Set(matches.map((match) => match[1]))].sort();
}

describe('architecture documentation', () => {
  it('names real repository files and folders, not guessed paths', () => {
    const refs = repositoryPaths();
    expect(refs.length).toBeGreaterThan(25);
    for (const reference of refs) {
      expect(reference, 'Do not use parent paths or globs: ' + reference).not.toMatch(/\.{2}|\*|\\|\/\//);
      const absolute = resolve(root, reference);
      expect(absolute.startsWith(root + sep), reference + ' must stay inside the repository').toBe(true);
      expect(existsSync(absolute), reference + ' does not exist').toBe(true);
      expect(statSync(absolute).isDirectory() || statSync(absolute).isFile()).toBe(true);
    }
  });

  it('checks all repository paths by requiring inline-code formatting', () => {
    const withoutCode = guide.replace(/`[^`\r\n]+`/g, '');
    const bare = [...withoutCode.matchAll(/(?:^|[\s(])((?:src|content|docs|tests|public|scripts)\/[a-zA-Z0-9_.\/[\]-]+)/gm)]
      .map((match) => match[1]);
    expect(bare, 'Wrap file and folder paths in backticks so the path test can check them').toEqual([]);
  });

  it('covers the newer lesson routes, games, offline work and logic split', () => {
    const refs = repositoryPaths();
    for (const path of [
      'src/pages/learn/[lesson]/index.astro',
      'src/pages/learn/[lesson]/fill-in.astro',
      'src/pages/learn/[lesson]/organizer.astro',
      'src/pages/play.astro',
      'src/pages/play/stat.astro',
      'src/pages/play/hello-cards.astro',
      'src/islands/SudokuGame.tsx',
      'src/islands/sudoku.ts',
      'src/pages/sw.js.ts',
      'src/scripts/offlineplan.ts',
      'src/scripts/offline.ts',
      'src/content.config.ts',
    ]) expect(refs, path + ' should appear in the guide').toContain(path);
  });
});

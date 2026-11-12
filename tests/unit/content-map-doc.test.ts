import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const contentRoot = new URL('../../content/', import.meta.url);
const doc = readFileSync(new URL('../../docs/CONTENT-MAP.md', import.meta.url), 'utf8');

/** Map top-level folders plus game subfolders, not private local batch folders. */
function contentFolders(root: URL = contentRoot): string[] {
  const top = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const games = top.includes('games')
    ? readdirSync(new URL('games/', root), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `content/games/${entry.name}/`)
    : [];
  return [...top.map((name) => `content/${name}/`), ...games].sort();
}

/** Only the folder column of the guide's Markdown table is authoritative. */
function mappedFolders(markdown: string): { path: string; cells: string[] }[] {
  return markdown.split(/\r?\n/).flatMap((line) => {
    const match = /^\|\s*`(content\/(?:[a-z0-9-]+\/)+)`\s*\|/.exec(line);
    if (!match) return [];
    return [{ path: match[1]!, cells: line.split('|').slice(1, -1).map((cell) => cell.trim()) }];
  });
}

describe('public content folder map', () => {
  it('includes every existing folder exactly once and no folder that is gone', () => {
    const actual = contentFolders();
    const mapped = mappedFolders(doc).map((row) => row.path);
    expect(actual.length).toBeGreaterThan(0);
    expect(new Set(mapped).size, 'duplicate folder rows').toBe(mapped.length);
    expect(mapped.sort(), 'update docs/CONTENT-MAP.md when a content folder changes').toEqual(actual);
  });


  it('ignores locally created private batch folders and other nested files', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'cueory-content-map-'));
    try {
      mkdirSync(join(sandbox, 'batches', 'private-review-batch'), { recursive: true });
      mkdirSync(join(sandbox, 'lessons', 'local-working-copy'), { recursive: true });
      mkdirSync(join(sandbox, 'games', 'pulse', 'nested-draft'), { recursive: true });
      mkdirSync(join(sandbox, 'games', 'cueword'), { recursive: true });
      const folders = contentFolders(pathToFileURL(sandbox + sep));
      expect(folders).toEqual([
        'content/batches/',
        'content/games/',
        'content/games/cueword/',
        'content/games/pulse/',
        'content/lessons/',
      ]);
      expect(folders).not.toContain('content/batches/private-review-batch/');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('explains the purpose, location and publication rule for each folder', () => {
    for (const row of mappedFolders(doc)) {
      expect(row.cells, row.path + ' should have four columns').toHaveLength(4);
      for (const [index, cell] of row.cells.entries()) {
        expect(cell.length, row.path + ' column ' + (index + 1) + ' must explain the folder').toBeGreaterThan(10);
      }
    }
  });

  it('makes the public/privacy boundary clear, especially for review batches', () => {
    expect(doc).toMatch(/repository is \*\*public\*\*/i);
    expect(doc).toMatch(/Never commit real questions, answer keys/i);
    const batches = mappedFolders(doc).find((row) => row.path === 'content/batches/');
    expect(batches).toBeDefined();
    expect(batches!.cells.join(' ')).toMatch(/local/i);
    expect(batches!.cells.join(' ')).toMatch(/not shown/i);
    const legacy = mappedFolders(doc).find((row) => row.path === 'content/games/triage/');
    expect(legacy!.cells.join(' ')).toMatch(/not the current Sudoku/i);
  });
});

describe('content map accessibility and clarity', () => {
  it('uses a clear heading order and a labeled table for screen readers', () => {
    expect(doc.match(/^# .+$/gm)).toHaveLength(1);
    expect(doc).toMatch(/^## Folder guide$/m);
    expect(doc).toMatch(/^## Before adding content$/m);
    expect(doc).toMatch(/^\| Folder \| What belongs there \| Where students see it \| What may be committed \|$/m);
  });

  it('uses descriptive link words and keeps local document links valid', () => {
    const links = [...doc.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    expect(links.length).toBeGreaterThan(0);
    for (const [, label, href] of links) {
      expect(label!.trim()).not.toMatch(/^(here|click here|link)$/i);
      expect(href).not.toMatch(/^(javascript:|data:)/i);
      if (!/^https:\/\//.test(href!)) {
        const target = new URL(href!, new URL('../../docs/', import.meta.url));
        expect(existsSync(target), 'missing linked document: ' + href).toBe(true);
      }
    }
  });

  it('states each folder publication boundary in words, not only appearance', () => {
    for (const row of mappedFolders(doc)) {
      expect(row.cells[3], row.path + ' needs written publication guidance')
        .toMatch(/sample|private|public|local|approved|draft|review|nothing|keep/i);
    }
  });
});

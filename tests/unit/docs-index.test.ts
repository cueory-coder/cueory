import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docsDir = fileURLToPath(new URL('../../docs/', import.meta.url));
const index = readFileSync(join(docsDir, 'README.md'), 'utf8');

interface GuideEntry {
  file: string;
  summary: string;
}

function listedGuides(): GuideEntry[] {
  return index.split(/\r?\n/).filter((line) => line.startsWith('- ')).map((line) => {
    const parts = line.match(/^- \[[^\]]+\]\(([^)]+)\) — (.+)$/);
    if (!parts) throw new Error('Guide entry must be one linked line: ' + line);
    return { file: parts[1], summary: parts[2] };
  });
}

describe('docs index', () => {
  it('lists every top-level Markdown guide, including itself, exactly once', () => {
    const actual = readdirSync(docsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name).sort();
    const listed = listedGuides().map((entry) => entry.file);
    expect(new Set(listed).size, 'Do not list the same guide twice').toBe(listed.length);
    expect(listed.sort()).toEqual(actual);
  });

  it('does not link to a missing or outside document', () => {
    for (const { file } of listedGuides()) {
      expect(file, 'Only direct docs/*.md links belong in this index').toMatch(/^[A-Za-z0-9-]+\.md$/);
      expect(existsSync(join(docsDir, file)), file + ' must exist').toBe(true);
    }
  });

  it('gives each guide a one-line purpose and tells Christian when to read it', () => {
    expect(index).toContain('## For Christian');
    expect(index).toContain('## For builders');
    expect(index).toContain('## Plans and history');
    for (const { file, summary } of listedGuides()) {
      expect(summary, file + ' needs a clear summary').toMatch(/^.{12,}\. \*\*Christian:\*\* .+\.$/);
    }
  });
});

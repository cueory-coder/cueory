import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const contentRoot = join(root, 'content');
const lessonMap = new Set(
  readFileSync(join(root, 'docs/curriculum/medsurg-lesson-map.csv'), 'utf8')
    .split('\n')
    .map((line) => /^"?(U\d{2}-T\d{2}-L\d{2})"?/.exec(line)?.[1])
    .filter((lessonId): lessonId is string => lessonId !== undefined),
);

function jsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'batches' ? [] : jsonFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}

function lessonIds(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(lessonIds);

  return Object.entries(value).flatMap(([key, child]) => {
    if (key === 'lesson_id' || key === 'lessonId') return typeof child === 'string' ? [child] : [];
    if (key === 'lessonIds') return Array.isArray(child) ? child.filter((id): id is string => typeof id === 'string') : [];
    return lessonIds(child);
  });
}

describe('content lesson references', () => {
  it('collects nested lesson_id and lessonIds values without treating unrelated fields as references', () => {
    expect(lessonIds({ lesson_id: 'U01-T01-L01', nested: [{ lessonIds: ['U01-T01-L02'] }] })).toEqual([
      'U01-T01-L01',
      'U01-T01-L02',
    ]);
    expect(lessonIds({ id: 'U99-T99-L99', title: 'sample' })).toEqual([]);
  });

  it('keeps every explicit lesson reference in content and visuals on the curriculum map', () => {
    expect(lessonMap.size).toBeGreaterThan(0);

    for (const file of jsonFiles(contentRoot)) {
      const relativePath = relative(root, file);
      const value = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      const unknown = lessonIds(value).filter((lessonId) => !lessonMap.has(lessonId));
      expect(unknown, `${relativePath}: lesson references`).toEqual([]);
    }
  });
});

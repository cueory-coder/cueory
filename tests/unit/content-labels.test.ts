import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const contentRoot = join(process.cwd(), 'content');
const excludedDirectories = new Set(['batches']);
const allowedStatuses = new Set([
  'sample',
  'placeholder',
  'draft',
  'in_review',
  'published',
  'approved',
]);

function jsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name) ? [] : jsonFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}

function contentLabel(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.status === 'string') return record.status;
  return record.sample === true ? 'sample' : undefined;
}

describe('public content labels', () => {
  it('accepts the explicit sample and review labels used by the content schemas', () => {
    expect(contentLabel({ sample: true })).toBe('sample');
    expect(contentLabel({ status: 'placeholder' })).toBe('placeholder');
    expect(contentLabel({ status: 'draft' })).toBe('draft');
    expect(contentLabel({ status: 'approved' })).toBe('approved');
    expect(contentLabel({ status: '' })).toBe('');
    expect(contentLabel({ title: 'unlabeled' })).toBeUndefined();
  });

  it('parses every tracked content JSON file and requires an explicit label', () => {
    const files = jsonFiles(contentRoot);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const relativePath = relative(process.cwd(), file);
      let value: unknown;
      expect(() => {
        value = JSON.parse(readFileSync(file, 'utf8'));
      }, `${relativePath}: valid JSON`).not.toThrow();

      const label = contentLabel(value);
      expect(label, `${relativePath}: sample, placeholder, or review status`).toBeDefined();
      expect(allowedStatuses.has(label ?? ''), `${relativePath}: recognized content label`).toBe(true);
    }
  });
});

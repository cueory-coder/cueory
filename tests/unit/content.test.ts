import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('../../content/lessons/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('lesson content files', () => {
  it('has at least one lesson', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s has unique sentence ids and a matching file name', (file) => {
    const lesson = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    expect(lesson.id).toBe(file.replace(/\.json$/, ''));
    const ids = lesson.sentences.map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

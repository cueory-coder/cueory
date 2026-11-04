import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const statusNotes = resolve(process.cwd(), 'docs/status/in-review');
const portableName = /^(?:README|[a-z0-9][a-z0-9-]*)\.md$/;

describe('status-note filenames', () => {
  it('uses portable lowercase names with hyphens', () => {
    const files = readdirSync(statusNotes);
    expect(files.every(file => portableName.test(file))).toBe(true);
  });
});

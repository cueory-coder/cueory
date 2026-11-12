import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const folder = resolve('docs/status/in-review');
const notes = readdirSync(folder).filter((name) => name.endsWith('.md') && name !== 'README.md');

describe('status-note labels follow AGENTS.md', () => {
  it('keeps the guide and examples consistent with the required lowercase labels', () => {
    const rules = readFileSync(resolve('AGENTS.md'), 'utf8');
    expect(rules).toContain('one `status:` line');
    expect(rules).toContain('one `decision:` line');
    const guide = readFileSync(resolve(folder, 'README.md'), 'utf8');
    expect(guide).toContain('one `status:` line');
    expect(guide).toContain('one `decision:` line');
    expect(guide).toMatch(/^status: \S.+$/m);
    expect(guide).toMatch(/^decision: \S.+$/m);
    expect(guide).not.toMatch(/STATUS:|DECISION:|case-insensitive/);
  });

  it.each(notes)('%s has one status and lowercase labels', (name) => {
    const content = readFileSync(resolve(folder, name), 'utf8');
    const statuses = content.match(/^status: \S.+$/gm) ?? [];
    expect(statuses).toHaveLength(1);
    const labels = [...content.matchAll(/^(status|decision):/gim)].map(([label]) => label);
    expect(labels.every((label) => label === label.toLowerCase())).toBe(true);
  });
});

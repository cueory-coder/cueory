import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { indexablePages } from '../../src/config/routes';

const root = process.cwd();
const source = readFileSync(join(root, 'src/pages/404.astro'), 'utf8');
const quickLinksBlock = source.match(/const quickLinks = \[([\s\S]*?)\] as const;/)?.[1];

function nextSteps(): { href: string; label: string }[] {
  if (!quickLinksBlock) return [];
  return [...quickLinksBlock.matchAll(/\{ href: '([^']+)', label: '([^']+)' \}/g)]
    .map((match) => ({ href: match[1]!, label: match[2]! }));
}

describe('S1: 404 recovery page', () => {
  it('provides clear next steps and an accessible search with one heading', () => {
    expect(source).toContain('aria-labelledby="not-found-title"');
    expect(source).toContain('id="not-found-title"');
    expect([...source.matchAll(/<h1\b/g)]).toHaveLength(1);
    expect(source).toContain('role="search"');
    expect(source).toContain('aria-label="search cueory"');
    expect(source).toContain('aria-controls="not-found-search-results"');
    expect(source).toContain('noindex');
    expect(nextSteps().map(({ label }) => label)).toEqual(['home', 'learn', 'play', 'support']);
  });

  it('keeps every recovery link inside an existing indexable built route', () => {
    const steps = nextSteps();
    expect(steps).toHaveLength(4);
    for (const { href } of steps) {
      expect(indexablePages, href + ' must be an indexable route').toContain(href);
      const base = href === '/' ? 'index' : href.slice(1);
      const paths = [
        join(root, 'src/pages', base + '.astro'),
        join(root, 'src/pages', base, 'index.astro'),
      ];
      expect(paths.some((candidate) => existsSync(candidate)), href + ' needs a real Astro page').toBe(true);
    }
  });
});

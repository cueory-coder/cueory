import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../src/components/SiteFooter.astro', import.meta.url), 'utf8');

describe('site footer navigation', () => {
  it('marks the current footer page for assistive technology', () => {
    expect(source).toContain("aria-current={link.href === Astro.url.pathname ? 'page' : undefined}");
  });
});

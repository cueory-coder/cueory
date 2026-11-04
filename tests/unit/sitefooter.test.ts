import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicPath } from '../../src/scripts/footer';

const source = readFileSync(new URL('../../src/components/SiteFooter.astro', import.meta.url), 'utf8');

describe('site footer navigation', () => {
  it('marks the current footer page using its public route, not the built filename', () => {
    expect(source).toContain("aria-current={link.href === publicPath(Astro.url.pathname) ? 'page' : undefined}");

    for (const page of ['privacy', 'terms', 'disclaimer', 'support']) {
      expect(publicPath(`/${page}.html`)).toBe(`/${page}`);
      expect(publicPath(`/${page}`)).toBe(`/${page}`);
    }
    expect(publicPath('/index.html')).toBe('/');
  });
});

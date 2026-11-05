import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHeldPath } from '../../scripts/automerge/decide.ts';
import { indexablePages } from '../../src/config/routes.ts';

// Integration guard for the two founder-held changes combined on staging:
// #601 keeps draft legal pages out of search, and #607 prevents those
// indexability decisions from bypassing founder approval in either mode.
const draftLegalPages = [
  { route: '/privacy', file: 'src/pages/privacy.astro' },
  { route: '/terms', file: 'src/pages/terms.astro' },
  { route: '/disclaimer', file: 'src/pages/disclaimer.astro' },
] as const;

describe('staging integration: draft legal indexing and founder-held paths', () => {
  it.each(draftLegalPages)('$route remains noindex, absent from sitemap, and founder-held', ({ route, file }) => {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    expect(source).toMatch(/<Layout\b[^>]*\bnoindex\b/);
    expect(indexablePages).not.toContain(route);
    expect(isHeldPath(file, 'prelaunch')).toBe(true);
    expect(isHeldPath(file, 'launched')).toBe(true);
  });

  it('holds the public indexability allowlist in both modes without blocking public support', () => {
    expect(isHeldPath('src/config/routes.ts', 'prelaunch')).toBe(true);
    expect(isHeldPath('src/config/routes.ts', 'launched')).toBe(true);
    expect(indexablePages).toContain('/support');
    expect(indexablePages).toContain('/');
  });
});

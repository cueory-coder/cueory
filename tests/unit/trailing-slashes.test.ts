/** Task 269: run after npm run build. Keep route URL style consistent. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function htmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  });
}

function urlStyle(value: string): 'root' | 'trailing' | 'non-trailing' {
  const path = new URL(value, site.url).pathname.replace(/\/index\.html$/, '/');
  if (path === '/') return 'root';
  return path.endsWith('/') ? 'trailing' : 'non-trailing';
}

function internalAnchorHrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]!)
    .filter((href) => href.startsWith('/') && !href.startsWith('//'));
}

describe('route URL style', () => {
  it('keeps the root as the only trailing-slash route', () => {
    expect(urlStyle('/')).toBe('root');
    expect(urlStyle('/learn/study-skills')).toBe('non-trailing');
    expect(urlStyle('/learn/study-skills/')).toBe('trailing');
  });

  it('uses one trailing-slash style for canonical URLs and internal links', () => {
    expect(existsSync(dist), 'dist is missing: run npm run build before npm test').toBe(true);

    const mismatches: string[] = [];
    const nonRootStyles = new Set<'trailing' | 'non-trailing'>();
    for (const page of htmlFiles(dist)) {
      const html = readFileSync(page, 'utf8');
      const canonical = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
      if (!canonical) {
        mismatches.push(`${page}: missing canonical URL`);
        continue;
      }

      const canonicalStyle = urlStyle(canonical);
      if (canonicalStyle !== 'root') nonRootStyles.add(canonicalStyle);
      for (const href of internalAnchorHrefs(html)) {
        const hrefWithoutFragment = href.split('#', 1)[0] || '/';
        const hrefStyle = urlStyle(hrefWithoutFragment);
        if (hrefStyle !== 'root') nonRootStyles.add(hrefStyle);
      }
    }

    expect([...nonRootStyles], 'non-root route URLs must use the established non-trailing-slash style').toEqual(['non-trailing']);
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });
});

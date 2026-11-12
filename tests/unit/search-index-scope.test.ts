/** W18-2 (#64): inspect npm build output AFTER Pagefind builds its index. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSearchableRoute, searchRoute } from '../../src/config/searchscope';

const DIST = resolve('dist');

/** Avoid accidentally scanning Pagefind's own assets as site pages. */
function builtPages(directory = DIST): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? builtPages(path) : entry.isFile() && path.endsWith('.html') ? [path] : [];
  }).sort();
}

function builtRoute(file: string): string {
  const path = relative(DIST, file).replaceAll('\\', '/');
  return searchRoute(`/${path}`) ?? '/invalid-path';
}

/** Check real HTML opening tags, not commented-out or script-string lookalikes. */
function pagefindMain(html: string): { body: boolean; title: boolean } {
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, '');
  const mains = [...uncommented.matchAll(/<main\b[^>]*>/gi)].map((match) => match[0]);
  return {
    body: mains.some((tag) => /\sdata-pagefind-body(?=[\s=/>])/.test(tag)),
    title: mains.some((tag) => /\sdata-pagefind-meta\s*=\s*["']title:/.test(tag)),
  };
}

function hasNoindexMeta(html: string): boolean {
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, '');
  const metaTags = [...uncommented.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  return metaTags.some((tag) => {
    const name = /\bname\s*=\s*(["'])robots\1/i.test(tag);
    const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? '';
    return name && /(?:^|[,\s])noindex(?:$|[,\s])/i.test(content);
  });
}

describe('W18-2: site-search scope', () => {
  it('uses the sitemap noindex rule and always rejects private paths or unknown origins', () => {
    expect(isSearchableRoute('/')).toBe(true);
    expect(isSearchableRoute('/learn/study-skills/cards')).toBe(true);
    for (const privateRoute of [
      '/preview/states', '/account', '/account/two-factor', '/admin/flags',
      '/auth/callback', '/signin', '/signup', '/privacy', '/terms',
      '/play/stat', '/play/hello-cards', '/does-not-exist',
      'https://other.example/learn',
    ]) expect(isSearchableRoute(privateRoute), privateRoute).toBe(false);
    expect(searchRoute('/learn/study-skills/index.html#unit')).toBe('/learn/study-skills');
    expect(searchRoute('https://other.example/')).toBeUndefined();
  });

  it('identifies Pagefind markers and noindex metadata in representative HTML', () => {
    expect(pagefindMain('<main data-pagefind-body="" data-pagefind-meta="title:home">ok</main>'))
      .toEqual({ body: true, title: true });
    expect(pagefindMain('<!-- <main data-pagefind-body> --><main>hidden</main>'))
      .toEqual({ body: false, title: false });
    expect(hasNoindexMeta('<meta name="robots" content="noindex, nofollow" />')).toBe(true);
    expect(hasNoindexMeta('<meta content="nofollow, noindex" name="robots" />')).toBe(true);
    expect(hasNoindexMeta('<meta name="description" content="noindex is not a directive" />')).toBe(false);
    expect(hasNoindexMeta('<!-- <meta name="robots" content="noindex" /> -->')).toBe(false);
  });

  it.skipIf(!existsSync(join(DIST, 'index.html')))('excludes every noindex, preview, account, admin and auth page from the built Pagefind index', () => {
    expect(existsSync(join(DIST, 'index.html')), 'run npm run build before this test').toBe(true);
    const files = builtPages();
    expect(files.length).toBeGreaterThan(0);
    const searchable: string[] = [];
    const failures: string[] = [];
    for (const file of files) {
      const route = builtRoute(file);
      const html = readFileSync(file, 'utf8');
      const indexed = pagefindMain(html);
      const noindex = hasNoindexMeta(html);
      const expected = isSearchableRoute(route) && !noindex;
      if (indexed.body !== expected) failures.push(`${route}: Pagefind body=${indexed.body}, expected ${expected} (noindex=${noindex})`);
      if (indexed.title !== expected) failures.push(`${route}: Pagefind title metadata=${indexed.title}, expected ${expected}`);
      if (indexed.body) searchable.push(route);
    }
    expect(failures).toEqual([]);

    // Pagefind documents that once any data-pagefind-body exists, only pages
    // with that marker enter its index. Verify the actual built page count as well.
    const indexPath = join(DIST, 'pagefind', 'pagefind-entry.json');
    expect(existsSync(indexPath), 'Pagefind output missing; run npm run build').toBe(true);
    const entry = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      languages?: { en?: { page_count?: number } };
    };
    expect(entry.languages?.en?.page_count).toBe(searchable.length);
    expect(searchable).toContain('/');
    expect(searchable.every((route) => isSearchableRoute(route))).toBe(true);
  });
});

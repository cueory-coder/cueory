import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = resolve('dist');
function pages(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const path = join(folder, entry.name);
    return entry.isDirectory() ? pages(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]));
}
function problems(html: string, home: boolean): string[] {
  // Scripts/comments can contain markup-shaped strings that are not DOM images.
  const markup = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  return [...markup.matchAll(/<img\b[^>]*>/gi)].flatMap(([tag]) => {
    const a = attributes(tag);
    const errors: string[] = [];
    if (!Object.hasOwn(a, 'alt')) errors.push('missing alt');
    else if (a.alt === '' && a['aria-hidden'] !== 'true' && a.role !== 'presentation') errors.push('empty alt without decorative marker');
    for (const dimension of ['width', 'height']) if (!/^[1-9]\d*$/.test(a[dimension] ?? '')) errors.push(`missing/invalid ${dimension}`);
    // Static HTML cannot determine the fold. Use a stricter policy: lazy load
    // every image except explicitly marked home hero brand artwork.
    const hero = home && a['data-image-priority'] === 'hero' && /^\/brand\/v1\/logo-full-(light|dark)-960\.png$/.test(a.src ?? '');
    if (a.loading !== 'lazy' && !(hero && a.loading === 'eager')) errors.push('not lazy or approved home hero');
    return errors.map(error => `${a.src ?? '<no src>'}: ${error}`);
  });
}

describe('Task 207 built image markup', () => {
  for (const path of pages(dist)) {
    it(relative(dist, path), () => expect(problems(readFileSync(path, 'utf8'), path === join(dist, 'index.html'))).toEqual([]));
  }
  it('rejects missing attributes and undeclared decorative images', () => {
    expect(problems('<img src="/x" alt="">', false)).toHaveLength(4);
    expect(problems('<img src="/x" alt="diagram" width="1" height="1" loading="lazy">', false)).toEqual([]);
    expect(problems('<img src="/x" alt="" role="presentation" width="1" height="1" loading="lazy">', false)).toEqual([]);
  });
  it('does not permit arbitrary eager images or markup in scripts/comments', () => {
    expect(problems('<img src="/x" alt="x" width="1" height="1" loading="eager" data-image-priority="hero">', true)).toHaveLength(1);
    expect(problems('<!-- <img> --><script>const x = "<img>";</script>', false)).toEqual([]);
  });
});

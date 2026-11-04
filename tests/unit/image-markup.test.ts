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
function extractImages(html: string): string[] {
  const images: string[] = [];
  const lower = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    const nextTag = html.indexOf('<', i);
    if (nextTag === -1) break;
    if (html.startsWith('<!--', nextTag)) {
      const endComment = html.indexOf('-->', nextTag + 4);
      i = endComment === -1 ? html.length : endComment + 3;
    } else if (lower.startsWith('<script', nextTag) && /[\s/>]/.test(html[nextTag + 7] ?? '')) {
      const openEnd = html.indexOf('>', nextTag);
      if (openEnd === -1) break;
      const closeScript = lower.indexOf('</script', openEnd);
      if (closeScript === -1) break;
      const endTagEnd = html.indexOf('>', closeScript + 8);
      i = endTagEnd === -1 ? html.length : endTagEnd + 1;
    } else if (lower.startsWith('<img', nextTag) && /[\s/>]/.test(html[nextTag + 4] ?? '')) {
      const endImg = html.indexOf('>', nextTag);
      if (endImg === -1) {
        images.push(html.slice(nextTag));
        break;
      }
      images.push(html.slice(nextTag, endImg + 1));
      i = endImg + 1;
    } else {
      i = nextTag + 1;
    }
  }
  return images;
}

function problems(html: string): string[] {
  return extractImages(html).flatMap((tag) => {
    const a = attributes(tag);
    const errors: string[] = [];
    if (!Object.hasOwn(a, 'alt')) errors.push('missing alt');
    else if (a.alt === '' && a['aria-hidden'] !== 'true' && a.role !== 'presentation') {
      errors.push('empty alt without decorative marker');
    }
    for (const dimension of ['width', 'height']) {
      if (!/^[1-9]\d*$/.test(a[dimension] ?? '')) errors.push(`missing/invalid ${dimension}`);
    }
    // Static HTML cannot determine the fold. Lazy-load every image except explicitly
    // approved above-the-fold brand artwork (header logos and the home hero).
    const isAboveFoldBrand = (a['data-image-priority'] === 'header' || a['data-image-priority'] === 'hero') &&
      /^\/brand\/v1\/(logo-full|emblem)-(light|dark)-(960|192)\.png$/.test(a.src ?? '');
    if (a.loading !== 'lazy' && !(isAboveFoldBrand && a.loading === 'eager')) {
      errors.push('not lazy or approved above-the-fold brand image');
    }
    return errors.map((error) => `${a.src ?? '<no src>'}: ${error}`);
  });
}

describe('Task 207 built image markup', () => {
  for (const path of pages(dist)) {
    it(relative(dist, path), () => expect(problems(readFileSync(path, 'utf8'))).toEqual([]));
  }
  it('rejects missing attributes and undeclared decorative images', () => {
    expect(problems('<img src="/x" alt="">')).toHaveLength(4);
    expect(problems('<img src="/x" alt="diagram" width="1" height="1" loading="lazy">')).toEqual([]);
    expect(problems('<img src="/x" alt="" role="presentation" width="1" height="1" loading="lazy">')).toEqual([]);
  });
  it('does not permit arbitrary eager images or markup in scripts/comments', () => {
    expect(problems('<img src="/x" alt="x" width="1" height="1" loading="eager" data-image-priority="header">')).toHaveLength(1);
    expect(problems('<!-- <img> --><script>const x = "<img>";</script>')).toEqual([]);
  });
  it('ignores raw-text/comment image lookalikes without joining fragments', () => {
    const valid = '<img src="/real" alt="real" width="1" height="1" loading="lazy">';
    expect(problems('<script>"<img>"</script\t\n bar>' + valid)).toEqual([]);
    expect(problems('<!-- <img> --><!-- <scr -->ipt><img>')).toHaveLength(4);
    expect(problems('<script>"<img>"')).toEqual([]);
    expect(problems('<!-- <img>')).toEqual([]);
  });

});

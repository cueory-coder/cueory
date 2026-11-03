/** Task 246: inspect generated HTML after npm run build. No additional dependencies. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function decodeAttribute(value: string): string {
  return value.replace(/&#(x[\da-f]+|\d+);?|&(Tab|NewLine|lowbar|UnderBar);/gi, (whole, numeric: string | undefined, named: string | undefined) => {
    if (numeric) {
      const point = Number.parseInt(numeric.replace(/^x/i, ''), /^x/i.test(numeric) ? 16 : 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return named === 'Tab' ? '\t' : named === 'NewLine' ? '\n' : '_';
  });
}

/** Follow opening tags in order, skipping comments and HTML raw-text elements. */
function unsafeBlankLinks(html: string): string[] {
  const failures: string[] = [];
  const lower = html.toLowerCase();
  const rawText = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf('<', at);
    if (open < 0) break;
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      at = end < 0 ? html.length : end + 3;
      continue;
    }
    let end = open + 1;
    let quote = '';
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) break;
    at = end + 1;
    const tag = /^<([a-z][\w:-]*)\b/i.exec(html.slice(open, end + 1));
    if (!tag) continue;
    const name = tag[1].toLowerCase();
    if (name === 'a' || name === 'area') {
      const attrs = new Map<string, string>();
      for (const match of html.slice(open + tag[0].length, end).matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        const key = match[1].toLowerCase();
        if (!attrs.has(key)) attrs.set(key, decodeAttribute(match[2] ?? match[3] ?? match[4] ?? ''));
      }
      if (attrs.get('target')?.toLowerCase() === '_blank' &&
          !attrs.get('rel')?.toLowerCase().split(/[\t\n\f\r ]+/).includes('noopener')) {
        failures.push(`${name} href=${attrs.get('href') ?? '(missing)'} at offset ${open}`);
      }
    }
    if (rawText.has(name)) {
      const close = new RegExp(`</${name}(?=[\\s/>])`, 'g');
      close.lastIndex = at;
      at = close.exec(lower)?.index ?? html.length;
    }
  }
  return failures;
}

describe('new-tab link checker fixtures', () => {
  it('rejects missing and lookalike rel tokens, including numeric attribute references', () => {
    expect(unsafeBlankLinks('<a href="/one" target="_blank"><area href=/two target=&#95;blank rel=noopener-extra>')).toHaveLength(2);
  });
  it('accepts case-insensitive tokens, extra rel tokens and normal same-tab links', () => {
    expect(unsafeBlankLinks('<a TARGET="_BLANK" rel="external NOOPENER noreferrer" title=">"><a target=_self><a target=_blank rel="no&#111;pener">')).toEqual([]);
  });
  it('ignores fake links in comments and raw text, and respects the first duplicate attribute', () => {
    expect(unsafeBlankLinks('<!-- <a target=_blank> --><script>"<a target=_blank>"</script><textarea><a target=_blank></textarea><a target=_self target=_blank>')).toEqual([]);
  });
});

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
function htmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const file = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.isFile() && file.endsWith('.html') ? [file] : [];
  });
}

describe('built new-tab links', () => {
  // Missing build output fails rather than silently skipping the required route-wide check.
  const pages = htmlFiles(dist);
  it('has built pages to inspect', () => expect(pages.length).toBeGreaterThan(0));
  for (const file of pages) {
    it(`${relative(dist, file)}: target=_blank links include noopener`, () => {
      expect(unsafeBlankLinks(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});

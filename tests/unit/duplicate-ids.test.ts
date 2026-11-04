/** Task 284: every built HTML page has unique element identifiers. Run after build. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function identifier(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]*);?/gi, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = /^#x/i.test(entity);
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd';
    }
    if (Object.hasOwn(named, entity)) return named[entity];
    // Generated identifiers are ASCII. Fail closed if new named references need decoding.
    throw new Error(`Unsupported character reference in id: ${whole}`);
  });
}

function duplicateIds(html: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
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
    const attrs = html.slice(open + tag[0].length, end);
    for (const match of attrs.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      if (match[1].toLowerCase() !== 'id') continue;
      const id = identifier(match[2] ?? match[3] ?? match[4] ?? '');
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
      break; // HTML uses the first occurrence of an attribute on an element.
    }
    if (rawText.has(name)) {
      const close = new RegExp(`</${name}(?=[\\s/>])`, 'g');
      close.lastIndex = at;
      at = close.exec(lower)?.index ?? html.length;
    }
  }
  return [...duplicates].sort();
}

describe('duplicate identifier regression fixtures', () => {
  it('finds repeated identifiers across hidden and visible elements and numeric references', () => {
    expect(duplicateIds('<div id="one"><span hidden ID=one><p id="&#111;ne">')).toEqual(['one']);
  });
  it('keeps identifiers case-sensitive and respects the first duplicate attribute', () => {
    expect(duplicateIds('<div id="one" id="two"><span id=One><p id=two>')).toEqual([]);
  });
  it('ignores lookalikes in comments, raw text and other quoted attributes', () => {
    expect(duplicateIds('<!-- <p id=x><p id=x> --><script>"<p id=x><p id=x>"</script><textarea><p id=x><p id=x></textarea><p title=\'id="x" >\' id="real">')).toEqual([]);
  });
  it('decodes the supported named references and fails closed on unknown ones', () => {
    expect(duplicateIds('<p id="a&amp;b"><p id="a&#38;b">')).toEqual(['a&b']);
    expect(() => duplicateIds('<p id="&eacute;">')).toThrow('Unsupported character reference');
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

describe('built page identifiers', () => {
  const pages = htmlFiles(dist); // A missing build fails instead of silently skipping pages.
  it('has built pages to inspect', () => expect(pages.length).toBeGreaterThan(0));
  for (const file of pages) {
    it(`${relative(dist, file)}: contains no repeated id`, () => {
      expect(duplicateIds(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});

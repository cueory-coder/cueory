/** Task 285: every aria-labelledby, aria-describedby, aria-controls and for points to an id on the same page. */
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
    throw new Error(`Unsupported character reference in id: ${whole}`);
  });
}

export function brokenAriaRefs(html: string): string[] {
  const ids = new Set<string>();
  const refs: { attr: string; id: string }[] = [];
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
      const attrName = match[1].toLowerCase();
      const val = identifier(match[2] ?? match[3] ?? match[4] ?? '');

      if (attrName === 'id') {
        ids.add(val);
      } else if (attrName === 'aria-labelledby' || attrName === 'aria-describedby' || attrName === 'aria-controls') {
        for (const token of val.split(/\s+/)) {
          if (token) refs.push({ attr: attrName, id: token });
        }
      } else if (attrName === 'for') {
        const token = val.trim();
        if (token) refs.push({ attr: 'for', id: token });
      }
    }

    if (rawText.has(name)) {
      const close = new RegExp(`</${name}(?=[\\s/>])`, 'g');
      close.lastIndex = at;
      at = close.exec(lower)?.index ?? html.length;
    }
  }

  const missing: string[] = [];
  for (const { attr, id } of refs) {
    if (!ids.has(id)) {
      missing.push(`${attr} -> ${id}`);
    }
  }
  return missing;
}

describe('aria and for reference regression fixtures', () => {
  it('passes when every reference targets an existing id', () => {
    const html = '<label for="inp">Name</label><input id="inp" aria-describedby="desc" aria-controls="panel"><div id="desc">Help</div><div id="panel">Content</div>';
    expect(brokenAriaRefs(html)).toEqual([]);
  });

  it('detects missing target IDs across single and multiple reference values', () => {
    const html = '<button aria-labelledby="title missing-sub" aria-controls="missing-panel">Go</button><div id="title">T</div>';
    expect(brokenAriaRefs(html)).toEqual(['aria-labelledby -> missing-sub', 'aria-controls -> missing-panel']);
  });

  it('detects missing for references on labels', () => {
    const html = '<label for="missing-input">Email</label>';
    expect(brokenAriaRefs(html)).toEqual(['for -> missing-input']);
  });

  it('ignores references inside comments, scripts, and other attributes', () => {
    const html = '<!-- <label for="fake"></label> --><script>const x = \'<label for="fake">\';</script><div id="real"><button aria-describedby="real">Ok</button></div>';
    expect(brokenAriaRefs(html)).toEqual([]);
  });
});

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
function htmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const file = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.isFile() && file.endsWith('.html') ? [file] : [];
  });
}

describe('built page aria and for references', () => {
  const pages = htmlFiles(dist);
  it('has built pages to inspect', () => expect(pages.length).toBeGreaterThan(0));
  for (const file of pages) {
    it(`${relative(dist, file)}: resolves all aria and for references`, () => {
      expect(brokenAriaRefs(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});

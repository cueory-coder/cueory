import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = resolve('dist');
const textTypes = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt', '.webmanifest']);
function textFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? textFiles(path) : textTypes.has(extname(path)) ? [path] : [];
  });
}
const namespaces = new Map([
  ['http://www.w3.org/1998/Math/MathML', 'MathML namespace identifier used by React, not a resource request'],
  ['http://www.w3.org/2000/svg', 'SVG namespace identifier, not a resource request'],
  ['http://www.w3.org/1999/xlink', 'XLink namespace identifier, not a resource request'],
  ['http://www.w3.org/1999/xhtml', 'HTML namespace identifier, not a resource request'],
  ['http://www.w3.org/XML/1998/namespace', 'XML namespace identifier, not a resource request'],
  ['http://www.sitemaps.org/schemas/sitemap/0.9', 'Sitemap namespace identifier, not a resource request'],
]);
function unapproved(text: string, path: string): string[] {
  // Accept JSON's escaped slash syntax too. Do not rewrite or sanitize HTML.
  const literals = text.match(/http:(?:\\?\/){2}[^\s"'<>\\x60)\\]}]+/gi) ?? [];
  return literals.map(url => url.split('\\/').join('/')).filter(url => {
    if (namespaces.has(url)) return false;
    // Preserve upstream font licenses verbatim. This is a license reference,
    // never an executable script, style, image or document resource.
    if (/^fonts\/(?:lato|bodoni-moda|kalam)-OFL\.txt$/.test(path) && url === 'http://scripts.sil.org/OFL') return false;
    // The bundled Supabase auth SDK contains its upstream local-development
    // default. Production uses the validated, supplied project URL, not this
    // default (src/islands/supabaseclient.ts and supabaseenv.ts).
    if (/^_astro\/dist\.[\w-]+\.js$/.test(path) && url === 'http://localhost:9999') return false;
    // These exact loopback strings are examples in the configuration error
    // message in supabaseenv.ts, not fetch targets.
    if (/^_astro\/supabaseclient\.[\w-]+\.js$/.test(path) && ['http://localhost', 'http://127.0.0.1'].includes(url)) return false;
    return true;
  });
}

describe('Task 247 no mixed-content HTTP literals in built text assets', () => {
  for (const path of textFiles(dist)) {
    it(relative(dist, path), () => expect(unapproved(readFileSync(path, 'utf8'), relative(dist, path))).toEqual([]));
  }
  it('rejects remote HTTP resources and namespace lookalikes', () => {
    expect(unapproved('<img src="http://example.test/image.png">', 'index.html')).toEqual(['http://example.test/image.png']);
    expect(unapproved('"http:\\/\\/example.test/a"', '_astro/a.js')).toEqual(['http://example.test/a']);
    expect(unapproved('http://www.w3.org/2000/svg/evil', 'index.html')).toHaveLength(1);
    expect(unapproved('http://scripts.sil.org/OFL', 'index.html')).toHaveLength(1);
  });
  it('allows only exact namespace identifiers and verbatim font-license references', () => {
    expect(unapproved('<svg xmlns="http://www.w3.org/2000/svg">', 'index.html')).toEqual([]);
    expect(unapproved('http://scripts.sil.org/OFL', 'fonts/lato-OFL.txt')).toEqual([]);
    expect(unapproved('https://example.test', 'index.html')).toEqual([]);
    expect(unapproved('http://localhost:9999', 'index.html')).toHaveLength(1);
    expect(unapproved('http://localhost:9999', '_astro/dist.hash.js')).toEqual([]);
    expect(unapproved('http://localhost:9999/evil', '_astro/dist.hash.js')).toHaveLength(1);
  });
  it('consumes escaped path segments before applying exact-match exceptions', () => {
    expect(unapproved('"http:\\/\\/localhost:9999\\/evil"', '_astro/dist.hash.js')).toEqual(['http://localhost:9999/evil']);
    expect(unapproved('"http:\\/\\/www.w3.org\\/2000\\/svg"', 'index.html')).toEqual([]);
    expect(unapproved('"http:\\/\\/www.w3.org\\/2000\\/svg\\/evil"', 'index.html')).toHaveLength(1);
  });
});

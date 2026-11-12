/** Task 190: run after npm run build. No network requests or new dependencies. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeHTMLAttribute } from 'entities';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

type Reference = { tag: string; attribute: 'href' | 'src'; value: string };

/** Read actual opening tags, not lookalike links inside comments, scripts or styles. */
function references(html: string): Reference[] {
  const found: Reference[] = [];
  const lower = html.toLowerCase();
  const rawText = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'template']);
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
    const seen = new Set<string>();
    for (const match of attrs.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const attribute = match[1].toLowerCase();
      if (seen.has(attribute)) continue;
      seen.add(attribute);
      if (attribute !== 'href' && attribute !== 'src') continue;
      found.push({ tag: name, attribute, value: decodeHTMLAttribute(match[2] ?? match[3] ?? match[4] ?? '') });
    }
    if (rawText.has(name)) {
      const closingTag = new RegExp(`</${name}(?=[\\s/>])`, 'g');
      closingTag.lastIndex = at;
      at = closingTag.exec(lower)?.index ?? html.length;
    }
  }
  return found;
}

function htmlFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(root, file) : entry.isFile() && file.endsWith('.html') ? [relative(root, file).split(sep).join('/')] : [];
  }).sort();
}

/** Match Astro's file output routes as well as directory/index output in fixtures. */
function pagePath(file: string): string {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return '/' + file.slice(0, -'index.html'.length);
  return '/' + file.replace(/\.html$/, '');
}

function missingReference(value: string, from: string, files: ReadonlySet<string>, origin = site.url): string | null {
  if (value.trim().startsWith('#')) return null;
  let url: URL;
  try { url = new URL(value, new URL(pagePath(from), origin)); }
  catch { return 'invalid URL'; }
  if (url.origin !== new URL(origin).origin || !['http:', 'https:'].includes(url.protocol)) return null;
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return 'invalid URL encoding'; }
  if (pathname.includes('\0') || pathname.includes('\\')) return 'invalid file path';
  // URL resolution already handles dot segments. Normalize after decoding too, without escaping dist.
  const path = posix.normalize('/' + pathname).replace(/^\/+/, '').replace(/\/$/, '');
  const candidates = path ? [path, `${path}.html`, `${path}/index.html`] : ['index.html'];
  return candidates.some(candidate => files.has(candidate)) ? null : `missing ${url.pathname}`;
}


/** Read DOM IDs from actual opening tags, never comments or raw-text elements. */
function elementIds(html: string): Set<string> {
  const ids = new Set<string>();
  // ASCII-only case folding preserves offsets even when HTML contains Unicode.
  const lower = html.replace(/[A-Z]/g, char => char.toLowerCase());
  const rawText = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'template']);
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
    for (const match of attrs.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+)))?/g)) {
      if (match[1].toLowerCase() !== 'id') continue;
      ids.add(decodeHTMLAttribute(match[2] ?? match[3] ?? match[4] ?? ''));
    }
    if (rawText.has(name)) {
      const closingTag = new RegExp('</' + name + '(?=[\\s/>])', 'g');
      closingTag.lastIndex = at;
      at = closingTag.exec(lower)?.index ?? html.length;
    }
  }
  return ids;
}

/** Check fragments in navigational anchors; the existing checker handles missing files. */
function missingFragment(
  value: string,
  from: string,
  pages: ReadonlyMap<string, ReadonlySet<string>>,
  origin = site.url,
): string | null {
  if (!value.includes('#')) return null;
  let url: URL;
  try { url = new URL(value, new URL(pagePath(from), origin)); }
  catch { return 'invalid URL'; }
  if (url.origin !== new URL(origin).origin || !['http:', 'https:'].includes(url.protocol)) return null;
  if (!url.hash || url.hash === '#') return null; // A bare # scrolls to the top.
  let fragment: string;
  let pathname: string;
  try {
    fragment = decodeURIComponent(url.hash.slice(1));
    pathname = decodeURIComponent(url.pathname);
  } catch { return 'invalid fragment encoding'; }
  if (pathname.includes('\0') || pathname.includes('\\')) return 'invalid file path';
  // #top and text fragments work without a matching DOM id.
  if (fragment.toLowerCase() === 'top' || fragment.startsWith(':~:text=')) return null;
  fragment = fragment.split(':~:')[0];
  const path = posix.normalize('/' + pathname).replace(/^\/+/, '').replace(/\/$/, '');
  const candidates = path ? [path, path + '.html', path + '/index.html'] : ['index.html'];
  const page = candidates.find(candidate => pages.has(candidate));
  if (!page) return null; // Existing missingReference() reports missing pages and files.
  return pages.get(page)?.has(fragment) ? null : 'missing fragment #' + fragment + ' on ' + page;
}

describe('internal reference checker regression fixtures', () => {
  const files = new Set(['index.html', 'learn/index.html', 'learn/lesson.html', 'learn/cards.html', 'images/café.png', 'images/a&b.svg', 'assets/app.js', 'file.txt', 'images/name#one.png']);

  it('reads quoted/unquoted attributes, entities, uppercase names and greater-than inside quotes', () => {
    expect(references(`<a HREF='/learn?one=1&amp;two=2' title='>'><img src=/images/caf&eacute;.png><script src="/assets/app.js"></script>`)).toEqual([
      { tag: 'a', attribute: 'href', value: '/learn?one=1&two=2' },
      { tag: 'img', attribute: 'src', value: '/images/café.png' },
      { tag: 'script', attribute: 'src', value: '/assets/app.js' },
    ]);
  });

  it('skips inert template links but still validates live anchors', () => {
    const html = '<template><a href="#missing"></a><a href="/missing"></a></template>'
      + '<a href="#main"></a><main id="main"></main>';
    const refs = references(html);
    expect(refs).toEqual([{ tag: 'a', attribute: 'href', value: '#main' }]);
    const pages = new Map([['index.html', elementIds(html)]]);
    expect(refs.map(ref => missingFragment(ref.value, 'index.html', pages))).toEqual([null]);
    expect(missingFragment('#missing', 'index.html', pages))
      .toBe('missing fragment #missing on index.html');
  });

  it('ignores fake attributes in comments, raw text, unrelated attributes and text nodes', () => {
    const html = `<!-- <img src="/missing"> --><script>const x='</scripted><a href="/missing">';</script><style>p{content:'<img src="/missing">'}</style><textarea><a href="/missing"></textarea><p data-src="/missing" title='href="/missing"'>href="/missing"</p><noscript><img src="/file.txt"></noscript>`;
    expect(references(html)).toEqual([{ tag: 'img', attribute: 'src', value: '/file.txt' }]);
  });

  it.each([
    ['/', 'index.html'], ['/learn', 'index.html'], ['/learn/', 'index.html'],
    ['/learn/index.html', 'index.html'], ['/learn/lesson.html', 'index.html'],
    ['/learn/lesson?next=/missing#part', 'index.html'], ['cards?x=1#part', 'learn/lesson.html'],
    ['../images/caf%C3%A9.png', 'learn/lesson.html'], ['/images/a&b.svg', 'index.html'],
    ['/images/name%23one.png', 'index.html'], ['https://cueory.app/file.txt?q=1', 'index.html'],
    ['', 'learn/lesson.html'], ['?mode=all', 'learn/lesson.html'], ['/learn/./../file.txt', 'index.html'],
  ])('accepts existing file/route %s from %s', (value, from) => {
    expect(missingReference(value, from, files)).toBeNull();
  });

  it.each(['#missing-anchor', ' #also-ignored', 'https://example.test/missing', '//cdn.example.test/missing', 'mailto:hello@example.test', 'tel:123', 'data:image/svg+xml,<svg/>', 'blob:https://cueory.app/id'])('ignores anchors and external references %s', value => {
    expect(missingReference(value, 'index.html', files)).toBeNull();
  });

  it.each(['/missing', '/assets/missing.js', '/images/caf%C3%A9-missing.png', '/images', '/%ZZ', '/file%00.txt'])('detects broken or malformed internal reference %s', value => {
    expect(missingReference(value, 'index.html', files)).not.toBeNull();
  });

  it('does not mistake a directory for an output file or invent an unbuilt route', () => {
    expect(missingReference('/assets', 'index.html', files)).toBe('missing /assets');
    expect(missingReference('/not-built?x=1', 'index.html', files)).toBe('missing /not-built');
  });
});


describe('internal anchor regression fixtures', () => {
  const pages: ReadonlyMap<string, ReadonlySet<string>> = new Map([
    ['index.html', new Set(['main', 'signup', 'ways-to-study', 'a&b', 'white space'])],
    ['learn/index.html', new Set(['topics'])],
    ['learn/lesson.html', new Set(['cards', 'step-2'])],
  ]);

  it('reads only real IDs and decodes HTML entities, including Unicode and quoted >', () => {
    const html = '<!-- <div id="fake"></div> --><div data-id="not-an-id" id="main" title=">">'
      + '<h2 ID="a&amp;b"></h2><script>const x="<b id=script>";</script>'
      + '<style>p{content:"<b id=style>"}</style>'
      + '<template><div id="template"></div></template>'
      + '<textarea><a id="textarea"></a></textarea>'
      + 'İ <span id="unicode-ok"></span></div>';
    expect([...elementIds(html)].sort()).toEqual(['a&b', 'main', 'unicode-ok']);
  });

  it.each([
    ['#main', 'index.html'],
    ['/#main', 'learn/lesson.html'],
    ['/#ways-to-study', 'learn/lesson.html'],
    ['/learn#topics', 'index.html'],
    ['#cards', 'learn/lesson.html'],
    ['../#signup', 'learn/lesson.html'],
    ['/?x=1#white%20space', 'learn/lesson.html'],
    ['/#a%26b', 'index.html'],
    ['https://example.test/#missing', 'index.html'],
    ['#', 'index.html'],
    ['#top', 'index.html'],
    ['#:~:text=sample', 'index.html'],
    ['#main:~:text=sample', 'index.html'],
    ['/not-built#missing', 'index.html'],
  ])('accepts an existing or browser-native anchor %s from %s', (href, from) => {
    expect(missingFragment(href, from, pages)).toBeNull();
  });

  it('fails on missing same-page and cross-page IDs, without weakening the file check', () => {
    expect(missingFragment('#not-found', 'index.html', pages))
      .toBe('missing fragment #not-found on index.html');
    expect(missingFragment('/learn/lesson#missing', 'index.html', pages))
      .toBe('missing fragment #missing on learn/lesson.html');
    expect(missingFragment('/learn/#unknown', 'index.html', pages))
      .toBe('missing fragment #unknown on learn/index.html');
    expect(missingFragment('#%ZZ', 'index.html', pages))
      .toBe('invalid fragment encoding');
    expect(missingReference('/not-built#missing', 'index.html', new Set(pages.keys())))
      .not.toBeNull();
  });
});

describe('built internal links and sources (run npm run build first)', () => {
  it('every href/src on every built HTML page resolves to an output file or built route', () => {
    const root = fileURLToPath(new URL('../../dist/', import.meta.url));
    expect(existsSync(root), 'dist is missing: run npm run build before npm test').toBe(true);
    const allFiles = new Set<string>();
    const collect = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) collect(file);
        else if (entry.isFile() && statSync(file).isFile()) allFiles.add(relative(root, file).split(sep).join('/'));
      }
    };
    collect(root);
    const pages = htmlFiles(root);
    expect(pages.length, 'build must contain HTML pages').toBeGreaterThan(0);
    const failures: string[] = [];
    for (const page of pages) {
      for (const ref of references(readFileSync(join(root, page), 'utf8'))) {
        const missing = missingReference(ref.value, page, allFiles);
        if (missing) failures.push(`${page}: <${ref.tag}> ${ref.attribute}=${JSON.stringify(ref.value)} — ${missing}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('every internal HTML anchor points to an ID on its target built page', () => {
    const root = fileURLToPath(new URL('../../dist/', import.meta.url));
    expect(existsSync(root), 'dist is missing: run npm run build before npm test').toBe(true);
    const files = htmlFiles(root);
    expect(files.length, 'build must contain HTML pages').toBeGreaterThan(0);
    const pages = new Map<string, ReadonlySet<string>>(
      files.map(file => [file, elementIds(readFileSync(join(root, file), 'utf8'))]),
    );
    const failures: string[] = [];
    for (const page of files) {
      for (const ref of references(readFileSync(join(root, page), 'utf8'))) {
        // SVG uses, stylesheets, images, and other asset fragments are not HTML-page navigation.
        if (ref.attribute !== 'href' || (ref.tag !== 'a' && ref.tag !== 'area')) continue;
        const missing = missingFragment(ref.value, page, pages);
        if (missing) failures.push(page + ': <' + ref.tag + '> href=' + JSON.stringify(ref.value) + ' — ' + missing);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

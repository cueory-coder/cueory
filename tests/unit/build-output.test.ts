/**
 * Checks the built site in dist/. Run `npm run build` first (CI does).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newsletter, site } from '../../src/config/site';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

const requiredPages = [
  'index.html',
  'learn/study-skills.html',
  'privacy.html',
  'terms.html',
  'disclaimer.html',
  'support.html',
  'subscribed.html',
];

/**
 * A built page's markup without the contents of its script elements, found by plain text search in a lowercase copy.
 * Used only to inspect our own build output (Astro's scripts can contain everyday words such as "window").
 */
function markupOutsideScripts(html: string): string {
  const lower = html.toLowerCase();
  let markup = '';
  let at = 0;
  for (;;) {
    const open = lower.indexOf('<script', at);
    if (open === -1) return markup + html.slice(at);
    markup += html.slice(at, open);
    const close = lower.indexOf('</script', open);
    if (close === -1) return markup;
    at = close + '</script'.length;
  }
}

describe.skipIf(!existsSync(dist))('built site', () => {
  const pages = htmlFiles(dist);

  it('marketing pages preload the self-hosted serif (D-41), and every preloaded file exists', () => {
    const preloads = (html: string) =>
      [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)].map((m) => /href="([^"]+)"/.exec(m[0])![1]!);
    for (const page of ['index.html', 'privacy.html', 'support.html', '404.html']) {
      const hrefs = preloads(readFileSync(join(dist, page), 'utf8'));
      expect(hrefs, page).toContain('/fonts/bodoni-moda-latin-opsz-normal.woff2');
      for (const href of hrefs) expect(existsSync(join(dist, href)), href).toBe(true);
    }
    // Study screens stay quiet: no display font, nothing extra to download.
    expect(preloads(readFileSync(join(dist, 'learn/study-skills.html'), 'utf8'))).toEqual([]);
  });

  it('does not preload unused italic Bodoni on home, while retaining its font file (Task 187)', () => {
    const home = readFileSync(join(dist, 'index.html'), 'utf8');
    const preloads = [...home.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)].map((match) => match[0]);
    expect(preloads.some((link) => link.includes('/fonts/bodoni-moda-latin-opsz-italic.woff2'))).toBe(false);
    expect(existsSync(join(dist, 'fonts/bodoni-moda-latin-opsz-italic.woff2'))).toBe(true);
  });

  it('ships the font license with the fonts', () => {
    expect(readFileSync(join(dist, 'fonts/bodoni-moda-OFL.txt'), 'utf8')).toContain('SIL Open Font License');
  });

  it.each(requiredPages)('has %s', (page) => {
    expect(existsSync(join(dist, page))).toBe(true);
  });

  it.each(pages.map((p) => [p.replace(dist, '')]))('%s has a strict CSP and a language', (page) => {
    const html = readFileSync(join(dist, page), 'utf8');
    expect(html).toMatch(/<html lang="en"/);
    const csp = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)?.[1];
    expect(csp, 'missing CSP meta tag').toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    // Never 'unsafe-eval'. The one exception is 'wasm-unsafe-eval', which allows WebAssembly only, for site search
    // (D-49), and only in script-src.
    expect(csp!.split(/[\s;]+/)).not.toContain("'unsafe-eval'");
    expect(csp!.replaceAll("'wasm-unsafe-eval'", '')).not.toContain('unsafe-eval');
    const scriptSrc = /script-src ([^;]+)/.exec(csp!)![1]!;
    expect(csp!.replace(scriptSrc, '')).not.toContain('wasm-unsafe-eval');
  });

  it('builds the site search index next to the pages (D-49)', () => {
    expect(existsSync(join(dist, 'pagefind', 'pagefind.js'))).toBe(true);
    expect(htmlFiles(join(dist, 'pagefind'))).toEqual([]);
  });

  it('the generated search index contains only indexable, non-preview pages (Task 249)', () => {
    const entry = JSON.parse(readFileSync(join(dist, 'pagefind', 'pagefind-entry.json'), 'utf8')) as {
      languages?: { en?: { page_count?: number } };
    };
    const searchablePages = pages.filter((page) => {
      const html = readFileSync(page, 'utf8');
      return /<main[^>]*\sdata-pagefind-body(?:="")?[\s>]/.test(html);
    });

    expect(entry.languages?.en?.page_count).toBe(searchablePages.length);
    expect(searchablePages).not.toEqual(expect.arrayContaining(pages.filter((page) => page.includes('/preview/'))));
    expect(searchablePages.every((page) => !readFileSync(page, 'utf8').includes('content="noindex'))).toBe(true);
  });

  it.each(pages.map((p) => [p.replace(dist, '')]))('%s: site search indexes it only if search engines may (D-49)', (page) => {
    const html = readFileSync(join(dist, page), 'utf8');
    const noindex = html.includes('<meta name="robots" content="noindex');
    const body = /<main[^>]*\sdata-pagefind-body(?:="")?[\s>]/.test(html);
    expect(body, noindex ? 'a noindex page must stay out of site search' : 'this page should be searchable').toBe(
      !noindex,
    );
    if (body) expect(html).toMatch(/<main[^>]*\sdata-pagefind-meta="title:[^"]+"/);
  });

  it.each(pages.map((p) => [p.replace(dist, '')]))('%s: the CSP allows every inline script by hash', (page) => {
    const html = readFileSync(join(dist, page), 'utf8');
    const csp = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)![1];
    const scriptSrc = /script-src ([^;]+)/.exec(csp)![1];
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    for (const body of inline) {
      const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
      expect(scriptSrc, `inline script not allowed: ${body.slice(0, 60)}`).toContain(hash);
    }
  });

  it.runIf(site.showBuildingNotice).each(pages.map((p) => [p.replace(dist, '')]))(
    '%s shows the building notice',
    (page) => {
      const html = readFileSync(join(dist, page), 'utf8');
      expect(html).toContain("we're still building. more coming soon.");
    },
  );

  it('label it: the page holds no label text; the labels come from their own JSON file (Codex review of #71)', () => {
    const source = JSON.parse(readFileSync(new URL('../../content/label-it/study-skills-01.json', import.meta.url), 'utf8'));
    const html = readFileSync(join(dist, 'learn/study-skills/label-it.html'), 'utf8');
    // Astro's own scripts can contain everyday words like "window"; what matters is the page's markup and props.
    const markup = markupOutsideScripts(html);
    for (const label of source.labels as { text: string }[]) {
      expect(markup, label.text).not.toMatch(new RegExp(`\\b${label.text}\\b`, 'i'));
    }
    const props = [...html.matchAll(/<astro-island[^>]*\sprops="([^"]*)"/g)].map((m) => m[1]);
    expect(props).toEqual([
      '{&quot;src&quot;:[0,&quot;/learn/study-skills/label-it/study-skills-01.json&quot;]}',
      '{&quot;page&quot;:[0,&quot;/learn/study-skills/label-it.html&quot;],&quot;itemId&quot;:[0],&quot;itemVersionId&quot;:[0],&quot;variant&quot;:[0,&quot;icon&quot;]}',
    ]);
    const served = JSON.parse(readFileSync(join(dist, 'learn/study-skills/label-it/study-skills-01.json'), 'utf8'));
    expect(served.labels.map((l: { text: string }) => l.text)).toEqual(source.labels.map((l: { text: string }) => l.text));
    expect(served.image.credit).toBe(source.image.credit);
  });

  it('questions: the page holds no keys or rationales; only sample items are served (D-33)', () => {
    const source = JSON.parse(readFileSync(new URL('../../content/questions/study-skills-01.json', import.meta.url), 'utf8'));
    const html = readFileSync(join(dist, 'learn/study-skills/questions.html'), 'utf8');
    const markup = markupOutsideScripts(html);
    for (const item of source.items as { stem: string; rationales: Record<string, string> }[]) {
      expect(markup).not.toContain(item.stem);
      for (const rationale of Object.values(item.rationales)) expect(markup).not.toContain(rationale);
    }
    expect(markup).not.toMatch(/&quot;key&quot;|"key"/);
    const props = [...html.matchAll(/<astro-island[^>]*\sprops="([^"]*)"/g)].map((m) => m[1]);
    expect(props).toEqual([
      '{&quot;src&quot;:[0,&quot;/learn/study-skills/questions/study-skills-01.json&quot;]}',
      '{&quot;page&quot;:[0,&quot;/learn/study-skills/questions.html&quot;],&quot;itemId&quot;:[0],&quot;itemVersionId&quot;:[0],&quot;variant&quot;:[0,&quot;icon&quot;]}',
    ]);
    const served = JSON.parse(readFileSync(join(dist, 'learn/study-skills/questions/study-skills-01.json'), 'utf8'));
    expect(served.status).toBe('sample');
    expect(served.items.every((item: { status: string }) => item.status === 'sample')).toBe(true);
  });


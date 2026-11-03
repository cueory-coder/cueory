/**
 * Checks the built site in dist/. Run `npm run build` first (CI does).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
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

// Baseline gzip bytes for the initial JavaScript on each route at staging 65a05c3.
// This includes external scripts in the HTML, Astro island components and renderers,
// their static imports, and inline scripts. Dynamic imports are intentionally excluded.
const initialJsBudget = {
  '404.html': 75978,
  'auth/callback.html': 76233,
  'breaks.html': 76095,
  'disclaimer.html': 76405,
  'index.html': 80295,
  'learn/study-skills/cards.html': 79473,
  'learn/study-skills/fill-in.html': 78805,
  'learn/study-skills/label-it.html': 78339,
  'learn/study-skills/learn-mode.html': 78047,
  'learn/study-skills/matching.html': 78053,
  'learn/study-skills/organizer.html': 79191,
  'learn/study-skills/questions.html': 79636,
  'learn/study-skills.html': 75781,
  'learn/video-sample.html': 76252,
  'learn.html': 75452,
  'play.html': 91853,
  'preview/body-viewer.html': 79576,
  'preview/email.html': 75055,
  'preview/prose.html': 75055,
  'preview/reminders.html': 76112,
  'preview/share.html': 79128,
  'preview/states.html': 75055,
  'privacy.html': 76405,
  'progress.html': 77916,
  'reset-password.html': 75917,
  'signin.html': 75184,
  'signup.html': 75184,
  'start.html': 76938,
  'subscribed.html': 75055,
  'support.html': 76405,
  'terms.html': 76405,
} satisfies Record<string, number>;

function initialJsFiles(page: string): string[] {
  const html = readFileSync(page, 'utf8');
  const queue = [...html.matchAll(/(?:src|component-url|renderer-url)="([^"]+\.js(?:\?[^" ]*)?)"/g)].map((match) => match[1]!);
  const files = new Set<string>();
  const resolveAsset = (from: string, url: string) => {
    if (isAbsolute(url) && url.startsWith(dist)) return url;
    return url.startsWith('/') ? join(dist, url.slice(1)) : join(from, '..', url);
  };

  while (queue.length > 0) {
    const url = queue.shift()!.split('?')[0]!;
    const file = resolveAsset(page, url);
    if (files.has(file) || !file.endsWith('.js') || !existsSync(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s*(?:[^"'();]*?\bfrom\s*)?["']([^"']+\.js)["']/g)) {
      const imported = match[1]!.split('?')[0]!;
      queue.push(imported.startsWith('/') ? imported : join(file, '..', imported));
    }
  }
  return [...files];
}

function initialJsGzipBytes(page: string): number {
  const html = readFileSync(page, 'utf8');
  const external = initialJsFiles(page).reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0);
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)]
    .reduce((total, match) => total + gzipSync(match[1]!).length, 0);
  return external + inline;
}

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

  it('keeps each route within 10% of its initial JavaScript gzip budget', () => {
    expect(pages.map((page) => relative(dist, page).replaceAll('\\', '/')).sort()).toEqual(Object.keys(initialJsBudget).sort());
    for (const [page, budget] of Object.entries(initialJsBudget)) {
      const actual = initialJsGzipBytes(join(dist, page));
      expect(actual, `${page} initial JavaScript gzip bytes`).toBeLessThanOrEqual(Math.ceil(budget * 1.1));
    }
  });

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

  it('gives every indexable page complete, unique social metadata', () => {
    const indexableTitles = new Map<string, string>();
    const meta = (html: string, property: string) =>
      new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html)?.[1];

    for (const pagePath of pages) {
      const page = pagePath.replace(`${dist}/`, '');
      const html = readFileSync(pagePath, 'utf8');
      if (html.includes('<meta name="robots" content="noindex')) continue;

      const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
      const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
      expect(title, `${page}: title`).toBeTruthy();
      expect(description, `${page}: description`).toBeTruthy();
      expect(indexableTitles.has(title!), `${page}: duplicate title`).toBe(false);
      indexableTitles.set(title!, page);

      expect(html, `${page}: canonical`).toContain(`rel="canonical" href="https://cueory.app/`);
      expect(meta(html, 'og:title'), `${page}: og:title`).toBe(title);
      expect(meta(html, 'og:description'), `${page}: og:description`).toBe(description);
      expect(meta(html, 'og:image'), `${page}: og:image`).toBe('https://cueory.app/share/study-ivory.png');
      expect(existsSync(join(dist, 'share/study-ivory.png')), `${page}: og:image file`).toBe(true);
    }
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

  it('real questions (Task 172): the page holds no question data and is kept out of search', () => {
    const html = readFileSync(join(dist, 'learn/questions.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    const props = [...html.matchAll(/<astro-island[^>]*\sprops="([^"]*)"/g)].map((m) => m[1]);
    expect(props).toEqual([
      '{}',
      '{&quot;page&quot;:[0,&quot;/learn/questions.html&quot;],&quot;itemId&quot;:[0],&quot;itemVersionId&quot;:[0],&quot;variant&quot;:[0,&quot;icon&quot;]}',
    ]);
    expect(markupOutsideScripts(html)).not.toMatch(/item_answers|is_correct|&quot;(?:key|rationales)&quot;|"(?:key|rationales)"/);
  });

  it('home page: "video" comes first, "learn" is Learn mode, and modes not built yet say coming soon (D-43, D-50, D-60)', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const card = (id: string) => {
      const match = new RegExp(`<div[^>]*id="mode-${id}"[\\s\\S]*?<h3[^>]*>([^<]+)</h3>[\\s\\S]*?(?:href="([^"]+)"|coming soon)`).exec(html);
      expect(match, `card ${id}`).not.toBeNull();
      return { name: match![1]!.trim(), href: match![2] };
    };
    expect(card('video')).toEqual({ name: 'video', href: undefined });
    expect(card('learn')).toEqual({ name: 'learn', href: '/learn/study-skills/learn-mode' });
    expect(card('fill-in')).toEqual({ name: 'fill-in', href: '/learn/study-skills/fill-in' });
    expect(card('questions')).toEqual({ name: 'questions', href: '/learn/study-skills/questions' });
    expect(card('review')).toEqual({ name: 'review', href: undefined });
    expect(card('level-test')).toEqual({ name: 'level test', href: undefined });
    expect(html).not.toContain('id="mode-lesson"');
  });

  it('keeps the signup thank-you page out of search engines', () => {
    const html = readFileSync(join(dist, 'subscribed.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('home page signup matches the Kit settings, and the CSP allows only that form address', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const csp = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)![1];
    const formAction = /form-action ([^;]+)/.exec(csp)![1].trim();
    if (newsletter.formAction) {
      expect(html).toContain(`action="${newsletter.formAction}"`);
      expect(html).toContain(`name="${newsletter.emailFieldName}"`);
      expect(formAction).toBe(`'self' ${new URL(newsletter.formAction).origin}`);
    } else {
      expect(html).toContain('signups open soon.');
      expect(html).not.toContain('<form');
      expect(formAction).toBe("'self'");
    }
  });

  it('ships the security headers file', () => {
    const headers = readFileSync(join(dist, '_headers'), 'utf8');
    for (const h of [
      "frame-ancestors 'none'",
      'Strict-Transport-Security',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(headers).toContain(h);
    }
  });

  it('never ships secret-looking values', () => {
    const files = readdirSync(join(dist, '_astro')).map((f) => join(dist, '_astro', f));
    for (const f of [...pages.map((p) => p), ...files.filter((f) => f.endsWith('.js'))]) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/sb_secret_[A-Za-z0-9]/);
      expect(text, f).not.toMatch(/service_role/);
      expect(text, f).not.toMatch(/api_secret|kit_api_key/i);
    }
  });
});

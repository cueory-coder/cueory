/**
 * Checks the built site in dist/. Run `npm run build` first (CI does).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

// Original 31 route baselines: staging 65a05c3 (2026-11-03), rebuilt from
// its pinned lockfile with Node 24.22.2 and rescanned using today's corrected
// static-import / inline-script / gzip algorithm. Reproduction: CI run
// 41956096721, job 127011229250, HISTORICAL_CORRECTED_JS_BUDGETS output.
// This corrects the original scanner's missing import paths, not a budget reset.
// Routes added since that staging commit use measured
// gzip sizes from the exact-head CI merge build in run 41864993683.
// Added routes below were measured in exact-head CI run 41933505423.
// Newly integrated routes measured with the same current scanner in exact-head CI run 41945246600.
// This includes external scripts in the HTML, Astro island components and renderers,
// their static imports, and inline scripts. Dynamic imports are intentionally excluded.
const initialJsBudget = {
  '404.html': 147695,
  'about.html': 90627,
  'account.html': 123795,
  'account/two-factor.html': 110576,
  'admin/flags.html': 92161,
  'auth/callback.html': 148073,
  'breaks.html': 151899,
  'coming-soon.html': 90627,
  'courses.html': 90627,
  'disclaimer.html': 148122,
  'index.html': 153943,
  'learn/questions.html': 97613,
  'learn/study-skills/cards.html': 156387,
  'learn/study-skills/fill-in.html': 153132,
  'learn/study-skills/label-it.html': 150373,
  'learn/study-skills/learn-mode.html': 153947,
  'learn/study-skills/matching.html': 154728,
  'learn/study-skills/organizer.html': 153555,
  'learn/study-skills/questions.html': 151681,
  'learn/study-skills.html': 147632,
  'learn/video-sample.html': 148178,
  'learn.html': 150346,
  'play.html': 168467,
  'preview/admin-flags.html': 92161,
  'preview/anatomy-text.html': 89104,
  'preview/anatomy-lab.html': 89027,
  'preview/body-viewer.html': 151504,
  'preview/email.html': 146752,
  'preview/prose.html': 146752,
  'preview/reminders.html': 148152,
  'preview/share.html': 151522,
  'preview/states.html': 146752,
  'preview/survey.html': 90800,
  'privacy.html': 148122,
  'progress.html': 153183,
  'reset-password.html': 167326,
  'signin.html': 166433,
  'signup.html': 166433,
  'start.html': 152098,
  'subscribed.html': 146752,
  'support.html': 148122,
  'terms.html': 148122,
} satisfies Record<string, number>;

/**
 * Diagnostic reproduction of Task 192's ORIGINAL measurement algorithm.
 * Intentionally retains the old transitive-path and import-traversal defects.
 * Use only to compare scanners on the SAME current build, never for budgets.
 */
function legacyInitialJsFiles(page: string): string[] {
  const html = readFileSync(page, 'utf8');
  const queue = [...html.matchAll(/(?:src|component-url|renderer-url)="([^"]+\.js(?:\?[^" ]*)?)"/g)].map((match) => match[1]!);
  const files = new Set<string>();
  const resolveAsset = (from: string, url: string) => {
    if (url.startsWith(dist + '/')) return url;
    return url.startsWith('/') ? join(dist, url.slice(1)) : join(from, '..', url);
  };

  while (queue.length > 0) {
    const url = queue.shift()!.split('?')[0]!;
    const file = resolveAsset(page, url);
    if (files.has(file) || !file.endsWith('.js') || !existsSync(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:import\s+[^"']*?from\s*|import\s*)["']([^"']+\.js(?:\?[^"']*)?)["']/g)) {
      const imported = match[1]!.split('?')[0]!;
      queue.push(imported.startsWith('/') ? imported : join(file, '..', imported));
    }
  }
  return [...files];
}

function legacyInitialJsGzipBytes(page: string): number {
  const html = readFileSync(page, 'utf8');
  const external = legacyInitialJsFiles(page).reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0);
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .reduce((total, match) => total + gzipSync(match[1]!).length, 0);
  return external + inline;
}

function initialJsFiles(page: string, rootDist = dist): string[] {
  const html = readFileSync(page, 'utf8');
  const queue = [...html.matchAll(/(?:src|component-url|renderer-url)="([^"]+\.js(?:\?[^" ]*)?)"/g)].map((match) => match[1]!);
  const files = new Set<string>();
  const resolveAsset = (from: string, url: string) => {
    if (isAbsolute(url) && url.startsWith(rootDist)) return url;
    return url.startsWith('/') ? join(rootDist, url.slice(1)) : join(from, '..', url);
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

/**
 * Read script bodies in our built HTML without an incomplete closing-tag regex.
 * End tags can use mixed case and whitespace or additional text before >.
 */
function inlineScriptBodies(html: string): string[] {
  // ASCII-only case folding preserves positions even around non-ASCII text.
  const lower = html.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const isBoundary = (character: string | undefined) =>
    character === undefined || character === '>' || character === '/' || /\s/u.test(character);
  const bodies: string[] = [];
  let at = 0;
  for (;;) {
    const open = lower.indexOf('<script', at);
    if (open === -1) return bodies;
    if (!isBoundary(lower[open + 7])) {
      at = open + 7;
      continue;
    }
    const startEnd = lower.indexOf('>', open + 7);
    if (startEnd === -1) return bodies;
    let close = lower.indexOf('</script', startEnd + 1);
    while (close !== -1 && !isBoundary(lower[close + 8])) {
      close = lower.indexOf('</script', close + 8);
    }
    if (close === -1) return bodies;
    const closeEnd = lower.indexOf('>', close + 8);
    if (closeEnd === -1) return bodies;
    bodies.push(html.slice(startEnd + 1, close));
    at = closeEnd + 1;
  }
}

function initialJsGzipBytes(page: string, rootDist = dist): number {
  const html = readFileSync(page, 'utf8');
  const external = initialJsFiles(page, rootDist).reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0);
  const inline = inlineScriptBodies(html).reduce((total, body) => total + gzipSync(body).length, 0);
  return external + inline;
}

describe('inline JavaScript collection', () => {
  it('handles mixed-case script closing tags and extended closing-tag whitespace', () => {
    expect(inlineScriptBodies('<SCRIPT type="module">const n = 1;</SCRIPT\t\n extra>')).toEqual(['const n = 1;']);
  });

  it('ignores similarly named tags and preserves Unicode offsets', () => {
    expect(inlineScriptBodies('<scripture>ignore</scripture>İ<script>const label = "✓";</script>'))
      .toEqual(['const label = "✓";']);
  });
});

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
    const routes = pages.map((page) => relative(dist, page).replaceAll('\\', '/'));
    const missingBudgets = routes.filter((page) => !(page in initialJsBudget));
    expect(
      missingBudgets.map((page) => `${page}: ${initialJsGzipBytes(join(dist, page))} gzip bytes`),
      'Every built route must have a measured JavaScript budget',
    ).toEqual([]);
    expect(routes.sort()).toEqual(Object.keys(initialJsBudget).sort());
    const overBudget = Object.entries(initialJsBudget).flatMap(([page, budget]) => {
      const actual = initialJsGzipBytes(join(dist, page));
      const limit = Math.ceil(budget * 1.1);
      return actual > limit ? [`${page}: ${actual} gzip bytes exceeds limit ${limit} (baseline ${budget})`] : [];
    });
    // Only compute and report bundle contributions when the invariant fails. This
    // identifies shared scripts worth investigating without relaxing any budget.
    const baselineDiagnostic = overBudget.length > 0
      ? initialJsFiles(join(dist, '404.html'))
        .map((file) => ({
          asset: relative(dist, file).replaceAll('\\', '/'),
          gzipBytes: gzipSync(readFileSync(file)).length,
        }))
        .sort((a, b) => b.gzipBytes - a.gzipBytes)
        .slice(0, 12)
      : [];
    // This comparison uses one current build for BOTH scanners. It quantifies how
    // much the original scanner undercounts here; it cannot establish historic growth.
    // Measure all failing routes with BOTH scanners on the same current build.
    // This does not change the strict corrected-scanner assertion or any budget.
    // Historical baselines used the older scanner, so identify where a corrected
    // result might be incomparable to its historical reference before resetting it.
    const legacyDiagnostic = overBudget.length > 0
      ? Object.entries(initialJsBudget).flatMap(([route, baseline]) => {
        const page = join(dist, route);
        const correctedScanner = initialJsGzipBytes(page);
        const limit = Math.ceil(baseline * 1.1);
        if (correctedScanner <= limit) return [];
        const originalScanner = legacyInitialJsGzipBytes(page);
        return [{
          route,
          originalScanner,
          correctedScanner,
          scannerDifference: correctedScanner - originalScanner,
          originalScannerAboveOriginalLimit: originalScanner > limit,
        }];
      })
      : [];
    expect(
      overBudget,
      'All route JavaScript budgets must remain within the original 10% limit. ' +
        'Representative 404-page external module sizes (largest first): ' +
        JSON.stringify(baselineDiagnostic) +
        '. Same-build original versus corrected scanner results for ALL failing routes: ' +
        JSON.stringify(legacyDiagnostic),
    ).toEqual([]);
  });

  // Opt-in historical audit: rebuild the exact original staging source and
  // scan it with the *current corrected* algorithm (CUEORY_REMEASURE_BUDGET=1). Never substitute today's
  // measurements for historical baselines or relax the 10% assertion above.
  it.runIf(process.env.CUEORY_REMEASURE_BUDGET === '1')(
    'diagnostic: recompute corrected historical staging JS baselines',
    () => {
      const historicalSha = '65a05c3bfb126e1e6052a7a7be4f180b81973d7b';
      const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
      const temp = mkdtempSync(join(tmpdir(), 'cueory-js-baseline-'));
      const worktree = join(temp, 'historical-source');
      let checkedOut = false;
      const run = (command: string, args: string[], cwd = repoRoot) => {
        const completed = spawnSync(command, args, {
          cwd,
          encoding: 'utf8',
          timeout: 150_000,
          maxBuffer: 8 * 1024 * 1024,
        });
        if (completed.error || completed.status !== 0) {
          throw new Error(
            `Historical baseline command ${command} ${args[0] ?? ''} failed: ` +
            `${completed.error?.message ?? completed.status}\n` +
            (completed.stderr ?? '').slice(-3000) + '\n' + (completed.stdout ?? '').slice(-3000),
          );
        }
      };
      try {
        // GitHub Actions checks out the same public repository with shallow history.
        // Fetch only the pinned ancestor. Never execute code from a fork.
        run('git', ['fetch', '--no-tags', '--depth=1', 'origin', historicalSha]);
        run('git', ['worktree', 'add', '--detach', worktree, historicalSha]);
        checkedOut = true;
        run('npm', ['ci'], worktree);
        run('npm', ['run', 'build'], worktree);
        const historicalDist = join(worktree, 'dist');
        const historicalRoutes = htmlFiles(historicalDist)
          .map((file) => relative(historicalDist, file).replaceAll('\\', '/'))
          .sort();
        const measurements = historicalRoutes.map((route) => {
          const baseline = initialJsGzipBytes(join(historicalDist, route), historicalDist);
          const current = initialJsGzipBytes(join(dist, route), dist);
          return {
            route,
            originalStoredBytes: (initialJsBudget as Record<string, number>)[route] ?? null,
            historicalCorrectedBytes: baseline,
            currentCorrectedBytes: current,
            correctedGrowthPct: Math.round((current / baseline - 1) * 10000) / 100,
            withinTenPercent: current <= Math.ceil(baseline * 1.1),
          };
        });
        console.info('HISTORICAL_CORRECTED_JS_BUDGETS ' + JSON.stringify({
          sourceCommit: historicalSha,
          nodeVersion: process.version,
          measurements,
        }));
        expect(historicalRoutes.length, 'historical build must contain 31 original HTML routes').toBe(31);
      } finally {
        if (checkedOut) {
          try { run('git', ['worktree', 'remove', '--force', worktree]); } catch {
            // Temporary CI workspace cleanup continues below.
          }
        }
        rmSync(temp, { recursive: true, force: true });
      }
    },
    240_000,
  );
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

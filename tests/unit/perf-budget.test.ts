import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  BUDGETS,
  ROUTE_BUDGETS,
  budgetsForRoute,
  formatPerformanceJson,
  parsePerformanceArgs,
  budgetBreaches,
  extractHtmlAssetUrls,
  extractInlineModuleAssetUrls,
  extractImportedAssetUrls,
  formatPerformanceReport,
  resolveLocalAsset,
  scanPerformanceBudget,
} from '../../scripts/perf-budget.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-perf-budget-'));
  roots.push(root);
  const file = (name: string, body: string) => {
    const full = join(root, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
    return full;
  };
  return { root, file };
}

describe('built-site performance budgets', () => {
  it('reads attributes in any order, quotes, and Astro island entries', () => {
    expect(extractHtmlAssetUrls(`
      <link href='/_astro/site.css?v=1' media='all' rel='stylesheet'>
      <link rel="modulepreload" href="/_astro/shared.js">
      <script defer src='/_astro/page.js'></script>
      <astro-island renderer-url='/_astro/react.js' component-url='/_astro/island.js' before-hydration-url='/_astro/before.js' client-url='/_astro/legacy.js'></astro-island>
      <img src='/models/anatomy/huge.glb'>
      <link rel='icon' href='/icon.svg'>
    `)).toEqual([
      '/_astro/site.css?v=1', '/_astro/shared.js', '/_astro/page.js',
      '/_astro/island.js', '/_astro/react.js', '/_astro/before.js', '/_astro/legacy.js',
    ]);
  });

  it('finds static JS imports and CSS imports but not lazy JS imports', () => {
    expect(extractImportedAssetUrls(`import{a}from'./shared.js';import './boot.js';export{b}from'./vendor.mjs'; import('./lazy.js')`, 'js'))
      .toEqual(['./shared.js', './boot.js', './vendor.mjs']);
    expect(extractImportedAssetUrls('@import url("./base.css"); @import "../color.css" screen;', 'css'))
      .toEqual(['./base.css', '../color.css']);
  });

  it('ignores asset tags in HTML comments, attributes and raw text', () => {
    const html = [
      `<!-- <script src="/_astro/missing-comment.js"></script><script type="module">import '/_astro/missing-module.js';</script> -->`,
      `<div data-example='<script src="/_astro/missing-attribute.js">'></div>`,
      `<script type="module">const example = '<script src="/_astro/missing-string.js">'; import '/_astro/real.js';</script>`,
      `<style>body::after { content: '<link rel="stylesheet" href="/_astro/missing-style.css">'; }</style>`,
      `<textarea><script src="/_astro/missing-textarea.js"></script></textarea>`,
      `<link rel="stylesheet" href="/_astro/real.css"><script src="/_astro/app.js"></script>`,
    ].join('\n');
    expect(extractHtmlAssetUrls(html)).toEqual(['/_astro/real.css', '/_astro/app.js']);
    expect(extractInlineModuleAssetUrls(html)).toEqual(['/_astro/real.js']);
  });

  it('scans a real page without following commented or quoted example tags', () => {
    const f = fixture();
    const inline = `const example = '<script src="/_astro/missing-string.js">'; import '/_astro/real.js';`;
    const html = `<!-- <script src="/_astro/missing-comment.js"></script><script type="module">import '/_astro/missing-inline.js';</script> -->` +
      '<script type="module">' + inline + '</script><link rel="stylesheet" href="/_astro/real.css">';
    const real = 'export const sample = true;';
    const css = 'body { color: inherit; }';
    f.file('index.html', html);
    f.file('_astro/real.js', real);
    f.file('_astro/real.css', css);
    const [page] = scanPerformanceBudget(f.root);
    expect(page!.html).toBe(gzipSync(html).length);
    expect(page!.js).toBe(gzipSync(real).length);
    expect(page!.css).toBe(gzipSync(css).length);
    expect(page!.breaches).toEqual([]);
  });

  it('ignores dormant nested templates and their inline module imports', () => {
    const html = '<template><script src="/_astro/missing-outer.js"></script>' +
      '<template><link rel="stylesheet" href="/_astro/missing-nested.css">' +
      '<script type="module">const text = "</template>"; import "/_astro/missing-inline.js";</script></template>' +
      '<script src="/_astro/missing-after-nested.js"></script></template>' +
      '<script src="/_astro/real.js"></script><script type="module">import "/_astro/real-inline.js";</script>';
    expect(extractHtmlAssetUrls(html)).toEqual(['/_astro/real.js']);
    expect(extractInlineModuleAssetUrls(html)).toEqual(['/_astro/real-inline.js']);
    // Declarative shadow content may load immediately, so keep its asset references in the estimate.
    expect(extractHtmlAssetUrls('<template shadowrootmode="open"><link rel="stylesheet" href="/_astro/shadow.css"></template>'))
      .toEqual(['/_astro/shadow.css']);
  });

  it('counts only live assets beside dormant templates in a built-site fixture', () => {
    const f = fixture();
    const html = '<template><script src="/_astro/missing-inert.js"></script>' +
      '<template><script type="module">import "/_astro/missing-nested.js";</script></template></template>' +
      '<script src="/_astro/real.js"></script>';
    const real = 'export const sample = true;';
    f.file('index.html', html);
    f.file('_astro/real.js', real);
    const [page] = scanPerformanceBudget(f.root);
    expect(page!.html).toBe(gzipSync(html).length);
    expect(page!.js).toBe(gzipSync(real).length);
    expect(page!.css).toBe(0);
    expect(page!.breaches).toEqual([]);
  });

  it('excludes resource tags within noscript fallbacks when measuring active scripts', () => {
    const html = '<noscript><script src="/_astro/missing-script.js"></script>' +
      '<link rel="stylesheet" href="/_astro/missing.css">' +
      '<script type="module">import "/_astro/missing-inline.js";</script>' +
      '<template><script src="/_astro/missing-nested.js"></script></template></noscript>' +
      '<script src="/_astro/real.js"></script>' +
      '<script type="module">import "/_astro/real-inline.js";</script>';
    expect(extractHtmlAssetUrls(html)).toEqual(['/_astro/real.js']);
    expect(extractInlineModuleAssetUrls(html)).toEqual(['/_astro/real-inline.js']);
  });

  it('does not require missing noscript-only assets in a built-page scan', () => {
    const f = fixture();
    const html = '<noscript><link rel="stylesheet" href="/_astro/missing.css">' +
      '<script src="/_astro/missing.js"></script></noscript>' +
      '<script src="/_astro/real.js"></script><link rel="stylesheet" href="/_astro/real.css">';
    const js = 'export const sample = true;';
    const css = 'body { color: inherit; }';
    f.file('index.html', html);
    f.file('_astro/real.js', js);
    f.file('_astro/real.css', css);
    const [page] = scanPerformanceBudget(f.root);
    expect(page!.html).toBe(gzipSync(html).length);
    expect(page!.js).toBe(gzipSync(js).length);
    expect(page!.css).toBe(gzipSync(css).length);
    expect(page!.breaches).toEqual([]);
  });

  it('ignores fake CSS imports in comments and strings', () => {
    const css = [
      "/* @import './missing-comment.css'; */",
      'body::after { content: "@import \'./missing-content.css\'"; }',
      "@import /* valid whitespace */ url('./real.css');",
      "@import '../second.css' screen;",
    ].join('\n');
    expect(extractImportedAssetUrls(css, 'css')).toEqual(['./real.css', '../second.css']);
    expect(extractImportedAssetUrls('@import url(./bare.css); @IMPORT "./upper.css";', 'css'))
      .toEqual(['./bare.css', './upper.css']);
  });

  it('scans only live CSS imports in a built-site fixture', () => {
    const f = fixture();
    const html = '<link rel="stylesheet" href="/_astro/site.css">';
    const css = [
      "/* @import './missing-comment.css'; */",
      'body::after { content: "@import \'./missing-content.css\'"; }',
      "@import url('./real.css');",
    ].join('\n');
    const real = 'body { margin: 0; }';
    f.file('index.html', html);
    f.file('_astro/site.css', css);
    f.file('_astro/real.css', real);
    const [page] = scanPerformanceBudget(f.root);
    expect(page!.html).toBe(gzipSync(html).length);
    expect(page!.css).toBe(gzipSync(css).length + gzipSync(real).length);
    expect(page!.js).toBe(0);
    expect(page!.breaches).toEqual([]);
  });

  it('ignores comment, string, template and regex impostors while keeping real static imports', () => {
    const code = [
      "// import './missing-line.js'",
      "/* export { x } from './missing-block.js' */",
      `const message = "import './missing-string.js'";`,
      "const templ = `export { x } from './missing-template.js'`;",
      "const pattern = /import 'missing-regex.js'/;",
      "import './real.js';",
      "export { real } from './second.js';",
    ].join('\n');
    expect(extractImportedAssetUrls(code, 'js')).toEqual(['./real.js', './second.js']);
  });

  it('counts only real dependencies in built JS and inline module scripts', () => {
    const f = fixture();
    const app = [
      "// import './missing-line.js'",
      `const message = "export { x } from './missing-string.js'";`,
      "const templ = `import './missing-template.js'`;",
      "import './real.js';",
    ].join('\n');
    const real = `export const value = '[sample clue]';`;
    const inline = [
      "/* import '/_astro/missing-comment.js' */",
      `const example = "import '/_astro/missing-string.js'";`,
      "import '/_astro/inline.js';",
    ].join('\n');
    const inlineAsset = 'export const inline = true;';
    const html = '<script type="module" src="/_astro/app.js"></script>' +
      '<script type="module">' + inline + '</script>';
    f.file('index.html', html);
    f.file('_astro/app.js', app);
    f.file('_astro/real.js', real);
    f.file('_astro/inline.js', inlineAsset);
    const [page] = scanPerformanceBudget(f.root);
    const gzip = (value: string) => gzipSync(value).length;
    expect(page!.js).toBe(gzip(app) + gzip(real) + gzip(inlineAsset));
    expect(page!.html).toBe(gzip(html));
    expect(page!.breaches).toEqual([]);
  });

  it('follows static imports in inline module scripts but not classic or lazy imports', () => {
    expect(extractInlineModuleAssetUrls(`
      <script>import '/_astro/classic.js';</script>
      <script type='module'>import '/_astro/inline.js'; import { x } from '/_astro/shared.js'; import('/_astro/lazy.js');</script>
      <script type='module' src='/_astro/external.js'>import '/_astro/ignore.js';</script>
      <SCRIPT TYPE="MODULE">import '/_astro/inline.js';</SCRIPT>
    `)).toEqual(['/_astro/inline.js', '/_astro/shared.js']);
  });

  it('counts Astro hydration and inline module import assets in a built page', () => {
    const f = fixture();
    const html = `<astro-island before-hydration-url="/_astro/before.js" client-url="/_astro/client.js"></astro-island>` +
      `<script type="module">import '/_astro/inline.js'; import('/_astro/lazy.js');</script>`;
    f.file('index.html', html);
    const before = 'export const before = true;';
    const client = 'export const client = true;';
    const inline = `import './shared.js';`;
    const shared = `export const shared = '[sample clue]';`;
    f.file('_astro/before.js', before);
    f.file('_astro/client.js', client);
    f.file('_astro/inline.js', inline);
    f.file('_astro/shared.js', shared);
    const bytes = (value: string) => gzipSync(value).length;
    const [page] = scanPerformanceBudget(f.root);
    expect(page!.html).toBe(bytes(html));
    expect(page!.js).toBe([before, client, inline, shared].reduce((sum, item) => sum + bytes(item), 0));
    expect(page!.breaches).toEqual([]);
  });
  it('adds each page HTML, linked JS/CSS and transitive static imports once', () => {
    const f = fixture();
    const html = `<link rel="stylesheet" href="/_astro/site.css"><script type="module" src="/_astro/app.js"></script><astro-island component-url="/_astro/app.js"></astro-island>`;
    f.file('index.html', html);
    f.file('nested/page.html', `<script src="../_astro/app.js?v=2"></script>`);
    const app = `import './shared.js'; import './shared.js';`;
    const shared = `export const marker = '[sample clue]';`;
    const css = `@import url('./base.css');body { color: inherit; }`;
    const base = 'body { margin: 0; }';
    f.file('_astro/app.js', app);
    f.file('_astro/shared.js', shared);
    f.file('_astro/site.css', css);
    f.file('_astro/base.css', base);
    f.file('models/anatomy/large.glb', '0'.repeat(20_000));
    const bytes = (s: string) => gzipSync(s).length;
    const result = scanPerformanceBudget(f.root, { html: 1000, js: 1000, css: 1000, total: 3000 });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      page: 'index.html', html: bytes(html), js: bytes(app) + bytes(shared),
      css: bytes(css) + bytes(base), breaches: [],
    });
    expect(result[0]!.total).toBe(result[0]!.html + result[0]!.js + result[0]!.css);
    expect(result[1]!.css).toBe(0);
    expect(result[1]!.js).toBe(bytes(app) + bytes(shared));
  });

  it('checks each kind plus total at the exact boundary', () => {
    expect(budgetBreaches({ html: 40, js: 60, css: 20, total: 120 },
      { html: 40, js: 60, css: 20, total: 120 })).toEqual([]);
    expect(budgetBreaches({ html: 41, js: 61, css: 21, total: 123 },
      { html: 40, js: 60, css: 20, total: 120 })).toEqual(['html', 'js', 'css', 'total']);
    expect(Object.values(BUDGETS).every((value) => value > 0)).toBe(true);
  });

  it('reports over-budget pages clearly', () => {
    const f = fixture();
    f.file('index.html', 'A'.repeat(10_000));
    const pages = scanPerformanceBudget(f.root, { html: 20, js: 20, css: 20, total: 20 });
    expect(pages[0]!.breaches).toEqual(['html', 'total']);
    expect(formatPerformanceReport(pages)).toContain('OVER: html, total');
    expect(formatPerformanceReport(pages)).toContain('1 over budget');
  });

  it('refuses missing assets and paths outside dist instead of silently undercounting', () => {
    const f = fixture();
    const page = f.file('index.html', '<script src="/_astro/missing.js"></script>');
    expect(() => scanPerformanceBudget(f.root)).toThrow();
    expect(() => resolveLocalAsset(f.root, page, '../outside.js')).toThrow('escapes build folder');
    expect(resolveLocalAsset(f.root, page, 'https://example.org/external.js')).toBeNull();
  });

  it('CLI returns zero when under budget and nonzero on a breach', () => {
    const f = fixture();
    const script = fileURLToPath(new URL('../../scripts/perf-budget.mjs', import.meta.url));
    f.file('index.html', '<html><body>sample fixture</body></html>');
    const ok = spawnSync(process.execPath, [script, f.root], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('1/1 pages within budget');

    f.file('large.html', randomBytes(150_000).toString('base64'));
    const over = spawnSync(process.execPath, [script, f.root], { encoding: 'utf8' });
    expect(over.status).toBe(1);
    expect(over.stdout).toContain('OVER: html');
  });

  it('rejects symlinks and empty outputs', () => {
    const f = fixture();
    expect(() => scanPerformanceBudget(f.root)).toThrow('No HTML pages');
    f.file('index.html', '<html></html>');
    symlinkSync(join(f.root, 'index.html'), join(f.root, 'other.html'));
    expect(() => scanPerformanceBudget(f.root)).toThrow('Symbolic link');
  });

  it('uses named per-route budgets while an unknown route inherits the default limits', () => {
    const fallback = { html: 10, js: 20, css: 30, total: 60 };
    const override = { 'play.html': { label: 'Daily games', js: 40, total: 80 } };
    expect(budgetsForRoute('play.html', fallback, override)).toEqual({
      label: 'Daily games', html: 10, js: 40, css: 30, total: 80,
    });
    expect(budgetsForRoute('missing.html', fallback, override)).toEqual({
      label: 'Default', ...fallback,
    });
    expect(budgetsForRoute('toString', fallback, override)).toEqual({
      label: 'Default', ...fallback,
    });
    expect(ROUTE_BUDGETS['preview/anatomy-lab.html']?.label).toBe('Anatomy preview');
  });

  it('checks each page against its effective limit, including a route-specific breach', () => {
    const f = fixture();
    const html = 'A'.repeat(5000);
    f.file('index.html', html);
    f.file('play.html', html);
    f.file('other.html', html);
    const gz = gzipSync(html).length;
    const defaults = { html: gz - 1, js: 1, css: 1, total: gz - 1 };
    const overrides = { 'play.html': { label: 'Daily games', html: gz, total: gz } };
    const pages = scanPerformanceBudget(f.root, defaults, overrides);
    expect(pages.map((page) => [page.page, page.breaches])).toEqual([
      ['index.html', ['html', 'total']],
      ['other.html', ['html', 'total']],
      ['play.html', []],
    ]);
    expect(pages[2]!.limits.label).toBe('Daily games');
    expect(formatPerformanceReport(pages, defaults)).toContain('Daily games');
  });

  it('outputs a valid JSON report with effective route limits, sizes, and summary', () => {
    const f = fixture();
    const html = '<html><body>sample fixture</body></html>';
    f.file('index.html', html);
    f.file('play.html', html);
    const defaults = { html: 20, js: 300, css: 100, total: 60 };
    const overrides = { 'play.html': { label: 'Daily games', html: 100, total: 100 } };
    const pages = scanPerformanceBudget(f.root, defaults, overrides);
    const report = JSON.parse(formatPerformanceJson(pages, defaults, overrides));
    expect(report.schemaVersion).toBe(1);
    expect(report.unit).toBe('gzip-bytes');
    expect(report.defaultBudgets).toEqual(defaults);
    expect(report.routeBudgets).toEqual(overrides);
    expect(report.pages.map((page: { page: string }) => page.page)).toEqual(['index.html', 'play.html']);
    expect(report.pages[0].limits.label).toBe('Default');
    expect(report.pages[1].limits.label).toBe('Daily games');
    expect(report.pages[0].passed).toBe(false);
    expect(report.pages[1].passed).toBe(true);
    expect(report.summary).toEqual({ pages: 2, passed: 1, failed: 1 });
  });

  it('returns structured JSON and a nonzero exit code when a CLI budget is breached', () => {
    const f = fixture();
    const script = fileURLToPath(new URL('../../scripts/perf-budget.mjs', import.meta.url));
    f.file('index.html', '<html>sample fixture</html>');
    const ok = spawnSync(process.execPath, [script, f.root, '--json'], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    const parsed = JSON.parse(ok.stdout);
    expect(parsed.summary).toEqual({ pages: 1, passed: 1, failed: 0 });
    expect(parsed.pages[0].passed).toBe(true);

    f.file('large.html', randomBytes(160_000).toString('base64'));
    const over = spawnSync(process.execPath, [script, '--json', f.root], { encoding: 'utf8' });
    expect(over.status).toBe(1);
    const result = JSON.parse(over.stdout);
    expect(result.pages.find((page: { page: string }) => page.page === 'large.html')!.breaches).toContain('html');
    expect(result.summary.failed).toBe(1);
  });

  it('rejects unknown flags or missing folder rather than presenting success', () => {
    expect(parsePerformanceArgs(['dist'])).toEqual({ folder: 'dist', json: false });
    expect(parsePerformanceArgs(['dist', '--json'])).toEqual({ folder: 'dist', json: true });
    expect(() => parsePerformanceArgs([])).toThrow('Usage');
    expect(() => parsePerformanceArgs(['dist', '--pretty'])).toThrow('Usage');
    expect(() => parsePerformanceArgs(['dist', '--json', '--json'])).toThrow('Usage');
  });
});

#!/usr/bin/env node
/**
 * Route-level transfer-size estimates for Cueory's static build.
 * Only HTML and local JavaScript/CSS are counted. Anatomy models have a
 * separate 3 MB budget and are deliberately outside this check.
 */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

// The only budget table. Values are gzip-compressed bytes per built HTML page.
export const BUDGETS = Object.freeze({
  html: 40 * 1024,
  js: 200 * 1024,
  css: 70 * 1024,
  total: 300 * 1024,
});

const KINDS = ['html', 'js', 'css', 'total'];

/** Parse HTML tag attributes without depending on their order or quote style. */
function tagAttributes(tag) {
  const attrs = new Map();
  const body = tag.replace(/^<\s*[\w-]+/i, '').replace(/\/?\s*>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(pattern)) {
    attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/** Read only direct local JS/CSS references. Imported dependencies are followed separately. */
export function extractHtmlAssetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/<\s*(script|link|astro-island)\b[^>]*>/gi)) {
    const name = match[1].toLowerCase();
    const attrs = tagAttributes(match[0]);
    if (name === 'script' && attrs.has('src')) urls.add(attrs.get('src'));
    if (name === 'astro-island') {
      for (const attr of ['component-url', 'renderer-url', 'before-hydration-url', 'client-url']) {
        if (attrs.has(attr)) urls.add(attrs.get(attr));
      }
    }
    if (name === 'link' && attrs.has('href')) {
      const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
      const as = (attrs.get('as') ?? '').toLowerCase();
      if (rel.includes('stylesheet') || rel.includes('modulepreload') ||
        (rel.includes('preload') && (as === 'style' || as === 'script'))) {
        urls.add(attrs.get('href'));
      }
    }
  }
  return [...urls];
}

/** Static imports in bundled JavaScript and CSS @imports. Lazy imports are not initial loads. */
export function extractImportedAssetUrls(content, kind) {
  if (kind === 'css') {
    return [...content.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)]+))/gi)]
      .map((match) => match[1] ?? match[2] ?? match[3]);
  }
  if (kind === 'js') {
    return [...content.matchAll(/\b(?:import|export)\s*(?:[^"'();]*?\bfrom\s*)?["']([^"']+)["']/g)]
      .map((match) => match[1]);
  }
  return [];
}

/** Static imports in inline module scripts also trigger initial requests. */
export function extractInlineModuleAssetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/<\s*script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = tagAttributes(match[0].slice(0, match[0].indexOf('>') + 1));
    if ((attrs.get('type') ?? '').trim().toLowerCase() !== 'module' || attrs.has('src')) continue;
    for (const url of extractImportedAssetUrls(match[1], 'js')) urls.add(url);
  }
  return [...urls];
}

/** Ignore remote URLs, refuse escape paths, and limit dependencies to JS/CSS. */
export function resolveLocalAsset(root, fromFile, url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const raw = url.trim();
  if (raw.startsWith('//') || raw.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(raw)) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
  } catch {
    throw new Error(`Invalid percent-encoded asset URL: ${raw}`);
  }
  if (pathname.includes('\0') || pathname.includes('\\')) throw new Error(`Unsafe asset URL: ${raw}`);
  const target = pathname.startsWith('/')
    ? resolve(root, `.${pathname}`)
    : resolve(dirname(fromFile), pathname);
  const within = relative(root, target);
  if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new Error(`Asset escapes build folder: ${raw}`);
  }
  const extension = extname(target).toLowerCase();
  const kind = extension === '.css' ? 'css' : ['.js', '.mjs'].includes(extension) ? 'js' : null;
  return kind ? { path: target, kind } : null;
}

/** Pure check: every category and the combined total have independent limits. */
export function budgetBreaches(sizes, budgets = BUDGETS) {
  return KINDS.filter((kind) => sizes[kind] > budgets[kind]);
}

function readableFile(file) {
  const stat = lstatSync(file);
  if (!stat.isFile()) throw new Error(`Not a regular build file: ${file}`);
  return readFileSync(file);
}

function htmlPages(dir, root = dir) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link in build folder: ${relative(root, path)}`);
    if (entry.isDirectory()) result.push(...htmlPages(path, root));
    else if (entry.isFile() && entry.name.endsWith('.html')) result.push(path);
  }
  return result.sort();
}

/** Scan a built site. Each page counts shared dependencies once for that page. */
export function scanPerformanceBudget(folder, budgets = BUDGETS) {
  const root = resolve(folder);
  if (!lstatSync(root).isDirectory()) throw new Error(`Not a build folder: ${root}`);
  const pages = htmlPages(root);
  if (pages.length === 0) throw new Error(`No HTML pages found in build folder: ${root}`);
  const byteCache = new Map();
  const gzipBytes = (file) => {
    if (!byteCache.has(file)) byteCache.set(file, gzipSync(readableFile(file)).length);
    return byteCache.get(file);
  };
  return pages.map((file) => {
    const sizes = { html: gzipBytes(file), js: 0, css: 0, total: 0 };
    const visited = new Set();
    const html = readableFile(file).toString('utf8');
    const urls = [...extractHtmlAssetUrls(html), ...extractInlineModuleAssetUrls(html)];
    const queue = urls.map((url) => resolveLocalAsset(root, file, url)).filter(Boolean);
    while (queue.length) {
      const asset = queue.shift();
      if (visited.has(asset.path)) continue;
      visited.add(asset.path);
      const source = readableFile(asset.path);
      sizes[asset.kind] += gzipBytes(asset.path);
      for (const url of extractImportedAssetUrls(source.toString('utf8'), asset.kind)) {
        const imported = resolveLocalAsset(root, asset.path, url);
        if (imported && !visited.has(imported.path)) queue.push(imported);
      }
    }
    sizes.total = sizes.html + sizes.js + sizes.css;
    return {
      page: relative(root, file).split(sep).join('/'),
      ...sizes,
      breaches: budgetBreaches(sizes, budgets),
    };
  });
}

/** Plain-text report designed for terminal logs and code review. */
export function formatPerformanceReport(pages, budgets = BUDGETS) {
  const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
  const header = `Budgets (gzip): HTML ${kib(budgets.html)}, JS ${kib(budgets.js)}, CSS ${kib(budgets.css)}, total ${kib(budgets.total)}`;
  const lines = [header, '', 'Page | HTML | JS | CSS | Total | Result'];
  for (const page of pages) {
    lines.push(`${page.page} | ${kib(page.html)} | ${kib(page.js)} | ${kib(page.css)} | ${kib(page.total)} | ${page.breaches.length ? `OVER: ${page.breaches.join(', ')}` : 'PASS'}`);
  }
  const failed = pages.filter((page) => page.breaches.length).length;
  lines.push('', `${pages.length - failed}/${pages.length} pages within budget${failed ? `; ${failed} over budget` : ''}.`);
  return lines.join('\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) {
      throw new Error('Usage: node scripts/perf-budget.mjs <dist-folder>');
    }
    const pages = scanPerformanceBudget(process.argv[2]);
    console.log(formatPerformanceReport(pages));
    if (pages.some((page) => page.breaches.length)) process.exitCode = 1;
  } catch (error) {
    console.error(`Performance budget check failed: ${error.message}`);
    process.exitCode = 1;
  }
}

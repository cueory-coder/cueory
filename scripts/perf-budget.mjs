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

// PROVISIONAL, NOT MEASURED. Replace after Claude supplies staging --json data.
// This is the only per-route override table. All other routes use BUDGETS.
// Partial entries inherit the default limits. These are safety thresholds,
// not claims about today's output size or a final performance target.
export const ROUTE_BUDGETS = Object.freeze({
  'play.html': Object.freeze({ label: 'Daily games', js: 240 * 1024, total: 360 * 1024 }),
  'play/stat.html': Object.freeze({ label: 'Stat game', js: 220 * 1024, total: 340 * 1024 }),
  'play/hello-cards.html': Object.freeze({ label: 'Hello cards game', js: 220 * 1024, total: 340 * 1024 }),
  'preview/anatomy-lab.html': Object.freeze({ label: 'Anatomy preview', js: 260 * 1024, total: 380 * 1024 }),
  'preview/body-viewer.html': Object.freeze({ label: 'Body viewer preview', js: 260 * 1024, total: 380 * 1024 }),
});

const KINDS = ['html', 'js', 'css', 'total'];

/** Return the effective limits for a route (unknown routes inherit defaults). */
export function budgetsForRoute(page, defaults = BUDGETS, overrides = ROUTE_BUDGETS) {
  const override = Object.hasOwn(overrides, page) ? overrides[page] : null;
  return {
    label: override?.label ?? 'Default',
    html: override?.html ?? defaults.html,
    js: override?.js ?? defaults.js,
    css: override?.css ?? defaults.css,
    total: override?.total ?? defaults.total,
  };
}


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

/** Visit real start tags, excluding comments and markup-like text inside raw-text elements. */
function* htmlElements(html) {
  const tags = /<!--[\s\S]*?(?:-->|$)|<\/?([A-Za-z][\w:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
  const rawText = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);
  // With scripts enabled, <noscript> content and ordinary <template>
  // subtrees are inert. A declarative shadow-root template may load assets.
  const inertContainers = [];
  let match;
  while ((match = tags.exec(html))) {
    if (!match[1]) continue;
    const name = match[1].toLowerCase();
    const isClosing = /^<\//.test(match[0]);
    if (name === 'template' || name === 'noscript') {
      if (isClosing) {
        if (inertContainers.at(-1)?.name === name) inertContainers.pop();
      } else {
        const mode = name === 'template' ? (tagAttributes(match[0]).get('shadowrootmode') ?? '').toLowerCase() : '';
        inertContainers.push({ name, inert: name === 'noscript' || (mode !== 'open' && mode !== 'closed') });
      }
      continue;
    }
    if (isClosing) continue;
    let body = '';
    if (rawText.has(name)) {
      const closing = new RegExp('</\\s*' + name + '\\s*>', 'gi');
      closing.lastIndex = tags.lastIndex;
      const end = closing.exec(html);
      body = html.slice(tags.lastIndex, end ? end.index : html.length);
      tags.lastIndex = end ? closing.lastIndex : html.length;
    }
    if (!inertContainers.some((container) => container.inert)) yield { name, tag: match[0], body };
  }
}

/** Read only direct local JS/CSS references. Imported dependencies are followed separately. */
export function extractHtmlAssetUrls(html) {
  const urls = new Set();
  for (const { name, tag } of htmlElements(html)) {
    if (!['script', 'link', 'astro-island'].includes(name)) continue;
    const attrs = tagAttributes(tag);
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

/** Extract module import paths without reading comments, strings or templates as code. */
function javascriptTokens(source) {
  const tokens = [];
  const wordStart = /[A-Za-z_$]/;
  const wordBody = /[A-Za-z0-9_$]/;
  const skipString = (at) => {
    const quote = source[at++];
    while (at < source.length) {
      if (source[at] === '\\') { at += 2; continue; }
      if (source[at++] === quote) break;
    }
    return at;
  };
  const skipLineComment = (at) => {
    const end = source.indexOf('\n', at + 2);
    return end === -1 ? source.length : end;
  };
  const skipBlockComment = (at) => {
    const end = source.indexOf('*/', at + 2);
    return end === -1 ? source.length : end + 2;
  };
  // Template interpolation can itself contain strings or nested templates.
  const skipExpression = (initial) => {
    let at = initial;
    let depth = 1;
    while (at < source.length && depth > 0) {
      if (source[at] === '"' || source[at] === "'") { at = skipString(at); continue; }
      if (source[at] === '`') { at = skipTemplate(at); continue; }
      if (source.startsWith('//', at)) { at = skipLineComment(at); continue; }
      if (source.startsWith('/*', at)) { at = skipBlockComment(at); continue; }
      if (source[at] === '{') depth += 1;
      if (source[at] === '}') depth -= 1;
      at += 1;
    }
    return at;
  };
  const skipTemplate = (initial) => {
    let at = initial + 1;
    while (at < source.length) {
      if (source[at] === '\\') { at += 2; continue; }
      if (source[at] === '`') return at + 1;
      if (source[at] === '$' && source[at + 1] === '{') { at = skipExpression(at + 2); continue; }
      at += 1;
    }
    return at;
  };
  const startsRegex = () => {
    const prior = tokens.at(-1);
    return !prior ||
      (prior.kind === 'punct' && /[([{=,:;!?&|+*%^~<>-]/.test(prior.value)) ||
      (prior.kind === 'word' && /^(?:return|throw|case|yield|await|delete|void|typeof|instanceof|in|of|else)$/.test(prior.value));
  };
  const skipRegex = (initial) => {
    let at = initial + 1;
    let inClass = false;
    while (at < source.length && source[at] !== '\n') {
      if (source[at] === '\\') { at += 2; continue; }
      if (source[at] === '[') inClass = true;
      else if (source[at] === ']') inClass = false;
      else if (source[at] === '/' && !inClass) {
        at += 1;
        while (/[a-z]/i.test(source[at] ?? '')) at += 1;
        return at;
      }
      at += 1;
    }
    return initial;
  };
  for (let at = 0; at < source.length;) {
    const ch = source[at];
    if (/\s/.test(ch)) { at += 1; continue; }
    if (source.startsWith('//', at)) { at = skipLineComment(at); continue; }
    if (source.startsWith('/*', at)) { at = skipBlockComment(at); continue; }
    if (ch === '"' || ch === "'") {
      const end = skipString(at);
      tokens.push({ kind: 'string', value: source.slice(at + 1, end - 1) });
      at = end;
      continue;
    }
    if (ch === '`') { at = skipTemplate(at); tokens.push({ kind: 'punct', value: '<template>' }); continue; }
    if (ch === '/' && startsRegex()) {
      const end = skipRegex(at);
      if (end > at) { at = end; tokens.push({ kind: 'punct', value: '<regex>' }); continue; }
    }
    if (wordStart.test(ch)) {
      let end = at + 1;
      while (end < source.length && wordBody.test(source[end])) end += 1;
      tokens.push({ kind: 'word', value: source.slice(at, end) });
      at = end;
      continue;
    }
    tokens.push({ kind: 'punct', value: ch });
    at += 1;
  }
  return tokens;
}

/** Static module declarations only, excluding dynamic imports and non-code text. */
function staticJavascriptImports(content) {
  const tokens = javascriptTokens(content);
  const imports = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    if (current.kind !== 'word' || !['import', 'export'].includes(current.value)) continue;
    const next = tokens[i + 1];
    if (!next || next.value === '(' || next.value === '.' || tokens[i - 1]?.value === '.') continue;
    if (current.value === 'import' && next.kind === 'string') {
      imports.push(next.value);
      continue;
    }
    if (current.value === 'export' && !['{', '*'].includes(next.value)) continue;
    for (let j = i + 1; j < tokens.length && tokens[j].value !== ';'; j += 1) {
      if (tokens[j].kind === 'word' && tokens[j].value === 'from' && tokens[j + 1]?.kind === 'string') {
        imports.push(tokens[j + 1].value);
        break;
      }
    }
  }
  return imports;
}

/** Find real CSS @import directives, skipping comments and quoted content. */
function staticCssImports(content) {
  const imports = [];
  const skipComment = (at) => {
    const end = content.indexOf('*/', at + 2);
    return end < 0 ? content.length : end + 2;
  };
  const skipString = (at) => {
    const quote = content[at++];
    while (at < content.length) {
      if (content[at] === '\\') { at += 2; continue; }
      if (content[at++] === quote) break;
    }
    return at;
  };
  const skipTrivia = (start) => {
    let at = start;
    while (at < content.length) {
      if (/\s/.test(content[at])) { at += 1; continue; }
      if (content.startsWith('/*', at)) { at = skipComment(at); continue; }
      break;
    }
    return at;
  };
  for (let at = 0; at < content.length;) {
    if (content.startsWith('/*', at)) { at = skipComment(at); continue; }
    if (content[at] === '"' || content[at] === "'") { at = skipString(at); continue; }
    if (content.slice(at, at + 7).toLowerCase() !== '@import' || /[\w-]/.test(content[at + 7] ?? '')) {
      at += 1;
      continue;
    }
    let pos = skipTrivia(at + 7);
    let wrapped = false;
    const urlStart = /^url\s*\(/i.exec(content.slice(pos));
    if (urlStart) {
      pos = skipTrivia(pos + urlStart[0].length);
      wrapped = true;
    }
    let path = null;
    if (content[pos] === '"' || content[pos] === "'") {
      const end = skipString(pos);
      if (end > pos + 1 && content[end - 1] === content[pos]) path = content.slice(pos + 1, end - 1);
      pos = end;
    } else if (wrapped) {
      const start = pos;
      while (pos < content.length && !/[\s)]/.test(content[pos]) && !content.startsWith('/*', pos)) pos += 1;
      if (pos > start) path = content.slice(start, pos);
    }
    if (wrapped) {
      pos = skipTrivia(pos);
      if (content[pos] !== ')') path = null;
      else pos += 1;
    }
    if (path) imports.push(path);
    at = Math.max(pos, at + 7);
  }
  return imports;
}

/** Static imports in bundled JavaScript and CSS @imports. Lazy imports are not initial loads. */
export function extractImportedAssetUrls(content, kind) {
  if (kind === 'css') {
    return staticCssImports(content);
  }
  if (kind === 'js') {
    return staticJavascriptImports(content);
  }
  return [];
}

/** Static imports in inline module scripts also trigger initial requests. */
export function extractInlineModuleAssetUrls(html) {
  const urls = new Set();
  for (const { name, tag, body } of htmlElements(html)) {
    if (name !== 'script') continue;
    const attrs = tagAttributes(tag);
    if ((attrs.get('type') ?? '').trim().toLowerCase() !== 'module' || attrs.has('src')) continue;
    for (const url of extractImportedAssetUrls(body, 'js')) urls.add(url);
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
export function scanPerformanceBudget(folder, budgets = BUDGETS, routeBudgets = ROUTE_BUDGETS) {
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
    const page = relative(root, file).split(sep).join('/');
    const limits = budgetsForRoute(page, budgets, routeBudgets);
    return { page, ...sizes, limits, breaches: budgetBreaches(sizes, limits) };
  });
}

/** Plain-text report designed for terminal logs and code review. */
export function formatPerformanceReport(pages, budgets = BUDGETS) {
  const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
  const header = `Budgets (gzip): HTML ${kib(budgets.html)}, JS ${kib(budgets.js)}, CSS ${kib(budgets.css)}, total ${kib(budgets.total)}`;
  const lines = [header, '', 'Page | Budget | HTML | JS | CSS | Total | Result'];
  for (const page of pages) {
    const label = page.limits?.label ?? 'Default';
    const budgetsText = label === 'Default' ? 'Default' :
      `${label} (HTML ${kib(page.limits.html)}, JS ${kib(page.limits.js)}, CSS ${kib(page.limits.css)}, total ${kib(page.limits.total)})`;
    lines.push(`${page.page} | ${budgetsText} | ${kib(page.html)} | ${kib(page.js)} | ${kib(page.css)} | ${kib(page.total)} | ${page.breaches.length ? `OVER: ${page.breaches.join(', ')}` : 'PASS'}`);
  }
  const failed = pages.filter((page) => page.breaches.length).length;
  lines.push('', `${pages.length - failed}/${pages.length} pages within budget${failed ? `; ${failed} over budget` : ''}.`);
  return lines.join('\n');
}

/** Machine-readable, versioned report with gzip bytes and per-route limits. */
export function formatPerformanceJson(pages, budgets = BUDGETS, routeBudgets = ROUTE_BUDGETS) {
  const failed = pages.filter((page) => page.breaches.length).length;
  return JSON.stringify({
    schemaVersion: 1,
    unit: 'gzip-bytes',
    defaultBudgets: budgets,
    routeBudgets,
    pages: pages.map((page) => ({ ...page, passed: page.breaches.length === 0 })),
    summary: { pages: pages.length, passed: pages.length - failed, failed },
  }, null, 2);
}

/** The folder can be before or after --json, but all other flags are errors. */
export function parsePerformanceArgs(args) {
  const flags = args.filter((arg) => arg === '--json');
  const folders = args.filter((arg) => arg !== '--json');
  if (flags.length > 1 || folders.length !== 1 || folders[0].startsWith('--')) {
    throw new Error('Usage: node scripts/perf-budget.mjs <dist-folder> [--json]');
  }
  return { folder: folders[0], json: flags.length === 1 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { folder, json } = parsePerformanceArgs(process.argv.slice(2));
    const pages = scanPerformanceBudget(folder);
    console.log(json ? formatPerformanceJson(pages) : formatPerformanceReport(pages));
    if (pages.some((page) => page.breaches.length)) process.exitCode = 1;
  } catch (error) {
    console.error(`Performance budget check failed: ${error.message}`);
    process.exitCode = 1;
  }
}

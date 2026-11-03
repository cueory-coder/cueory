/** Report launch placeholders in built HTML. This never changes files or blocks a release. */
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const dist = resolve('dist');
const warnings = [];

function htmlFiles(folder) {
  let entries;
  try {
    entries = readdirSync(folder, { withFileTypes: true });
  } catch {
    warnings.push(`could not read ${relative(process.cwd(), folder) || '.'}`);
    return [];
  }
  return entries.flatMap(entry => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const path = resolve(folder, entry.name);
    // Do not follow links outside the generated build.
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && /\.html$/i.test(entry.name) ? [path] : [];
  });
}

function decode(text) {
  const named = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|quot|apos|lt|gt);/gi, (entity, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()];
    const value = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  });
}

function attributes(tag) {
  const result = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    result.set(match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return result;
}

function report(path) {
  const file = relative(dist, path).split(sep).join('/');
  const route = file === 'index.html' ? '/' : file.endsWith('/index.html') ? `/${file.slice(0, -11)}` :
    file === '404.html' ? '/404.html' : `/${file.slice(0, -5)}`;
  let html;
  try {
    html = readFileSync(path, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  } catch {
    warnings.push(`could not read dist/${file}`);
    return `${route} | unreadable`;
  }
  let markers = 0;
  let noindex = false;
  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs.get('data-placeholder') === 'CHRISTIAN-TEXT') markers++;
    if (/^<meta\b/i.test(match[0]) && attrs.get('name')?.toLowerCase() === 'robots' &&
        /\bnoindex\b/i.test(attrs.get('content') ?? '')) noindex = true;
  }
  const text = decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
  const count = pattern => [...text.matchAll(pattern)].length;
  return `${route} | CHRISTIAN-TEXT=${markers} | coming soon=${count(/\bcoming\s+soon\b/gi)}` +
    ` | sample=${count(/\bsample\b/gi)} | placeholder=${count(/\bplaceholder\b/gi)}` +
    ` | opens soon=${count(/\bopens\s+soon\b/gi)} | noindex=${noindex ? 'yes' : 'no'}`;
}

try {
  const files = htmlFiles(dist).sort((a, b) => a.localeCompare(b));
  console.log('Cueory launch readiness report (built HTML only)');
  for (const path of files) console.log(report(path));
  for (const warning of warnings) console.log(`warning: ${warning}`);
  if (!files.length) console.log('No HTML pages scanned. Run npm run build first.');
  console.log(`Pages: ${files.length}. Report only; exit code 0.`);
} catch {
  // A diagnostic must not turn an unreadable or incomplete build into a failed command.
  console.log('The report could not finish. Check dist/ and run the build again.');
}
process.exitCode = 0;

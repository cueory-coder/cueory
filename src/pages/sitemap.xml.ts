import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { indexablePages } from '../config/routes';
import { buildCatalog, contentEntryId, generatedRoutes, type CompanionFile, type LessonFile } from '../lessons/catalog';
import { parseLessonMap } from '../islands/lessonmap';

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/** Return the Layout opening tag, respecting quoted text and JSX expression braces. */
export function layoutOpeningProps(source: string): string | undefined {
  const markup = source
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const start = /<Layout(?=[\s/>])/.exec(markup)?.index;
  if (start === undefined) return undefined;

  const propsStart = start + '<Layout'.length;
  let braces = 0;
  let quote: string | undefined;
  let escaped = false;
  for (let i = propsStart; i < markup.length; i++) {
    const char = markup[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
    } else if (char === '{') {
      braces++;
    } else if (char === '}' && braces > 0) {
      braces--;
    } else if (char === '>' && braces === 0) {
      return markup.slice(propsStart, i);
    }
  }
  return undefined;
}

/** Consume an attribute value so text inside another prop cannot impersonate noindex. */
function attributeValueEnd(props: string, start: number): number {
  const first = props[start];
  if (first !== '"' && first !== "'" && first !== '{') {
    let i = start;
    while (i < props.length && !/[\s/]/.test(props[i])) i++;
    return i;
  }
  let braces = first === '{' ? 1 : 0;
  let quote: string | undefined = first === '{' ? undefined : first;
  let escaped = false;
  for (let i = start + 1; i < props.length; i++) {
    const char = props[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) {
        quote = undefined;
        if (first !== '{') return i + 1;
      }
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
    } else if (char === '{') {
      braces++;
    } else if (char === '}' && --braces === 0) {
      return i + 1;
    }
  }
  return props.length;
}

/** Check an actual Layout attribute, not a comment, another prop's value or an unrelated word. */
export function sourceDeclaresNoindex(source: string): boolean {
  const props = layoutOpeningProps(source);
  if (props === undefined) return true;
  let i = 0;
  while (i < props.length) {
    while (i < props.length && /[\s/]/.test(props[i])) i++;
    // A JSX spread can supply noindex. Source inspection cannot establish its value,
    // even if an explicit false appears elsewhere, so exclude this page from indexing.
    if (props[i] === '{') return true;
    const attr = /^[^\s=/>{]+/.exec(props.slice(i));
    if (!attr) {
      i++;
      continue;
    }
    const name = attr[0];
    i += name.length;
    while (i < props.length && /\s/.test(props[i])) i++;
    let value: string | undefined;
    if (props[i] === '=') {
      i++;
      while (i < props.length && /\s/.test(props[i])) i++;
      const start = i;
      i = attributeValueEnd(props, i);
      value = props.slice(start, i);
    }
    if (name === 'noindex') {
      // Dynamic values are excluded conservatively. Only explicit false permits indexing.
      if (value !== '{false}') return true;
      // Continue scanning: an unknown JSX spread after noindex={false} can override it.
    }
  }
  return false;
}

/** Use the same catalog builder as getStaticPaths to validate dynamic lesson URLs.
 * A [lesson] template existing on disk does not mean an arbitrary slug is built.
 */
function generatedLessonPaths(): ReadonlySet<string> {
  type Entry<T> = { id: string; data: T };
  function contentEntries<T>(collection: string): Entry<T>[] {
    const root = resolve('content', collection);
    if (!existsSync(root)) return [];
    // Match content.config.ts: lessons/cards recurse, while fill-in/organizer use *.json.
    const recursive = collection === 'lessons' || collection === 'cards';
    const files: string[] = [];
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = resolve(dir, entry.name);
        if (entry.isDirectory() && recursive) visit(file);
        else if (entry.isFile() && file.endsWith('.json')) files.push(file);
      }
    };
    visit(root);
    return files.map((file) => ({
      id: contentEntryId(relative(root, file)),
      data: JSON.parse(readFileSync(file, 'utf8')) as T,
    }));
  }
  // If the content cannot be validated, fail closed. The Astro loader rejects
  // malformed source content independently when building the lesson pages.
  try {
    const map = parseLessonMap(readFileSync(resolve('docs/curriculum/medsurg-lesson-map.csv'), 'utf8'));
    if (map.problems.length) return new Set();
    const catalog = buildCatalog({
      lessons: contentEntries<LessonFile['data']>('lessons'),
      cards: contentEntries<CompanionFile['data']>('cards'),
      fillIn: contentEntries<CompanionFile['data']>('fill-in'),
      organizer: contentEntries<CompanionFile['data']>('organizer'),
      units: map.units,
    });
    return catalog.problems.length ? new Set() : new Set(generatedRoutes(catalog));
  } catch {
    return new Set();
  }
}

/** Resolve an indexable route to the page that renders it, including generated lesson pages. */
export function pageSourcePath(route: string): string | undefined {
  const url = new URL(route, site.url);
  // A full URL from another origin is not a local sitemap route.
  if (url.origin !== new URL(site.url).origin) return undefined;
  const parts = url.pathname.split('/').filter(Boolean);
  // Paths come from our own route catalog, but never let a malformed route read arbitrary files.
  if (!parts.every((part) => /^[a-z0-9-]+$/.test(part))) return undefined;
  const slug = parts.join('/');
  const candidates = parts.length ? [`${slug}.astro`, `${slug}/index.astro`] : ['index.astro'];
  if (parts[0] === 'learn' && parts.length >= 2 && generatedLessonPaths().has(url.pathname)) {
    const mode = parts.slice(2).join('/') || 'index';
    candidates.push(`learn/[lesson]/${mode}.astro`);
  }
  return candidates.map((candidate) => resolve('src/pages', candidate)).find((candidate) => existsSync(candidate));
}

/** Fail closed: unresolved routes must never appear in the sitemap. */
export function routeDeclaresNoindex(route: string): boolean {
  const source = pageSourcePath(route);
  return source === undefined || sourceDeclaresNoindex(readFileSync(source, 'utf8'));
}

export function sitemapXml(pages: readonly string[] = indexablePages): string {
  const urls = pages
    .filter((page) => !routeDeclaresNoindex(page))
    .map((page) => `<url><loc>${escapeXml(new URL(page, site.url).toString())}</loc></url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/** The fixed pages plus every page generated from /content (Task 300), each once, excluding noindex pages. */
export async function sitemapPages(): Promise<string[]> {
  // Loaded here, not at the top, so unit tests can import sitemapXml without Astro's content layer.
  const { lessonCatalog } = await import('../lessons/load');
  return [...new Set([...indexablePages, ...generatedRoutes(await lessonCatalog())])]
    .filter((page) => !routeDeclaresNoindex(page));
}

export const GET: APIRoute = async () => new Response(sitemapXml(await sitemapPages()), {
  headers: {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  },
});

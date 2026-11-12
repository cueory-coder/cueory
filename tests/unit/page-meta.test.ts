import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const PAGES_ROOT = resolve('src/pages');
const DIST_ROOT = resolve('dist');

function filesEndingIn(folder: string, extension: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const file = join(folder, entry.name);
    return entry.isDirectory() ? filesEndingIn(file, extension) : entry.isFile() && file.endsWith(extension) ? [file] : [];
  }).sort();
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match?.[1] ?? match?.[2];
}

function decoded(value: string): string {
  const named: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const n = entity[1]?.toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

interface PageMeta {
  titles: string[];
  descriptions: string[];
  noindex: boolean;
}

/** Inspect the rendered head, not title-looking strings in a body, comment or script. */
function pageMeta(html: string): PageMeta {
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, '');
  const head = uncommented.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? '';
  const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)]
    .map((match) => decoded(match[1].trim()));
  const metaTags = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const descriptions = metaTags
    .filter((tag) => attribute(tag, 'name')?.toLowerCase() === 'description')
    .map((tag) => decoded(attribute(tag, 'content') ?? '').trim());
  const noindex = metaTags
    .filter((tag) => attribute(tag, 'name')?.toLowerCase() === 'robots')
    .some((tag) => /(?:^|[,\s])noindex(?:$|[,\s])/i.test(attribute(tag, 'content') ?? ''));
  return { titles, descriptions, noindex };
}

function routeFor(file: string): string {
  const path = relative(DIST_ROOT, file).replaceAll('\\', '/').replace(/\.html$/, '');
  return path === 'index' ? '/' : `/${path.replace(/\/index$/, '')}`;
}

function size(value: string): number { return Array.from(value).length; }
function key(value: string): string { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }

/**
 * Exact existing copy that another issue owner (or Christian) must approve changing.
 * Each exception is only for the specific old text, not for any shorter replacement.
 * See W18 issue #18 for proposed wording. Remove entries as those pages are fixed.
 */
const COPY_EXCEPTIONS: Readonly<Record<string, { title?: string; description?: string }>> = {
  '/': { title: 'cueory' }, // Brand wordmark is intentionally six characters; owner must decide a longer search title.
  '/about': { description: 'About cueory and our mission.' }, // Existing about-page placeholder is below 50 chars.
  '/coming-soon': { description: 'Planned courses and features for cueory.' }, // Existing teaser is below 50 chars.
  '/courses': { description: 'Nursing courses on cueory.' }, // Existing course intro is below 50 chars.
  // Private/noindex routes: their current text is pinned, not silently exempted from all checks.
  '/account': { description: 'Your cueory account settings.' },
  '/admin/flags': { description: "cueory's private report inbox." },
  '/disclaimer': { description: 'Cueory is a study aid, not medical advice.' },
  '/learn/video-sample': { description: 'A sample of the lesson video player.' },
  '/preview/anatomy-lab': { description: 'Preview of the anatomy lab.' },
  '/preview/anatomy-text': { description: 'Text-only anatomy structure names.' },
  '/preview/prose': { description: "A private preview of Cueory's reading layout." },
  '/preview/reminders': { description: 'A non-sending preview of review reminder choices.' },
  '/preview/share': { description: 'A private preview of the share sheet component.' },
  '/preview/survey': { description: 'UI preview of the semester finals survey prompt.' },
  '/reset-password': { description: 'Choose a new password for your cueory account.' },
  '/signin': { description: 'Sign in to your cueory account.' },
  '/signup': { description: 'Create your free cueory account.' },
  '/terms': { description: 'The terms for using Cueory.' },
};

// These routes intentionally inherit Layout's site-wide fallback. The two private routes
// are noindex. Pin the only allowed description duplication to this exact set and text.
const SHARED_DEFAULT_ROUTES = new Set(['/', '/auth/callback', '/subscribed']);

/** These three use Layout's documented site.description fallback. */
const DEFAULT_DESCRIPTION_PAGES = new Set([
  'index.astro', // Site's home page uses its canonical site description.
  'auth/callback.astro', // Private sign-in completion, noindex.
  'subscribed.astro', // Private newsletter confirmation, noindex.
]);

describe('W18: page metadata', () => {
  it('declares Layout, a title and an explicit description on each page (except documented fallbacks)', () => {
    const problems: string[] = [];
    const sources = filesEndingIn(PAGES_ROOT, '.astro');
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const name = relative(PAGES_ROOT, file).replaceAll('\\', '/');
      const markup = readFileSync(file, 'utf8').replace(/^---[\s\S]*?---/, '').replace(/<!--[\s\S]*?-->/g, '');
      const props = markup.match(/<Layout\b([\s\S]*?)>/)?.[1];
      if (!props) { problems.push(`${name}: missing Layout`); continue; }
      if (!/(?:^|\s)title\s*=/.test(props)) problems.push(`${name}: missing Layout title`);
      if (!/(?:^|\s)description\s*=/.test(props) && !DEFAULT_DESCRIPTION_PAGES.has(name)) {
        problems.push(`${name}: missing Layout description`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('renders one title and description, with useful unique copy for every page', () => {
    const problems: string[] = [];
    const titleOwners = new Map<string, string>();
    const descriptionOwners = new Map<string, string>();
    const htmlFiles = filesEndingIn(DIST_ROOT, '.html');
    expect(htmlFiles.length).toBeGreaterThan(0);

    for (const file of htmlFiles) {
      const route = routeFor(file);
      const meta = pageMeta(readFileSync(file, 'utf8'));
      if (meta.titles.length !== 1 || !meta.titles[0]) problems.push(`${route}: expected one nonempty title`);
      if (meta.descriptions.length !== 1 || !meta.descriptions[0]) problems.push(`${route}: expected one nonempty description`);
      if (meta.titles.length !== 1 || meta.descriptions.length !== 1) continue;

      const title = meta.titles[0];
      const description = meta.descriptions[0];
      if ((size(title) < 10 || size(title) > 60) && COPY_EXCEPTIONS[route]?.title !== title) {
        problems.push(`${route}: title length ${size(title)} (expected 10–60): ${title}`);
      }
      if ((size(description) < 50 || size(description) > 160) && COPY_EXCEPTIONS[route]?.description !== description) {
        problems.push(`${route}: description length ${size(description)} (expected 50–160): ${description}`);
      }

      const earlierTitle = titleOwners.get(key(title));
      if (earlierTitle) problems.push(`${route}: duplicate title with ${earlierTitle}`);
      else titleOwners.set(key(title), route);
      const earlierDescription = descriptionOwners.get(key(description));
      const sharedFallback = description === site.description && earlierDescription !== undefined
        && SHARED_DEFAULT_ROUTES.has(route) && SHARED_DEFAULT_ROUTES.has(earlierDescription);
      if (earlierDescription && !sharedFallback) problems.push(`${route}: duplicate description with ${earlierDescription}`);
      else if (!earlierDescription) descriptionOwners.set(key(description), route);
    }
    expect(problems).toEqual([]);
  });

  it('detects missing, duplicate and noindex metadata in representative rendered markup', () => {
    expect(pageMeta('<head><title>Valid</title><meta name="description" content="Description"></head>'))
      .toEqual({ titles: ['Valid'], descriptions: ['Description'], noindex: false });
    expect(pageMeta('<!-- <head><title>hidden</title></head> --><head><title>Real</title><title>Again</title></head>').titles)
      .toEqual(['Real', 'Again']);
    expect(pageMeta('<head><meta content="noindex, nofollow" name="robots" /><meta content="ok" name="description" /></head>'))
      .toEqual({ titles: [], descriptions: ['ok'], noindex: true });
    expect(pageMeta('<head><title>A &amp; B</title><meta name="description" content="Tom &apos;T&apos;" /></head>').titles)
      .toEqual(['A & B']);
  });
});

/**
 * Site search in the ☰ side panel (D-49). Pagefind builds a static index of the site when it is built; the browser
 * downloads only the small pieces a search needs, from this site, and nothing is sent anywhere else. These are the
 * shared helpers, kept apart from the panel's script so they can be unit tested (tests/unit/search.test.ts).
 */

/** The most results shown at once, so the panel stays short. */
export const MAX_RESULTS = 8;

/** Where `npm run build` puts Pagefind's bundle (pagefind --site dist). */
export const PAGEFIND_URL = '/pagefind/pagefind.js';

/**
 * The address to import Pagefind from on a given try (0 = first). Chromium remembers a failed `import()` of an
 * address for the rest of the page's life, so a retry must ask for a fresh address: same file, with a counter.
 */
export function searchModuleUrl(attempt: number): string {
  return attempt > 0 ? `${PAGEFIND_URL}?retry=${attempt}` : PAGEFIND_URL;
}

/**
 * Load search on demand and share one pending or successful initialization.
 * A failed download must not leave later searches reusing the same rejection.
 * Retry only when another focus or search asks to load, never in a background loop.
 * `initialize` gets the try number, starting at 0, for searchModuleUrl.
 */
export function createSearchLoader<T>(initialize: (attempt: number) => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  let attempts = 0;
  return () => loaded ??= Promise.resolve(attempts++).then(initialize).catch((error: unknown) => {
    loaded = undefined;
    throw error;
  });
}

/**
 * Pagefind names results after the built files (`/privacy.html`, `/learn/study-skills/index.html`), but the site's
 * addresses have no `.html` ending (D-10), so a result links to the address a visitor would type.
 */
export function cleanUrl(url: string): string {
  const [path = '', hash] = url.split('#');
  const clean =
    path
      .replace(/\/index\.html$/, '/')
      .replace(/\.html$/, '')
      .replace(/(.)\/+$/, '$1') || '/';
  return hash === undefined ? clean : `${clean}#${hash}`;
}

/** The line under the search field: how many results, in words. Empty while nothing has been searched. */
export function statusText(term: string, total: number, shown: number): string {
  if (term.trim() === '') return '';
  if (total === 0) return `no results for “${term.trim()}”`;
  if (total === 1) return '1 result';
  if (shown < total) return `${shown} of ${total} results`;
  return `${total} results`;
}

export interface ExcerptPart {
  text: string;
  mark: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Pagefind's excerpt is text with HTML entities and `<mark>` around the words that matched. This splits it into plain
 * pieces, so the panel can show the matched words in bold without ever putting HTML from the index on the page. Any
 * other tag is kept as plain text.
 */
export function excerptParts(excerpt: string): ExcerptPart[] {
  const parts: ExcerptPart[] = [];
  let mark = false;
  for (const piece of excerpt.split(/(<mark>|<\/mark>)/)) {
    if (piece === '<mark>') mark = true;
    else if (piece === '</mark>') mark = false;
    else if (piece !== '') {
      const text = decodeEntities(piece);
      const last = parts.at(-1);
      if (last && last.mark === mark) last.text += text;
      else parts.push({ text, mark });
    }
  }
  return parts;
}

/**
 * Arrow keys in the results: Down from the search field goes to the first result, Up and Down move between results,
 * and Up from the first result goes back to the field. `index` is -1 for the field. Returns the index to focus (-1 is
 * the field), or undefined when the key isn't for moving.
 */
export function moveFocus(index: number, count: number, key: string): number | undefined {
  if (count <= 0) return undefined;
  const boundedIndex = Math.max(-1, Math.min(index, count - 1));
  if (key === 'ArrowDown') return Math.min(boundedIndex + 1, count - 1);
  if (key === 'ArrowUp') return boundedIndex === -1 ? undefined : boundedIndex - 1;
  return undefined;
}

/**
 * When new results replace a list that had keyboard focus on result `index`, where focus goes: the result at the same
 * place, the last result if the new list is shorter, or the search field (-1) when there are no results.
 */
export function keepFocus(index: number, count: number): number {
  return count === 0 ? -1 : Math.min(index, count - 1);
}

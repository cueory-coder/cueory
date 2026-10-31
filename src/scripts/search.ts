/**
 * Site search in the ☰ side panel (D-49). Pagefind builds a static index of the site when it is built; the browser
 * downloads only the small pieces a search needs, from this site, and nothing is sent anywhere else. These are the
 * pure helpers, kept apart from the panel's script so they can be unit tested (tests/unit/search.test.ts).
 */

/** The most results shown at once, so the panel stays short. */
export const MAX_RESULTS = 8;

/** Where `npm run build` puts Pagefind's bundle (pagefind --site dist). */
export const PAGEFIND_URL = '/pagefind/pagefind.js';

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
  if (count === 0) return undefined;
  if (key === 'ArrowDown') return Math.min(index + 1, count - 1);
  if (key === 'ArrowUp') return index === -1 ? undefined : index - 1;
  return undefined;
}

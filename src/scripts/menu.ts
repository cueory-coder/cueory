/**
 * The ☰ side panel and the account corner (D-46). Pure helpers, kept apart from the page scripts so they can be unit
 * tested (tests/unit/menu.test.ts).
 */

/**
 * Which side-panel link is marked as the current page (aria-current="page" and a short line beside it). An exact
 * match wins; otherwise the longest link that the path sits under (a lesson's cards page counts as "lessons").
 * Links to a spot on a page (`/#…`) never match, and the home page only matches exactly. Trailing slashes and
 * `.html` endings are ignored.
 */
export function currentHref(pathname: string, hrefs: readonly string[]): string | undefined {
  const path = normalise(pathname);
  const pages = hrefs.filter((href) => !href.includes('#'));
  const exact = pages.find((href) => normalise(href) === path);
  if (exact !== undefined) return exact;
  return pages
    .filter((href) => normalise(href) !== '/' && path.startsWith(`${normalise(href)}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/** Static builds name pages `support.html` and `index.html` (D-10), so both forms count as the same page. */
function normalise(path: string): string {
  const trimmed = path
    .replace(/\/index\.html$/, '/')
    .replace(/\.html$/, '')
    .replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Menu sections use existing links from the site settings; none are duplicated or dropped. */
export interface MenuEntry {
  readonly href: string;
  readonly label: string;
  readonly note?: string;
}

export interface MenuSection {
  readonly heading: 'study' | 'play' | 'about';
  readonly links: readonly MenuEntry[];
}

/** Keep home first, then study, play and about. New primary links default to study so they remain visible. */
export function groupMenuLinks(
  main: readonly MenuEntry[],
  small: readonly MenuEntry[],
): { home: MenuEntry[]; sections: MenuSection[] } {
  return {
    home: main.filter((link) => link.href === '/'),
    sections: [
      {
        heading: 'study',
        links: main.filter((link) => link.href !== '/' && link.href !== '/play' && link.href !== '/support'),
      },
      { heading: 'play', links: main.filter((link) => link.href === '/play') },
      { heading: 'about', links: [...main.filter((link) => link.href === '/support'), ...small] },
    ],
  };
}

/** Keys that close the side panel and the account menu. */
export function isCloseKey(key: string): boolean {
  return key === 'Escape' || key === 'Esc';
}

/**
 * Keeps Tab inside the open side panel: from the last item Tab goes back to the first, and from the first item
 * Shift+Tab goes to the last. Returns the index to focus, or undefined to let the browser move focus as usual.
 */
export function wrapFocus(index: number, count: number, backwards: boolean): number | undefined {
  if (count === 0) return undefined;
  if (index === -1) return backwards ? count - 1 : 0;
  if (!backwards && index === count - 1) return 0;
  if (backwards && index === 0) return count - 1;
  return undefined;
}

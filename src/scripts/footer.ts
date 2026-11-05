/**
 * The footer bar's chevron (Task 85): it opens and closes the links panel above the bar. Pure helpers, so the
 * behavior can be unit tested without a browser.
 *
 * Without JavaScript the panel stays open and the chevron stays hidden (its space is kept, so the logo stays
 * centered). The footer's script calls setFooterPanel(…, false) once, then flips it on every tap.
 */

export const FOOTER_TOGGLE_LABELS = { open: 'hide footer links', closed: 'show footer links' } as const;

/** The parts of the chevron button and the panel that the toggle changes. */
export interface FooterToggle {
  setAttribute(name: string, value: string): void;
}
export interface FooterPanel {
  /** The DOM also allows "until-found"; the toggle only ever sets true or false. */
  hidden: boolean | string;
}

export function setFooterPanel(button: FooterToggle, panel: FooterPanel, open: boolean): void {
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? FOOTER_TOGGLE_LABELS.open : FOOTER_TOGGLE_LABELS.closed);
}

/** A tap opens a closed panel and closes an open one. */
export function isFooterPanelOpen(button: { getAttribute(name: string): string | null }): boolean {
  return button.getAttribute('aria-expanded') === 'true';
}

/**
 * The page's address as visitors see it. The build writes pages as files (astro.config.mjs `format: 'file'`), so at
 * build time Astro.url.pathname is "/privacy.html" or "/index.html" for what is served as "/privacy" or "/".
 */
export function publicPath(pathname: string): string {
  const path = pathname.replace(/\.html$/, '').replace(/(^|\/)index$/, '$1');
  return path === '' ? '/' : path;
}

/** The flag link's email subject names the page, so a report arrives with its context. */
export function flagMailto(email: string, pathname: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(`flag or comment: ${publicPath(pathname)}`)}`;
}

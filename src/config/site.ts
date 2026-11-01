/**
 * Site-wide settings Christian can change without touching components.
 */
export const site = {
  name: 'Cueory',
  /**
   * The name as the wordmark writes it. Lowercase-styled UI (page titles, buttons, menus) uses this; prose keeps
   * "Cueory" (D-47, all-lowercase brand voice).
   */
  wordmarkName: 'cueory',
  /** Exact motto: always lowercase, with the comma and final period (brand spec section 2). */
  tagline: 'by nursing students, for nursing students.',
  /** Product description (brand spec section 2). */
  description: 'Nursing school is hard enough. Cueory makes studying simpler.',

  /** The live address. */
  url: 'https://cueory.app',

  /** Shows "we're still building. more coming soon." on every page. Set to false to remove it. */
  showBuildingNotice: true,

  /** Christian's tip page. Leave empty to hide the button on /support. */
  tipPageUrl: 'https://ko-fi.com/cueory',

  /** Shown in the footer and on the privacy page. */
  contactEmail: 'hello@cueory.app',
} as const;

/**
 * Launch-updates signup (Kit). The form posts straight to Kit; no Kit script
 * runs on our pages. Leave formAction empty until the Kit form exists: the
 * signup box then says "opening soon" instead of showing a form.
 */
export const newsletter = {
  provider: 'Kit',
  /** The form's "action" address from Kit's HTML embed code. Public, not a secret. */
  formAction: '',
  /** The email field's "name" from Kit's HTML embed code. */
  emailFieldName: 'email_address',
} as const;

/**
 * Cueory's social profiles (D-54; addresses confirmed by Christian on 1 Nov 2026, D-65). Each shows as its platform's
 * one-color mark, linking to the profile in a new tab, in the footer, the ☰ panel and the promo panel. Only profiles
 * with an address show. Leave an address empty to hide that platform.
 */
export const socials = [
  { id: 'instagram', name: 'Instagram', href: 'https://www.instagram.com/cueory.app/' },
  { id: 'tiktok', name: 'TikTok', href: 'https://www.tiktok.com/@cueory' },
  { id: 'youtube', name: 'YouTube', href: 'https://www.youtube.com/@cueory' },
  { id: 'x', name: 'X', href: 'https://x.com/cueory' },
  { id: 'facebook', name: 'Facebook', href: 'https://www.facebook.com/people/Cueory/61596065312423/' },
  { id: 'pinterest', name: 'Pinterest', href: 'https://www.pinterest.com/cueoryapp/' },
] as const;

export const footerLinks = [
  { href: '/privacy', label: 'privacy' },
  { href: '/terms', label: 'terms' },
  { href: '/disclaimer', label: 'disclaimer' },
  { href: '/support', label: 'support cueory' },
] as const;

/**
 * Where the "create your free account" buttons go until accounts exist (ROADMAP Task 2): the launch-updates signup
 * on the home page.
 */
export const accountHref = '/#signup';

/**
 * The ☰ side panel (D-46). Lowercase on purpose (D-47). A link with a note shows it beside the label, for things
 * that aren't open yet. Search joins the top of the panel in its own pull request.
 */
export const menuLinks = [
  { href: '/', label: 'home' },
  { href: '/#ways-to-study', label: 'ways to study' },
  { href: '/learn/study-skills', label: 'lessons' },
  { href: '/play', label: 'daily games' },
  { href: '/progress', label: 'my progress', note: 'saved on this device' },
  { href: '/support', label: 'support cueory' },
] as const;

/** Small links at the bottom of the side panel. */
export const menuSmallLinks = [
  { href: '/privacy', label: 'privacy' },
  { href: '/terms', label: 'terms' },
] as const;

/**
 * The once-only promo panel (D-59), on marketing pages only, never on study screens. It slides down from the top after
 * `delaySeconds`, or as soon as the visitor has scrolled halfway down the page, whichever comes first. Once it has
 * been shown it stays away for `rememberDays`, whether the visitor closed it, clicked it or ignored it. Lowercase brand
 * voice (D-47). When accounts exist (ROADMAP Task 2), the button becomes "create your free account" and goes to
 * sign-up; until then it goes to the launch-updates signup (`accountHref`).
 */
export const promo = {
  /** Set to false to turn the panel off on every page. */
  show: true,
  delaySeconds: 5,
  rememberDays: 30,
  heading: 'welcome to cueory.',
  text: "we're still building. get a few emails about new lessons and the launch.",
  joinLabel: 'join the launch list',
  /** Goes to the tip page (`site.tipPageUrl`, Ko-fi); hidden when that is empty. */
  supportLabel: 'support us while we build',
} as const;

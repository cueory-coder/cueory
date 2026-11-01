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

  /** Shows "We're still building. More coming soon." on every page. Set to false to remove it. */
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
 * Cueory's social profiles (D-54). Each shows as its platform's one-color mark, linking to the profile in a new tab,
 * in the footer and at the bottom of the ☰ panel. Only profiles with an address show. Instagram, TikTok and YouTube
 * are the defaults Christian is confirming; X and Facebook stay empty until he confirms them.
 */
export const socials = [
  { id: 'instagram', name: 'Instagram', href: 'https://instagram.com/cueory' },
  { id: 'tiktok', name: 'TikTok', href: 'https://tiktok.com/@cueory' },
  { id: 'youtube', name: 'YouTube', href: 'https://youtube.com/@cueory' },
  { id: 'x', name: 'X', href: '' },
  { id: 'facebook', name: 'Facebook', href: '' },
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
  { href: accountHref, label: 'my progress', note: 'free account, coming soon' },
  { href: '/support', label: 'support cueory' },
] as const;

/** Small links at the bottom of the side panel. */
export const menuSmallLinks = [
  { href: '/privacy', label: 'privacy' },
  { href: '/terms', label: 'terms' },
] as const;

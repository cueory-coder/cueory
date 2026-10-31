/**
 * Site-wide settings Christian can change without touching components.
 */
export const site = {
  name: 'Cueory',
  tagline: 'By nursing students, for nursing students.',

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

export const footerLinks = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/support', label: 'Support Cueory' },
] as const;

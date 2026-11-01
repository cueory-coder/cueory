/** Sign-in validation and copy. No network calls or browser state. */
export function checkEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return 'enter your email address.';
  const email = value.trim();
  if (email.length > 254) return 'use an email address with no more than 254 characters.';
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || /[\s\u0000-\u001f\u007f]/.test(email)) {
    return 'enter a complete email address, with one @ and a domain.';
  }
  if (!parts[1].includes('.') || parts[1].split('.').some(part => part === '')) {
    return 'include the full domain after @, with a dot between its parts.';
  }
  return null;
}

/** Accept only bounded root-relative destinations, including after URL normalization. */
export function safeNext(raw: unknown, origin: string): string {
  const fallback = '/progress';
  if (typeof raw !== 'string' || raw.length > 1024 || !raw.startsWith('/') || raw.startsWith('//') ||
      /[\\\s\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const base = new URL(origin);
    if (!['http:', 'https:'].includes(base.protocol)) return fallback;
    const target = new URL(raw, base.origin);
    const path = decodeURIComponent(target.pathname);
    if (target.origin !== base.origin || target.pathname.startsWith('//') || path.startsWith('//') ||
        /[\\\u0000-\u001f\u007f]/.test(path)) return fallback;
    return target.pathname + target.search + target.hash;
  } catch {
    return fallback;
  }
}

export type SignInMessage = 'sent' | 'too-many' | 'google-failed' | 'email-failed' | 'unavailable';

export function signInMessage(kind: SignInMessage): string {
  const messages: Record<SignInMessage, string> = {
    sent: 'check your inbox for a sign-in link. open it in this browser.',
    'too-many': 'too many tries. please wait a little before trying again.',
    'google-failed': 'google sign-in did not finish. please try again or use an email link.',
    'email-failed': 'the sign-in link could not be sent. please try again.',
    unavailable: 'accounts open soon. you can get launch updates below.',
  };
  return messages[kind];
}

/** A deadline keeps the visible countdown accurate after a background tab resumes. */
export function resendSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

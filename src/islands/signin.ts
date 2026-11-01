import { checkDisplayName } from './displayname';

/** Auth validation and request contracts. No storage, logging or browser state. */
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

/** Passwords are never trimmed. Supabase's bcrypt boundary is bytes, not UTF-16 length. */
export function checkPassword(value: unknown): string | null {
  if (typeof value !== 'string' || [...value].length < 10) return 'use at least 10 characters.';
  if (new TextEncoder().encode(value).length > 72) {
    return 'use a shorter password. some characters count toward the limit more than once.';
  }
  return null;
}

export type SignInMessage = 'signup-sent' | 'reset-sent' | 'too-many' | 'google-failed' |
  'signin-failed' | 'signup-failed' | 'reset-failed' | 'reset-done' | 'unavailable' | 'recovery-required';

export function signInMessage(kind: SignInMessage): string {
  const messages: Record<SignInMessage, string> = {
    'signup-sent': 'check your inbox to confirm your email. open the link in this browser, or sign in if you already have an account.',
    'reset-sent': 'if that email has an account, a reset link is on its way.',
    'too-many': 'too many tries. please wait a little before trying again.',
    'google-failed': 'google sign-in did not finish. please try again or use your email and password.',
    'signin-failed': "that email and password don't match.",
    'signup-failed': 'your account could not be created. please try again, or sign in if you already have an account.',
    'reset-failed': 'your password could not be changed. please try again or request a new reset link.',
    'reset-done': 'your password has been changed.',
    unavailable: 'accounts open soon. you can get launch updates below.',
    'recovery-required': 'open the reset link from your email in the browser where you requested it. you can request a new link below.',
  };
  return messages[kind];
}

/** A deadline keeps the visible countdown accurate after a background tab resumes. */
export function resendSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export interface AuthResult { error: { status?: number } | null }
/** Supabase v2 shapes, without importing Task 55 before it lands in staging. */
export interface SignInAuth {
  signInWithOAuth(credentials: {
    provider: 'google'; options: { redirectTo: string };
  }): Promise<AuthResult>;
  signUp(credentials: {
    email: string; password: string;
    options: { emailRedirectTo: string; data: { display_name: string } };
  }): Promise<AuthResult>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResult>;
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<AuthResult>;
}
export interface ResetPasswordAuth {
  updateUser(attributes: { password: string }): Promise<AuthResult>;
}
export type AuthAction = 'signin' | 'signup' | 'google' | 'forgot';
export type AuthOutcome =
  | { kind: 'invalid'; field: 'email' | 'password' | 'name'; message: string }
  | { kind: 'feedback'; message: string; cooldown: boolean }
  | { kind: 'redirect'; next: string }
  | { kind: 'oauth' };

export function callbackUrl(origin: string, next: unknown): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('next', safeNext(next, origin));
  return url.href;
}

/** The only credential handoff. Never return provider errors or credentials to display/logging code. */
export async function performAuthAction(auth: SignInAuth | null, action: AuthAction,
  input: { email: string; password: string; name: string }, origin: string, next: unknown): Promise<AuthOutcome> {
  const feedback = (kind: SignInMessage, cooldown = false): AuthOutcome => ({
    kind: 'feedback', message: signInMessage(kind), cooldown,
  });
  if (!auth) return feedback('unavailable');
  if (action !== 'google') {
    if (action === 'signup') {
      const name = checkDisplayName(input.name);
      if (!name.ok) return { kind: 'invalid', field: 'name', message: name.message };
    }
    const emailProblem = checkEmail(input.email);
    if (emailProblem) return { kind: 'invalid', field: 'email', message: emailProblem };
    if (action !== 'forgot') {
      const passwordProblem = checkPassword(input.password);
      if (passwordProblem) return { kind: 'invalid', field: 'password', message: passwordProblem };
    }
  }
  try {
    const email = input.email.trim();
    if (action === 'forgot') {
      // All provider outcomes get identical copy and cooldown. Never reveal whether an email exists.
      await auth.resetPasswordForEmail(email, { redirectTo: callbackUrl(origin, '/reset-password') });
      return feedback('reset-sent', true);
    }
    if (action === 'google') {
      const { error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(origin, next) } });
      return error ? feedback('google-failed', error.status === 429) : { kind: 'oauth' };
    }
    if (action === 'signin') {
      const { error } = await auth.signInWithPassword({ email, password: input.password });
      return error ? feedback('signin-failed', error.status === 429) : { kind: 'redirect', next: safeNext(next, origin) };
    }
    const name = checkDisplayName(input.name);
    if (!name.ok) return { kind: 'invalid', field: 'name', message: name.message };
    const { error } = await auth.signUp({ email, password: input.password,
      options: { emailRedirectTo: callbackUrl(origin, next), data: { display_name: name.name } } });
    // Confirmation must be on in Supabase. Metadata alone does not populate profiles (Task 57 handoff).
    return error ? feedback(error.status === 429 ? 'too-many' : 'signup-failed', error.status === 429)
      : feedback('signup-sent', true);
  } catch {
    return feedback(action === 'forgot' ? 'reset-sent' : action === 'google' ? 'google-failed'
      : action === 'signin' ? 'signin-failed' : 'signup-failed', action === 'forgot');
  }
}

/** recoveryReady comes from the authenticated integration, never from a query parameter. */
export async function changePassword(auth: ResetPasswordAuth | null, recoveryReady: boolean, password: string):
  Promise<{ ok: boolean; message: string }> {
  if (!auth || !recoveryReady) return { ok: false, message: signInMessage('recovery-required') };
  const problem = checkPassword(password);
  if (problem) return { ok: false, message: problem };
  try {
    const { error } = await auth.updateUser({ password });
    return { ok: !error, message: signInMessage(error ? 'reset-failed' : 'reset-done') };
  } catch {
    return { ok: false, message: signInMessage('reset-failed') };
  }
}

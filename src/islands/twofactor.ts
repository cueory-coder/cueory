/**
 * Two-factor sign-in with an authenticator app (TOTP), for /account/two-factor (Task 301).
 * Logic only: no page, no storage. The Supabase auth client is injected, so tests use a fake.
 *
 * Why it matters: the admin functions (Task 65) refuse any session whose JWT `aal` claim isn't `aal2`, and a session
 * only reaches aal2 by verifying a code from a second factor.
 *
 * Supabase docs read first (2 Nov 2026):
 *   - Multi-Factor Authentication, https://supabase.com/docs/guides/auth/auth-mfa : the `aal` claim; "only `verified`
 *     factors should be acted upon"; "users can only unenroll a factor after completing the enrollment flow and
 *     obtaining an `aal2` JWT claim"; for sign-in, "redirect users to a page where they can authenticate using their
 *     additional factor".
 *   - TOTP MFA, https://supabase.com/docs/guides/auth/auth-mfa/totp : enroll returns a QR code (SVG) and a secret to
 *     type in when scanning isn't possible; challenge, then verify with the code; on success the session is upgraded
 *     to aal2; show the code screen when `nextLevel === 'aal2'` and `nextLevel !== currentLevel`; a code is valid for
 *     one 30-second interval, with one interval of clock skew.
 *   - supabase-js reference: auth.mfa.enroll (https://supabase.com/docs/reference/javascript/auth-mfa-enroll: creates
 *     an `unverified` factor; on verifying, "all other sessions are logged out"), challenge, verify, listFactors,
 *     unenroll (https://supabase.com/docs/reference/javascript/auth-mfa-unenroll: "A user has to have an `aal2`
 *     authenticator level in order to unenroll a `verified` factor") and getAuthenticatorAssuranceLevel
 *     (https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel).
 *
 * Checked in @supabase/auth-js 2.118.0 itself: enroll turns `totp.qr_code` into `data:image/svg+xml;utf-8,<svg…>`,
 * listFactors' `totp` list holds verified factors only (`all` holds every factor), and verify saves the new session.
 */
import { safeNext } from './signin';

/** The Supabase v2 error shape this file reads. Only the code and status are used, never the message. */
export interface AuthErr { code?: string; status?: number }
type Reply<T> = Promise<{ data: T | null; error: AuthErr | null }>;
export interface FactorInfo { id: string; factor_type: string; status: string; friendly_name?: string; created_at?: string }

/** The part of `supabase.auth` this page uses. Methods are called on their objects, so their receivers stay intact. */
export interface TwoFactorAuth {
  getSession(): Reply<{ session: unknown }>;
  refreshSession(): Promise<{ error: AuthErr | null }>;
  /** Clear this device's session if the JWT cannot be safely refreshed after removing a factor. */
  signOut(options: { scope: 'local' }): Promise<{ error: AuthErr | null }>;
  mfa: {
    getAuthenticatorAssuranceLevel(): Reply<{ currentLevel: string | null; nextLevel: string | null }>;
    listFactors(): Reply<{ all: FactorInfo[]; totp: FactorInfo[] }>;
    enroll(params: { factorType: 'totp'; friendlyName?: string; issuer?: string }): Reply<{
      id: string; type?: string; totp?: { qr_code?: string; secret?: string; uri?: string };
    }>;
    challenge(params: { factorId: string }): Reply<{ id: string }>;
    verify(params: { factorId: string; challengeId: string; code: string }): Reply<unknown>;
    unenroll(params: { factorId: string }): Reply<unknown>;
  };
}

export type TwoFactorStatus =
  | { kind: 'signed-out' }
  | { kind: 'off' }
  /** Two-factor is on, but this sign-in hasn't entered a code yet (aal1). */
  | { kind: 'needs-code'; factorId: string }
  | { kind: 'on'; factorId: string }
  | { kind: 'failed' };

export interface Enrollment {
  factorId: string;
  /** A data: URL for an <img>, re-encoded here, or null to show only the secret. */
  qr: string | null;
  /** The secret, for typing into the app by hand. */
  secret: string;
}

export type CodeProblem = 'format' | 'wrong' | 'expired' | 'too-many' | 'failed' | 'session-reset';
export type CodeResult = { ok: true } | { ok: false; problem: CodeProblem; message: string };

export const TWO_FACTOR_PATH = '/account/two-factor';
const FRIENDLY_NAME = 'authenticator app';
const ISSUER = 'cueory';

export const CODE_MESSAGES: Readonly<Record<CodeProblem, string>> = Object.freeze({
  format: 'enter the 6-digit code from your authenticator app.',
  wrong: "that code didn't work. check the 6 digits in your app and try again.",
  expired: 'that code timed out. enter the newest code from your app.',
  'too-many': 'too many tries. please wait a minute, then try again.',
  failed: 'something went wrong. please try again.',
  'session-reset': 'we could not update your session, so you were signed out. please sign in again.'
});

const codeFail = (problem: CodeProblem): CodeResult => ({ ok: false, problem, message: CODE_MESSAGES[problem] });

/** Plain strings only: an id from the server goes into a URL path inside supabase-js. */
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{8,64}$/i.test(v);

/** The 6 digits, with spaces or dashes the student typed removed, or null. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

/**
 * A safe <img> source for the QR code. supabase-js sends `data:image/svg+xml;utf-8,` followed by raw SVG, which a `#`
 * in the markup could cut short, so the SVG is percent-encoded into a proper data: URL. The site's CSP already allows
 * `img-src 'self' data:`, and an SVG shown through <img> can't run scripts. Anything else gives null (secret only).
 */
export function qrSource(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 200_000) return null;
  const prefix = /^data:image\/svg\+xml;(?:charset=)?utf-8,/i;
  const svg = prefix.test(raw) ? raw.replace(prefix, '') : raw;
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<svg[\s>]/i.test(svg)) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** The secret in groups of four, easier to read and type. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

function codeProblem(error: AuthErr | null | undefined): CodeProblem {
  if (!error || typeof error !== 'object') return 'failed';
  if (error.code === 'mfa_verification_failed') return 'wrong';
  if (error.code === 'mfa_challenge_expired') return 'expired';
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'too-many';
  return 'failed';
}

const verifiedTotp = (data: { totp?: FactorInfo[] } | null): FactorInfo | undefined =>
  (Array.isArray(data?.totp) ? data!.totp : []).find(f => f && f.factor_type === 'totp' && f.status === 'verified' && isId(f.id));

/** Where this account stands. Any error reads as `failed`, never as "off" (which would invite a second enrollment). */
export async function readStatus(auth: TwoFactorAuth): Promise<TwoFactorStatus> {
  try {
    const session = await auth.getSession();
    if (session.error) return { kind: 'failed' };
    if (!session.data?.session) return { kind: 'signed-out' };
    const level = await auth.mfa.getAuthenticatorAssuranceLevel();
    if (level.error || !level.data) return { kind: 'failed' };
    const factors = await auth.mfa.listFactors();
    if (factors.error || !factors.data) return { kind: 'failed' };
    const factor = verifiedTotp(factors.data);
    if (!factor) return { kind: 'off' };
    return level.data.currentLevel === 'aal2' ? { kind: 'on', factorId: factor.id } : { kind: 'needs-code', factorId: factor.id };
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * Starts adding an authenticator app. First removes any half-finished (unverified) app from an earlier visit, which
 * needs no code, so its name can't clash. Refuses if a verified app is already on: one is enough here.
 */
export async function startEnroll(auth: TwoFactorAuth): Promise<Enrollment | null> {
  try {
    const factors = await auth.mfa.listFactors();
    if (factors.error || !factors.data) return null;
    if (verifiedTotp(factors.data)) return null;
    for (const factor of Array.isArray(factors.data.all) ? factors.data.all : []) {
      if (factor?.factor_type === 'totp' && factor.status !== 'verified' && isId(factor.id)) {
        const removed = await auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) return null;
      }
    }
    const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: FRIENDLY_NAME, issuer: ISSUER });
    if (error || !data || !isId(data.id)) return null;
    const secret = data.totp?.secret;
    if (typeof secret !== 'string' || !/^[A-Z2-7]{16,128}=*$/.test(secret)) return null;
    return { factorId: data.id, qr: qrSource(data.totp?.qr_code), secret };
  } catch {
    return null;
  }
}

/** Abandons an enrollment that was never verified. Best effort: startEnroll also cleans these up next time. */
export async function cancelEnroll(auth: TwoFactorAuth, factorId: string): Promise<void> {
  if (!isId(factorId)) return;
  try { await auth.mfa.unenroll({ factorId }); } catch { /* cleaned up on the next start */ }
}

/**
 * Checks a code: a fresh challenge, then verify. Used to finish enrolling and to finish signing in. On success
 * supabase-js saves the upgraded (aal2) session itself.
 */
export async function confirmCode(auth: TwoFactorAuth, factorId: string, input: string): Promise<CodeResult> {
  const code = normalizeCode(input);
  if (!code) return codeFail('format');
  if (!isId(factorId)) return codeFail('failed');
  try {
    const challenge = await auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data || !isId(challenge.data.id)) return codeFail(codeProblem(challenge.error));
    const verified = await auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    // A missing verification result cannot prove that the session was upgraded to aal2.
    return verified.error || !verified.data ? codeFail(codeProblem(verified.error)) : { ok: true };
  } catch {
    return codeFail('failed');
  }
}

/**
 * Removes the authenticator app. The docs require an aal2 session; this asks for a current code as well, so a session
 * left open on a shared computer can't turn two-factor off without the phone. Then the session is refreshed, so the
 * page and the database see aal1 at once instead of after the token's refresh interval.
 */
export async function removeFactor(auth: TwoFactorAuth, factorId: string, input: string): Promise<CodeResult> {
  const confirmed = await confirmCode(auth, factorId, input);
  if (!confirmed.ok) return confirmed;
  try {
    const removed = await auth.mfa.unenroll({ factorId });
    if (removed.error) return codeFail(codeProblem(removed.error));
  } catch {
    return codeFail('failed');
  }
  // A stale aal2 access token must not remain on this device after unenrollment.
  // Supabase cannot revoke an issued JWT until expiration, so refresh it immediately.
  try {
    const refreshed = await auth.refreshSession();
    if (refreshed && !refreshed.error) return { ok: true };
  } catch { /* fall back to local sign-out */ }
  // Supabase's local scope clears this device without signing out other devices.
  // Never report success if neither refresh nor local sign-out succeeded.
  try {
    const signedOut = await auth.signOut({ scope: 'local' });
    if (signedOut && !signedOut.error) return codeFail('session-reset');
  } catch { /* still failed: do not claim that two-factor is safely removed */ }
  return codeFail('failed');
}

/** The part of the client a sign-in page may have. Pages without it skip the two-factor step. */
export interface LevelReader {
  mfa?: {
    getAuthenticatorAssuranceLevel?(): Promise<{ data: { currentLevel: string | null; nextLevel: string | null } | null; error: unknown }>;
  };
}

/**
 * Where to go after signing in: the two-factor code page first when this account has two-factor on and the session
 * hasn't used it yet (the TOTP docs' rule), then `next`. Any error goes straight to `next`; the database still checks
 * aal2 wherever it matters, so this only spares a refusal.
 */
export async function afterSignIn(auth: LevelReader | null | undefined, next: string, origin: string): Promise<string> {
  const destination = safeNext(next, origin);
  try {
    const read = auth?.mfa?.getAuthenticatorAssuranceLevel;
    if (!auth?.mfa || typeof read !== 'function') return destination;
    const { data, error } = await read.call(auth.mfa);
    if (error || !data) return destination;
    if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') return codePageFor(destination);
  } catch {
    // fall through
  }
  return destination;
}

/** True when this session can go up to aal2 but hasn't yet: two-factor is on and no code was entered. */
export async function needsCode(auth: LevelReader | null | undefined): Promise<boolean> {
  try {
    const read = auth?.mfa?.getAuthenticatorAssuranceLevel;
    if (!auth?.mfa || typeof read !== 'function') return false;
    const { data, error } = await read.call(auth.mfa);
    return !error && !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  } catch {
    return false;
  }
}

/** The code page, coming back to `next` afterwards. */
export function codePageFor(next: string): string {
  return `${TWO_FACTOR_PATH}?next=${encodeURIComponent(next)}`;
}

/** The page to return to after entering a code, if the address names one; only paths on this site. */
export function returnPath(search: string, origin: string): string | null {
  const raw = new URLSearchParams(search).get('next');
  if (raw === null) return null;
  const path = safeNext(raw, origin);
  return path.startsWith(TWO_FACTOR_PATH) ? null : path;
}

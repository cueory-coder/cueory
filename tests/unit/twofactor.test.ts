import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  CODE_MESSAGES, afterSignIn, cancelEnroll, codePageFor, confirmCode, groupSecret, needsCode, normalizeCode, qrSource,
  readStatus, removeFactor, returnPath, startEnroll, type FactorInfo, type LevelReader, type TwoFactorAuth,
} from '../../src/islands/twofactor';
import type { SignInAuth } from '../../src/islands/signin';

// Compile-time only: the real supabase-js auth client fits the shapes these helpers take (checked by astro check).
export const realClientFits = (client: SupabaseClient): [TwoFactorAuth, LevelReader, Pick<SignInAuth, 'mfa'>] =>
  [client.auth, client.auth, client.auth];

const ORIGIN = 'https://cueory.app';
const factorId = '00000000-0000-4000-8000-0000000000f1';
const challengeId = '00000000-0000-4000-8000-0000000000c1';
const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="#000" width="1" height="1"/></svg>';
const verified: FactorInfo = { id: factorId, factor_type: 'totp', status: 'verified', friendly_name: 'authenticator app' };
const unverified: FactorInfo = { id: '00000000-0000-4000-8000-0000000000f0', factor_type: 'totp', status: 'unverified' };
const ok = <T>(data: T) => Promise.resolve({ data, error: null });
const err = (code: string, status = 400) => Promise.resolve({ data: null, error: { code, status } });

/** A fake supabase.auth: each method answers from the options, and every call is recorded. */
function fake(options: {
  session?: boolean; current?: string | null; next?: string | null; factors?: FactorInfo[];
  verifyError?: string; challengeError?: string; unenrollError?: string; enrollError?: string; listError?: boolean;
  qr?: string; enrollSecret?: string;
} = {}) {
  const calls: string[] = [];
  const factors = options.factors ?? [];
  const auth: TwoFactorAuth = {
    getSession: vi.fn(() => { calls.push('getSession'); return ok({ session: options.session === false ? null : { access_token: 'x' } }); }),
    refreshSession: vi.fn(() => { calls.push('refreshSession'); return Promise.resolve({ error: null }); }),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(() => {
        calls.push('aal');
        return ok({ currentLevel: options.current ?? 'aal1', nextLevel: options.next ?? (factors.some(f => f.status === 'verified') ? 'aal2' : 'aal1') });
      }),
      listFactors: vi.fn(() => {
        calls.push('listFactors');
        if (options.listError) return err('unexpected_failure', 500);
        return ok({ all: factors, totp: factors.filter(f => f.status === 'verified') });
      }),
      enroll: vi.fn((params) => {
        calls.push(`enroll:${params.factorType}:${params.friendlyName}:${params.issuer}`);
        if (options.enrollError) return err(options.enrollError);
        return ok({ id: factorId, type: 'totp', totp: {
          qr_code: options.qr ?? `data:image/svg+xml;utf-8,${svg}`, secret: options.enrollSecret ?? secret, uri: 'otpauth://totp/x',
        } });
      }),
      challenge: vi.fn((params) => {
        calls.push(`challenge:${params.factorId}`);
        return options.challengeError ? err(options.challengeError) : ok({ id: challengeId });
      }),
      verify: vi.fn((params) => {
        calls.push(`verify:${params.factorId}:${params.challengeId}:${params.code}`);
        return options.verifyError ? err(options.verifyError, options.verifyError === 'over_request_rate_limit' ? 429 : 422) : ok({});
      }),
      unenroll: vi.fn((params) => {
        calls.push(`unenroll:${params.factorId}`);
        return options.unenrollError ? err(options.unenrollError) : ok({ id: params.factorId });
      }),
    },
  };
  return { auth, calls };
}

describe('codes and the QR image', () => {
  it.each([
    ['123456', '123456'], [' 123 456 ', '123456'], ['123-456', '123456'],
    ['12345', null], ['1234567', null], ['12a456', null], ['', null], [123456, null],
  ])('normalizeCode(%j) is %j', (input, expected) => {
    expect(normalizeCode(input)).toBe(expected);
  });

  it('re-encodes the SVG data URL supabase-js sends, so a # in the markup cannot cut it short', () => {
    const src = qrSource(`data:image/svg+xml;utf-8,${svg}`)!;
    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(src).not.toContain('#');
    expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe(svg);
    expect(qrSource(svg)).toBe(src);
  });

  it.each([
    ['not a picture', 'data:text/html,<script>alert(1)</script>'],
    ['an outside address', 'https://evil.example/qr.svg'],
    ['already encoded', `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`],
    ['missing', undefined],
  ])('gives no image for %s (the secret is still shown)', (_label, raw) => {
    expect(qrSource(raw)).toBeNull();
  });

  it('groups the secret in fours', () => {
    expect(groupSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});

describe('readStatus', () => {
  it('signed out', async () => {
    expect(await readStatus(fake({ session: false }).auth)).toEqual({ kind: 'signed-out' });
  });
  it('off when there is no verified app (a half-finished one does not count)', async () => {
    expect(await readStatus(fake({ factors: [unverified] }).auth)).toEqual({ kind: 'off' });
  });
  it('needs a code when the app is on but this sign-in has not used it (aal1)', async () => {
    expect(await readStatus(fake({ factors: [verified], current: 'aal1' }).auth)).toEqual({ kind: 'needs-code', factorId });
  });
  it('on at aal2', async () => {
    expect(await readStatus(fake({ factors: [verified], current: 'aal2' }).auth)).toEqual({ kind: 'on', factorId });
  });
  it('an error is failed, never off', async () => {
    expect(await readStatus(fake({ listError: true }).auth)).toEqual({ kind: 'failed' });
    const { auth } = fake();
    auth.getSession = () => Promise.reject(new Error('network'));
    expect(await readStatus(auth)).toEqual({ kind: 'failed' });
  });
});

describe('enroll', () => {
  it('starts with the QR code and the secret', async () => {
    const { auth, calls } = fake();
    const enrollment = await startEnroll(auth);
    expect(enrollment).toEqual({ factorId, qr: qrSource(svg), secret });
    expect(calls).toEqual(['listFactors', 'enroll:totp:authenticator app:cueory']);
  });

  it('first removes a half-finished app from an earlier visit', async () => {
    const { auth, calls } = fake({ factors: [unverified] });
    expect(await startEnroll(auth)).not.toBeNull();
    expect(calls).toEqual(['listFactors', `unenroll:${unverified.id}`, 'enroll:totp:authenticator app:cueory']);
  });

  it('refuses when an app is already on, or the server refuses', async () => {
    expect(await startEnroll(fake({ factors: [verified] }).auth)).toBeNull();
    expect(await startEnroll(fake({ enrollError: 'mfa_totp_enroll_not_enabled' }).auth)).toBeNull();
    expect(await startEnroll(fake({ enrollSecret: 'not a secret' }).auth)).toBeNull();
  });

  it('still works with no QR image, showing the secret only', async () => {
    expect(await startEnroll(fake({ qr: 'https://evil.example/qr' }).auth)).toEqual({ factorId, qr: null, secret });
  });

  it('cancel removes the unverified app', async () => {
    const { auth, calls } = fake();
    await cancelEnroll(auth, factorId);
    expect(calls).toEqual([`unenroll:${factorId}`]);
  });
});

describe('confirmCode (finishing enrollment, or the code at sign-in)', () => {
  it('a right code: challenge, then verify with that challenge', async () => {
    const { auth, calls } = fake();
    expect(await confirmCode(auth, factorId, '123 456')).toEqual({ ok: true });
    expect(calls).toEqual([`challenge:${factorId}`, `verify:${factorId}:${challengeId}:123456`]);
  });

  it('fails closed on a successful-looking MFA response with no verification data', async () => {
    const { auth } = fake();
    auth.mfa.verify = vi.fn(async () => ({ data: null, error: null }));
    expect(await confirmCode(auth, factorId, '123456')).toEqual({
      ok: false, problem: 'failed', message: CODE_MESSAGES.failed,
    });
    // A missing verified session must never allow removal of the existing factor.
    expect(await removeFactor(auth, factorId, '123456')).toMatchObject({ ok: false, problem: 'failed' });
    expect(auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it('a wrong code says so plainly', async () => {
    expect(await confirmCode(fake({ verifyError: 'mfa_verification_failed' }).auth, factorId, '000000')).toEqual({
      ok: false, problem: 'wrong', message: CODE_MESSAGES.wrong,
    });
  });

  it.each([
    ['mfa_challenge_expired', 'expired'],
    ['over_request_rate_limit', 'too-many'],
    ['mfa_verification_rejected', 'failed'],
  ] as const)('%s is %s', async (code, problem) => {
    expect(await confirmCode(fake({ verifyError: code }).auth, factorId, '123456')).toMatchObject({ ok: false, problem });
  });

  it('a code that is not 6 digits never reaches the server', async () => {
    const { auth, calls } = fake();
    expect(await confirmCode(auth, factorId, '12345')).toMatchObject({ ok: false, problem: 'format' });
    expect(calls).toEqual([]);
  });

  it('a failed challenge does not verify', async () => {
    const { auth, calls } = fake({ challengeError: 'mfa_factor_not_found' });
    expect(await confirmCode(auth, factorId, '123456')).toMatchObject({ ok: false, problem: 'failed' });
    expect(calls).toEqual([`challenge:${factorId}`]);
  });

  it('never shows the server text', () => {
    for (const message of Object.values(CODE_MESSAGES)) expect(message).not.toMatch(/mfa_|aal|factor/);
  });
});

describe('removeFactor', () => {
  it('asks for a current code, removes the app, then refreshes the session to aal1', async () => {
    const { auth, calls } = fake({ factors: [verified], current: 'aal2' });
    expect(await removeFactor(auth, factorId, '123456')).toEqual({ ok: true });
    expect(calls).toEqual([`challenge:${factorId}`, `verify:${factorId}:${challengeId}:123456`, `unenroll:${factorId}`, 'refreshSession']);
  });

  it('a wrong code removes nothing', async () => {
    const { auth, calls } = fake({ verifyError: 'mfa_verification_failed' });
    expect(await removeFactor(auth, factorId, '000000')).toMatchObject({ ok: false, problem: 'wrong' });
    expect(calls.some(c => c.startsWith('unenroll'))).toBe(false);
  });

  it('a refused removal is reported and the session is not refreshed', async () => {
    const { auth, calls } = fake({ unenrollError: 'insufficient_aal' });
    expect(await removeFactor(auth, factorId, '123456')).toMatchObject({ ok: false, problem: 'failed' });
    expect(calls).not.toContain('refreshSession');
  });
});

describe('after signing in', () => {
  it('sends an account with two-factor on to its code page, then back to where it was going', async () => {
    const { auth } = fake({ factors: [verified], current: 'aal1' });
    expect(await afterSignIn(auth, '/admin/flags', ORIGIN)).toBe('/account/two-factor?next=%2Fadmin%2Fflags');
    expect(await needsCode(auth)).toBe(true);
  });

  it('goes straight on without two-factor, already at aal2, or with no mfa on the client', async () => {
    expect(await afterSignIn(fake().auth, '/progress', ORIGIN)).toBe('/progress');
    expect(await afterSignIn(fake({ factors: [verified], current: 'aal2' }).auth, '/progress', ORIGIN)).toBe('/progress');
    expect(await afterSignIn({}, '/learn', ORIGIN)).toBe('/learn');
    expect(await afterSignIn(null, '//evil.example', ORIGIN)).toBe('/progress');
    expect(await needsCode(null)).toBe(false);
  });

  it('an error goes straight on (the database still checks aal2)', async () => {
    const reader: LevelReader = { mfa: { getAuthenticatorAssuranceLevel: () => Promise.reject(new Error('x')) } };
    expect(await afterSignIn(reader, '/learn', ORIGIN)).toBe('/learn');
    expect(await needsCode(reader)).toBe(false);
  });

  it('keeps the method on its object', async () => {
    const mfa = { getAuthenticatorAssuranceLevel(this: unknown) {
      if (this !== mfa) throw new Error('receiver lost');
      return ok({ currentLevel: 'aal1', nextLevel: 'aal2' });
    } };
    expect(await afterSignIn({ mfa }, '/learn', ORIGIN)).toBe(codePageFor('/learn'));
  });
});

describe('returnPath', () => {
  it.each([
    ['?next=%2Fadmin%2Fflags', '/admin/flags'],
    ['', null],
    ['?next=%2F%2Fevil.example', '/progress'],
    ['?next=https%3A%2F%2Fevil.example', '/progress'],
    ['?next=%2Faccount%2Ftwo-factor', null],
  ])('%s gives %j', (search, expected) => {
    expect(returnPath(search, ORIGIN)).toBe(expected);
  });
});

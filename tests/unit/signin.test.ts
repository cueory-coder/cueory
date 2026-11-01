import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SignIn, { type SignInAuth } from '../../src/islands/SignIn';
import ResetPassword from '../../src/islands/ResetPassword';
import { callbackUrl, changePassword, checkEmail, checkPassword, performAuthAction, resendSeconds, safeNext, signInMessage } from '../../src/islands/signin';

describe('checkEmail', () => {
  it.each(['student@example.test', '  student@example.test  ', 'student+notes@school.example.test'])('accepts %j', value => {
    expect(checkEmail(value)).toBeNull();
  });
  it.each([undefined, null, 1, {}, '', '   ', 'student', '@example.test', 'student@',
    'student@@example.test', 'student@school', 'stu dent@example.test', 'student@exam ple.test',
    'student@.test', 'student@example.', 'student@example..test', 'student\u0000@example.test',
    'student\u007f@example.test', 'student\n@example.test', 'a'.repeat(2000)])('rejects %j with a sentence', value => {
    expect(checkEmail(value)).toEqual(expect.stringMatching(/\.$/));
  });
  it('counts the trimmed address, accepting 254 characters and refusing 255', () => {
    const suffix = '@example.test';
    const atLimit = 'a'.repeat(254 - suffix.length) + suffix;
    expect(checkEmail(` ${atLimit} `)).toBeNull();
    expect(checkEmail(`a${atLimit}`)).toContain('254');
  });
});

describe('safeNext', () => {
  const origin = 'https://cueory.example';
  it.each([
    ['/', '/'], ['/progress', '/progress'], ['/learn/study-skills?mode=cards#start', '/learn/study-skills?mode=cards#start'],
    ['/learn/../progress', '/progress'], ['/notes/a%20b', '/notes/a%20b'],
    ['/progress?next=https%3A%2F%2Felsewhere.test', '/progress?next=https%3A%2F%2Felsewhere.test'],
  ])('keeps %j on the same origin', (input, expected) => {
    const result = safeNext(input, origin);
    expect(result).toBe(expected);
    expect(new URL(result, origin).origin).toBe(origin);
  });
  it.each([undefined, null, 42, {}, '', ' ', 'progress', '//evil.com', '///evil.com', 'https://evil.com',
    'https://cueory.example/progress', 'javascript:alert(1)', '/\\evil', '\\evil.com', '/\tevil', '/\nevil',
    '/\u0000evil', '/\u007fevil', ' /progress', '/progress ', '/a/..//evil.com', '/%2f%2fevil.com',
    '/%5cevil.com', '/%00evil', '/%0aevil', '/%7fevil', '/%zz', '/' + 'a'.repeat(1999), 'a'.repeat(2000)])(
    'falls back for %j', input => { expect(safeNext(input, origin)).toBe('/progress'); },
  );
  it('bounds destinations at 1024 characters', () => {
    const longest = '/' + 'a'.repeat(1023);
    expect(safeNext(longest, origin)).toBe(longest);
    expect(safeNext(longest + 'a', origin)).toBe('/progress');
  });
  it.each(['', 'not a URL', 'javascript:alert(1)', 'data:text/plain,hello'])('refuses invalid origin %j', origin => {
    expect(safeNext('/learn', origin)).toBe('/progress');
  });
  it('supports a local preview origin including its port', () => {
    expect(safeNext('/learn', 'http://localhost:4322')).toBe('/learn');
  });
});

const origin = 'https://cueory.example';
const valid = { email: '  student@example.test  ', password: 'x'.repeat(10), name: '  Student Example  ' };
const makeAuth = (): SignInAuth => ({
  signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
});

describe('password validation', () => {
  it.each([null, undefined, 1, {}, '', 'x'.repeat(9), 'x'.repeat(73), 'é'.repeat(37), '🙂'.repeat(19)])(
    'rejects invalid type, short input or excess UTF-8 bytes %#', value => expect(checkPassword(value)).not.toBeNull(),
  );
  it.each(['x'.repeat(10), 'x'.repeat(72), 'é'.repeat(36), '🙂'.repeat(18), ' '.repeat(10)])(
    'accepts the boundaries without trimming %#', value => expect(checkPassword(value)).toBeNull(),
  );
});

describe('auth request contracts', () => {
  it('sends only validated signup fields, preserving the exact password and safe callback', async () => {
    const auth = makeAuth();
    const password = ' ' + 'x'.repeat(10) + ' ';
    const result = await performAuthAction(auth, 'signup', { ...valid, password }, origin, '//outside.test');
    expect(auth.signUp).toHaveBeenCalledExactlyOnceWith({ email: valid.email.trim(), password,
      options: { emailRedirectTo: callbackUrl(origin, '/progress'), data: { display_name: 'Student Example' } } });
    expect(result).toEqual({ kind: 'feedback', message: signInMessage('signup-sent'), cooldown: true });
    expect(JSON.stringify(result)).not.toContain(password);
  });
  it.each([
    [{ ...valid, name: '' }, 'name'], [{ ...valid, name: 'a'.repeat(51) }, 'name'],
    [{ ...valid, name: 'a\n' }, 'name'], [{ ...valid, email: 'bad' }, 'email'],
    [{ ...valid, password: 'x'.repeat(9) }, 'password'], [{ ...valid, password: '🙂'.repeat(19) }, 'password'],
  ] as const)('does not send invalid signup data %#', async (input, field) => {
    const auth = makeAuth();
    expect(await performAuthAction(auth, 'signup', input, origin, '/progress')).toMatchObject({ kind: 'invalid', field });
    expect(auth.signUp).not.toHaveBeenCalled();
  });
  it('uses email/password sign-in and returns a bounded local destination', async () => {
    const auth = makeAuth();
    const result = await performAuthAction(auth, 'signin', valid, origin, '/learn?mode=cards');
    expect(auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email: valid.email.trim(), password: valid.password });
    expect(result).toEqual({ kind: 'redirect', next: '/learn?mode=cards' });
  });
  it.each([400, 401, 403, 422, 429, 500])('does not expose provider detail at sign-in (%i)', async status => {
    const auth = makeAuth();
    vi.mocked(auth.signInWithPassword).mockResolvedValue({ error: { status, message: 'private provider detail' } } as never);
    expect(await performAuthAction(auth, 'signin', valid, origin, '/')).toEqual({
      kind: 'feedback', message: "that email and password don't match.", cooldown: status === 429,
    });
  });
  it('also scrubs rejected sign-in requests', async () => {
    const auth = makeAuth();
    vi.mocked(auth.signInWithPassword).mockRejectedValue(new Error('private provider detail'));
    expect(await performAuthAction(auth, 'signin', valid, origin, '/')).toMatchObject({ message: signInMessage('signin-failed') });
  });
  it.each(['success', 'missing-account', 'rate-limited', 'network'] as const)(
    'uses identical password-reset feedback and cooldown for %s', async kind => {
      const auth = makeAuth();
      if (kind === 'network') vi.mocked(auth.resetPasswordForEmail).mockRejectedValue(new Error('provider detail'));
      else vi.mocked(auth.resetPasswordForEmail).mockResolvedValue({ error: kind === 'success' ? null : { status: kind === 'rate-limited' ? 429 : 400 } });
      const result = await performAuthAction(auth, 'forgot', { ...valid, password: '', name: '' }, origin, '//outside.test');
      expect(auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith(valid.email.trim(), {
        redirectTo: `${origin}/auth/callback?next=%2Freset-password`,
      });
      expect(result).toEqual({ kind: 'feedback', message: signInMessage('reset-sent'), cooldown: true });
    },
  );
  it('rejects an invalid reset email without sending anything', async () => {
    const auth = makeAuth();
    expect(await performAuthAction(auth, 'forgot', { ...valid, email: '' }, origin, '/')).toMatchObject({ field: 'email' });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it('uses only Google and never sends typed name or credentials to OAuth', async () => {
    const auth = makeAuth();
    expect(await performAuthAction(auth, 'google', { email: '', password: '', name: '' }, origin, '/learn')).toEqual({ kind: 'oauth' });
    expect(auth.signInWithOAuth).toHaveBeenCalledExactlyOnceWith({ provider: 'google', options: { redirectTo: callbackUrl(origin, '/learn') } });
    expect(auth.signUp).not.toHaveBeenCalled();
  });
  it('scrubs OAuth and signup errors, including thrown errors', async () => {
    const auth = makeAuth();
    vi.mocked(auth.signInWithOAuth).mockResolvedValue({ error: { status: 400 } });
    expect(await performAuthAction(auth, 'google', valid, origin, '/')).toMatchObject({ message: signInMessage('google-failed') });
    vi.mocked(auth.signUp).mockRejectedValue(new Error('private provider detail'));
    expect(await performAuthAction(auth, 'signup', valid, origin, '/')).toMatchObject({ message: signInMessage('signup-failed') });
  });
  it('keeps all actions closed without the injected client', async () => {
    for (const action of ['signin', 'signup', 'google', 'forgot'] as const) {
      expect(await performAuthAction(null, action, valid, origin, '/')).toMatchObject({ message: signInMessage('unavailable') });
    }
  });
});

describe('password recovery', () => {
  it('never calls updateUser without the authenticated handoff', async () => {
    const auth = { updateUser: vi.fn() };
    expect(await changePassword(auth, false, valid.password)).toEqual({ ok: false, message: signInMessage('recovery-required') });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect((await changePassword(null, true, valid.password)).ok).toBe(false);
  });
  it('rejects invalid passwords before calling the service', async () => {
    const auth = { updateUser: vi.fn() };
    expect((await changePassword(auth, true, 'x')).ok).toBe(false);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('updates the authenticated user without changing or retaining the password', async () => {
    const auth = { updateUser: vi.fn().mockResolvedValue({ error: null }) };
    const password = ' ' + valid.password + ' ';
    const result = await changePassword(auth, true, password);
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password });
    expect(result).toEqual({ ok: true, message: signInMessage('reset-done') });
    expect(JSON.stringify(result)).not.toContain(password);
  });
  it.each(['returned', 'thrown'])('handles %s failures without exposing service details', async kind => {
    const auth = { updateUser: vi.fn() };
    if (kind === 'thrown') auth.updateUser.mockRejectedValue(new Error('provider detail'));
    else auth.updateUser.mockResolvedValue({ error: { message: 'provider detail' } });
    expect(await changePassword(auth, true, valid.password)).toEqual({ ok: false, message: signInMessage('reset-failed') });
  });
});

describe('feedback countdown', () => {
  it('rounds partial seconds up and unlocks at the deadline', () => {
    expect(resendSeconds(61_000, 1_000)).toBe(60);
    expect(resendSeconds(61_000, 1_001)).toBe(60);
    expect(resendSeconds(61_000, 2_000)).toBe(59);
    expect(resendSeconds(61_000, 60_999)).toBe(1);
    expect(resendSeconds(61_000, 61_000)).toBe(0);
    expect(resendSeconds(61_000, 90_000)).toBe(0);
  });
});

describe('account screen rendering', () => {
  it.each(['signin', 'signup'] as const)('keeps %s controls closed with accounts off', mode => {
    const html = renderToStaticMarkup(createElement(SignIn, { auth: null, mode }));
    expect(html).toContain(signInMessage('unavailable'));
    expect(html).toContain('href="/#signup"');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('data:image');
  });
  it.each(['signin', 'signup'] as const)('labels every %s credential field without calling auth on render', mode => {
    const auth = makeAuth();
    const html = renderToStaticMarkup(createElement(SignIn, { auth, mode }));
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain(`autoComplete="${mode === 'signup' ? 'new-password' : 'current-password'}"`);
    expect(html).toContain('aria-label="show password"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="sign in with google"');
    expect(html).not.toContain('email me a sign-in link');
    if (mode === 'signup') expect(html).toContain('name="display_name"');
    else expect(html).toContain('forgot password?');
    for (const method of Object.values(auth)) expect(method).not.toHaveBeenCalled();
  });
  it('renders no password field on recovery without a verified session', () => {
    const auth = { updateUser: vi.fn() };
    const html = renderToStaticMarkup(createElement(ResetPassword, { auth }));
    expect(html).toContain('request a reset link');
    expect(html).not.toContain('<input');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('renders accounts-off on the reset page too', () => {
    const html = renderToStaticMarkup(createElement(ResetPassword));
    expect(html).toContain(signInMessage('unavailable'));
    expect(html).not.toContain('<input');
  });
});

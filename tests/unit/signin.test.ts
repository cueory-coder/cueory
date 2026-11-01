import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SignIn, { type SignInAuth } from '../../src/islands/SignIn';
import { checkEmail, resendSeconds, safeNext, signInMessage } from '../../src/islands/signin';

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

describe('sign-in feedback and cooldown', () => {
  it.each(['sent', 'too-many', 'google-failed', 'email-failed', 'unavailable'] as const)('has calm copy for %s', kind => {
    expect(signInMessage(kind)).toMatch(/\.$/);
    expect(signInMessage(kind)).not.toMatch(/[<>]/);
  });
  it('shows a full minute, rounds up partial seconds, and unlocks at the deadline', () => {
    expect(resendSeconds(61_000, 1_000)).toBe(60);
    expect(resendSeconds(61_000, 1_001)).toBe(60);
    expect(resendSeconds(61_000, 2_000)).toBe(59);
    expect(resendSeconds(61_000, 60_999)).toBe(1);
    expect(resendSeconds(61_000, 61_000)).toBe(0);
    expect(resendSeconds(61_000, 90_000)).toBe(0);
  });
});

describe('SignIn rendering', () => {
  it('renders the accounts-off message and launch link without calling auth', () => {
    const html = renderToStaticMarkup(createElement(SignIn, { auth: null }));
    expect(html).toContain(signInMessage('unavailable'));
    expect(html).toContain('href="/#signup"');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
  });
  it('puts Google first, provides a labelled email field, and does not sign in during render', () => {
    const auth: SignInAuth = { signInWithOAuth: vi.fn(), signInWithOtp: vi.fn() };
    const html = renderToStaticMarkup(createElement(SignIn, { auth }));
    expect(html.indexOf('continue with google')).toBeLessThan(html.indexOf('email me a sign-in link'));
    const labelledId = html.match(/<label for="([^"]+)"[^>]*>email address<\/label>/)?.[1];
    expect(labelledId).toBeTruthy();
    expect(html).toContain(`<input id="${labelledId}"`);
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('maxLength="254"');
    expect(html).toContain('role="status"');
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
});

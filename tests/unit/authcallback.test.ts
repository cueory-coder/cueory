import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CallbackFeedback } from '../../src/islands/AuthCallback';
import { cleanCallbackUrl, readCallback, safeNext } from '../../src/islands/authcallback';

const ORIGIN = 'https://cueory.app';

describe('safeNext (same-origin callback destination)', () => {
  it.each([
    ['/progress', '/progress'],
    ['/learn/study-skills', '/learn/study-skills'],
    ['/progress?tab=cards#today', '/progress?tab=cards#today'],
    ['/a/../progress', '/progress'],
    [null, '/progress'],
    ['', '/progress'],
    ['//evil.com', '/progress'],
    ['///evil.com', '/progress'],
    ['https://evil.com', '/progress'],
    ['https://cueory.app/progress', '/progress'],
    ['/\\evil.com', '/progress'],
    ['/path\\evil.com', '/progress'],
    [' /progress', '/progress'],
    ['javascript:alert(1)', '/progress'],
    ['/x'.repeat(1200), '/progress'],
    ['/progress\nLocation: https://evil.com', '/progress'],
  ])('maps %j to %s', (input, expected) => {
    expect(safeNext(input, ORIGIN)).toBe(expected);
  });

  it('returns the fallback on a malformed site origin', () => {
    expect(safeNext('/progress', 'not-an-origin')).toBe('/progress');
  });
});

describe('readCallback (PKCE code or auth error)', () => {
  it('reads a code and a same-origin next path', () => {
    expect(readCallback(`${ORIGIN}/auth/callback?code=one-time-123&next=%2Flearn%2Fstudy-skills`)).toEqual({
      kind: 'code', code: 'one-time-123', next: '/learn/study-skills',
    });
  });

  it('uses /progress when no next is supplied', () => {
    expect(readCallback(new URL(`${ORIGIN}/auth/callback?code=123`))).toEqual({ kind: 'code', code: '123', next: '/progress' });
  });

  it('refuses an off-origin next even when it is URL-encoded', () => {
    expect(readCallback(`${ORIGIN}/auth/callback?code=123&next=${encodeURIComponent('//evil.com')}`)).toEqual({
      kind: 'code', code: '123', next: '/progress',
    });
  });

  it('prefers a provider error over a code, and caps untrusted details at 200 code points', () => {
    const dangerous = '<img src=x onerror=alert(1)>';
    const result = readCallback(`${ORIGIN}/auth/callback?code=secret&error=access_denied&error_description=${encodeURIComponent(dangerous)}`);
    expect(result).toEqual({ kind: 'error', message: dangerous });
    const long = readCallback(`${ORIGIN}/auth/callback?error=oops&error_description=${encodeURIComponent('🙂'.repeat(201))}`);
    expect(long.kind).toBe('error');
    if (long.kind === 'error') expect([...long.message]).toHaveLength(200);
  });

  it('handles missing, empty, malformed and oversized codes without leaking them', () => {
    expect(readCallback(`${ORIGIN}/auth/callback`)).toEqual({ kind: 'nothing' });
    expect(readCallback(`${ORIGIN}/auth/callback?code=`)).toEqual({ kind: 'nothing' });
    expect(readCallback('https://%')).toEqual({ kind: 'nothing' });
    const tooLong = readCallback(`${ORIGIN}/auth/callback?code=${'x'.repeat(2049)}`);
    expect(tooLong.kind).toBe('error');
    if (tooLong.kind === 'error') expect(tooLong.message).not.toContain('x'.repeat(40));
  });

  it('uses a safe generic message for provider errors without a description', () => {
    const result = readCallback(`${ORIGIN}/auth/callback?error=access_denied`);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.message).toContain('try again');
  });
});

describe('callback privacy and feedback', () => {
  it('removes the entire query and fragment before redirecting after exchange', () => {
    const url = `${ORIGIN}/auth/callback?code=sensitive&next=%2Fprogress&sb_flow_id=private#frag`;
    const cleaned = cleanCallbackUrl(url);
    expect(cleaned).toBe(`${ORIGIN}/auth/callback`);
    expect(cleaned).not.toContain('sensitive');
    expect(cleaned).not.toContain('sb_flow_id');
  });

  it('renders provider HTML as escaped text, not as an element or handler', () => {
    const message = '<img src=x onerror=alert(1)>';
    const html = renderToStaticMarkup(createElement(CallbackFeedback, { state: { kind: 'error', message } }));
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).toContain('back to sign in');
  });

  it('shows an accounts-off result and a usable sign-in link', () => {
    const html = renderToStaticMarkup(createElement(CallbackFeedback, { state: { kind: 'unavailable' } }));
    expect(html).toContain('accounts open soon');
    expect(html).toContain('href="/signin"');
  });
});

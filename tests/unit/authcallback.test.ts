import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AuthCallback, { CallbackFeedback } from '../../src/islands/AuthCallback.tsx';
import {
  CALLBACK_ERROR, cleanCallbackUrl, exchangedUserId, finishCallback, readCallback, safeNext, type CodeExchangeAuth,
} from '../../src/islands/authcallback';
import { getSupabase } from '../../src/islands/supabaseclient';

vi.mock('../../src/islands/supabaseclient', () => ({ getSupabase: vi.fn() }));

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

  it('prefers a provider error over a code and never carries its text', () => {
    const dangerous = '<img src=x onerror=alert(1)>';
    const result = readCallback(`${ORIGIN}/auth/callback?code=secret&error=access_denied&error_description=${encodeURIComponent(dangerous)}`);
    expect(result).toEqual({ kind: 'error' });
    expect(readCallback(`${ORIGIN}/auth/callback?error_description=provider-private-detail`)).toEqual({ kind: 'error' });
  });

  it('handles missing, empty, malformed and oversized codes without leaking them', () => {
    expect(readCallback(`${ORIGIN}/auth/callback`)).toEqual({ kind: 'nothing' });
    expect(readCallback(`${ORIGIN}/auth/callback?code=`)).toEqual({ kind: 'nothing' });
    expect(readCallback('https://%')).toEqual({ kind: 'nothing' });
    expect(readCallback(`${ORIGIN}/auth/callback?code=${'x'.repeat(2049)}`)).toEqual({ kind: 'error' });
  });
});

// Fake, clearly non-secret values only.
const session = { access_token: 'fake-access-token', user: { id: 'fake-user-1' } };
const ok = { data: { session, user: session.user }, error: null };
const fakeAuth = (result: unknown = ok): CodeExchangeAuth & { exchangeCodeForSession: ReturnType<typeof vi.fn> } =>
  ({ exchangeCodeForSession: vi.fn().mockResolvedValue(result) });
const at = (query: string) => `${ORIGIN}/auth/callback${query}`;

describe('finishCallback (shared-client adapter)', () => {
  it('exchanges the code once and sends the student to the checked next path', async () => {
    const auth = fakeAuth();
    const load = vi.fn().mockResolvedValue(auth);
    expect(await finishCallback(load, at('?code=fake-code-1&next=%2Flearn%2Fstudy-skills'))).toEqual({
      kind: 'redirect', next: '/learn/study-skills',
    });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('fake-code-1');
  });

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)'])('replaces unsafe next %j with /progress', async next => {
    expect(await finishCallback(async () => fakeAuth(), at(`?code=fake-code-1&next=${encodeURIComponent(next)}`))).toEqual({
      kind: 'redirect', next: '/progress',
    });
  });

  it.each([
    ['a missing code', ''],
    ['an empty code', '?code='],
    ['a provider error', '?error=access_denied&error_description=provider-private-detail'],
    ['a provider error beside a code', '?code=fake-code-1&error=server_error'],
  ])('fails with %s and never loads the client', async (_label, query) => {
    const load = vi.fn();
    const outcome = await finishCallback(load, at(query));
    expect(outcome).toEqual({ kind: 'error' });
    expect(JSON.stringify(outcome)).not.toContain('provider-private-detail');
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ['a returned error', { data: { session: null, user: null }, error: { message: 'provider-private-detail' } }],
    ['no session', { data: { session: null, user: null }, error: null }],
    ['no user id', { data: { session, user: {} }, error: null }],
    ['an empty result', { data: null, error: null }],
  ])('fails generically on %s', async (_label, result) => {
    const outcome = await finishCallback(async () => fakeAuth(result), at('?code=fake-code-1'));
    expect(outcome).toEqual({ kind: 'error' });
    expect(JSON.stringify(outcome)).not.toContain('provider-private-detail');
  });

  it('fails generically when the exchange or the client download throws', async () => {
    const auth = { exchangeCodeForSession: vi.fn().mockRejectedValue(new Error('provider-private-detail')) };
    expect(await finishCallback(async () => auth, at('?code=fake-code-1'))).toEqual({ kind: 'error' });
    expect(await finishCallback(() => Promise.reject(new Error('download failed')), at('?code=fake-code-1'))).toEqual({ kind: 'error' });
  });

  it('reports accounts off when the build has no client, without exchanging', async () => {
    expect(await finishCallback(async () => null, at('?code=fake-code-1'))).toEqual({ kind: 'unavailable' });
  });

  it('reads a user id only from a result with a session', () => {
    expect(exchangedUserId(ok.data)).toBe('fake-user-1');
    for (const data of [undefined, null, 'x', {}, { user: session.user }, { session, user: { id: 1 } }, { session, user: { id: '' } }]) {
      expect(exchangedUserId(data)).toBeNull();
    }
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

  it('shows one fixed sentence and a link to /signin on failure', () => {
    const html = renderToStaticMarkup(createElement(CallbackFeedback, { state: { kind: 'error' } }));
    expect(CALLBACK_ERROR).toBe("sign-in didn't finish. please try again.");
    expect(html).toContain('sign-in didn&#x27;t finish. please try again.');
    expect(html).toContain('href="/signin"');
    expect(html).toContain('back to sign in');
  });

  it('shows an accounts-off result and an existing home link', () => {
    const html = renderToStaticMarkup(createElement(CallbackFeedback, { state: { kind: 'unavailable' } }));
    expect(html).toContain('accounts open soon');
    expect(html).toContain('href="/#signup"');
    expect(html).not.toContain('href="/signin"');
  });

  it('renders a working line without loading the client during server rendering', () => {
    const html = renderToStaticMarkup(createElement(AuthCallback));
    expect(html).toContain('checking your sign-in');
    expect(getSupabase).not.toHaveBeenCalled();
  });
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// These tests run in each selected Playwright project. CI currently selects phone and desktop.
for (const [path, heading, title] of [
  ['/signin', 'welcome back to cueory', 'sign in'],
  ['/signup', 'welcome to cueory', 'create an account'],
  ['/reset-password', 'choose a new password', 'reset your password'],
] as const) test.describe(`${path} with accounts off`, () => {
  test('renders a plain, unindexed page with a working launch-updates link', async ({ page }) => {
    const errors: string[] = [];
    const remoteRequests: string[] = [];
    // Chromium rejects the cross-page view transition's promise when following the /#signup link mid-transition;
    // the navigation itself succeeds (checked below). Any other page error still fails the test.
    const abortedViewTransition = /^Transition was aborted because of invalid state\. ViewTransition opt-in disabled$/;
    page.on('pageerror', error => { if (!abortedViewTransition.test(error.message)) errors.push(error.message); });
    page.on('request', request => {
      const url = new URL(request.url());
      if (/supabase|accounts\.google/.test(url.hostname)) remoteRequests.push(request.url());
    });
    await page.goto(`${path}?next=%2F%2Fevil.com`);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(`${title} · cueory`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByTestId('signin-unavailable')).toContainText('accounts open soon');
    await expect(page.locator('main form')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/silk/);
    await expect(page.locator('main .veil')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const updates = page.getByRole('link', { name: 'get launch updates', exact: true });
    await expect(updates).toHaveAttribute('href', '/#signup');
    await updates.click();
    await expect(page).toHaveURL(/\/#signup$/);
    await expect(page.locator('#signup')).toBeVisible();
    expect(errors).toEqual([]);
    expect(remoteRequests).toEqual([]);
  });

  test('reaches every visible control with the keyboard and shows focus', async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId('signin-unavailable')).toBeVisible();
    const controls = page.locator('a[href]:visible, button:visible, input:visible, select:visible, textarea:visible');
    const count = await controls.count();
    const reached = new Set<number>();
    const recordFocus = async () => {
      for (let index = 0; index < count; index++) {
        if (await controls.nth(index).evaluate(element => element === document.activeElement)) {
          reached.add(index);
          expect(await controls.nth(index).evaluate(element => {
            const style = getComputedStyle(element);
            return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          })).toBe(true);
        }
      }
    };
    for (let press = 0; press < count + 4; press++) {
      await page.keyboard.press('Tab');
      await recordFocus();
      // Native radio groups use arrows within the group, with a single Tab stop.
      if (await page.locator('input[type="radio"]:focus').count()) {
        for (let radio = 0; radio < 3; radio++) {
          await page.keyboard.press('ArrowRight');
          await recordFocus();
        }
      }
    }
    expect(reached.size).toBe(count);
  });

  test('passes accessibility checks', async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map(result => `${result.id}: ${result.help}`)).toEqual([]);
  });
});

// Browser-only component fixture. It is intercepted by Playwright, never written into dist or shipped.
// Real components + built CSS. Only the shared client module is replaced, with no provider traffic.
let fixtureCode: string;
let fixtureCss: string;
test.beforeAll(async () => {
  const html = readFileSync('dist/signin.html', 'utf8');
  fixtureCss = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  if (!fixtureCss) throw new Error('The production stylesheet was not found. Run npm run build.');
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import SignIn from './src/islands/SignIn.tsx';
      import ResetPassword from './src/islands/ResetPassword.tsx';
      import AuthCallback from './src/islands/AuthCallback.tsx';
      const params = new URLSearchParams(location.search);
      window.authCalls = [];
      // The callback leaves the page on success, so its log survives in this tab's session storage.
      const log = entry => {
        const entries = JSON.parse(sessionStorage.getItem('fixture-log') ?? '[]');
        sessionStorage.setItem('fixture-log', JSON.stringify([...entries, entry]));
      };
      const replaceState = history.replaceState.bind(history);
      history.replaceState = (state, unused, url) => { log('replaced:' + url); replaceState(state, unused, url); };
      const listeners = new Set();
      window.clientLoads = 0;
      window.clientGate = new Promise(resolve => { window.releaseClient = resolve; });
      const call = async name => {
        window.authCalls.push(name);
        await new Promise(resolve => setTimeout(resolve, 150));
        return { error: params.has('fail') ? { status: 400, message: 'provider-private-detail' } : null };
      };
      const auth = {
        signUp: () => call('signup'),
        signInWithOAuth: () => call('google'),
        signInWithPassword() {
          if (this !== auth) throw new Error('auth receiver was lost');
          return call('signin');
        },
        resetPasswordForEmail: () => call('forgot'),
        updateUser: () => call('update'),
        onAuthStateChange(listener) {
          listeners.add(listener);
          return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
        },
        async exchangeCodeForSession(code) {
          if (this !== auth) throw new Error('auth receiver was lost');
          window.authCalls.push('exchange');
          log('exchange:' + code + ' at ' + location.search);
          await new Promise(resolve => setTimeout(resolve, 150));
          if (params.has('exchange-fails')) {
            return { data: { session: null, user: null }, error: { status: 400, message: 'provider-private-detail' } };
          }
          const user = { id: 'fake-user-1' };
          if (params.get('recovery') === 'event') for (const listener of listeners) listener('PASSWORD_RECOVERY', { user });
          return { data: { session: { user }, user, redirectType: params.get('recovery') === 'typed' ? 'recovery' : null }, error: null };
        },
      };
      window.fixtureAuth = auth;
      const supplied = params.get('client') === 'injected' ? auth : params.get('client') === 'null' ? null : undefined;
      const mode = params.get('mode');
      createRoot(document.getElementById('fixture')).render(mode === 'reset' ? <ResetPassword auth={supplied} />
        : mode === 'callback' ? <AuthCallback auth={supplied} />
        : <SignIn auth={supplied} mode={mode === 'signup' ? 'signup' : 'signin'} />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-client', setup(builder) {
      builder.onResolve({ filter: /\/supabaseclient(?:\.ts)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export async function getSupabase() {
          const params = new URLSearchParams(location.search);
          window.clientLoads += 1;
          if (params.has('deferred')) await window.clientGate;
          if (params.has('load-fails') && window.clientLoads === 1) throw new Error('provider-private-detail');
          return params.get('client') === 'off' ? null : { auth: window.fixtureAuth };
        }
      `, loader: 'js' }));
    } }],
  });
  fixtureCode = result.outputFiles[0].text;
});

async function fixture(page: Page, query: string) {
  await page.route('**/__account-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__account-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>account component test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main class="mx-auto max-w-110 p-6 font-body leading-relaxed"><h1>account component test</h1>
    <div id="fixture"></div></main><script src="/__account-fixture.js"></script></body></html>` }));
  await page.goto(`/__account-fixture?${query}`);
}
const fakePassword = 'x'.repeat(12);
const calls = (page: Page) => page.evaluate(() => (window as unknown as { authCalls: string[] }).authCalls);
const clientLoads = (page: Page) => page.evaluate(() => (window as unknown as { clientLoads: number }).clientLoads);
const fixtureLog = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture-log') ?? '[]') as string[]);
const recoveryLink = 'mode=reset&code=fake-code-1&recovery=event';

test.describe('shared client loading', () => {
  test('keeps controls closed until the configured client is ready', async ({ page }) => {
    await fixture(page, 'mode=signin&deferred=1');
    await expect(page.getByRole('status')).toHaveText('opening sign-in…');
    await expect(page.locator('input')).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
    await page.evaluate(() => (window as unknown as { releaseClient: () => void }).releaseClient());
    await expect(page.getByLabel('email', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { clientLoads: number }).clientLoads)).toBe(1);
  });

  test('returns to the accounts-off screen when the shared client is unconfigured', async ({ page }) => {
    await fixture(page, 'mode=signup&client=off');
    await expect(page.getByTestId('signin-unavailable')).toBeVisible();
    await expect(page.locator('input')).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { clientLoads: number }).clientLoads)).toBe(1);
  });

  test('scrubs client-load errors and lets the student retry', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await fixture(page, 'mode=signin&load-fails=1');
    await expect(page.getByRole('alert')).toHaveText('sign-in could not load. please try again.');
    await expect(page.locator('input')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'try again', exact: true }).click();
    await expect(page.getByLabel('email', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { clientLoads: number }).clientLoads)).toBe(2);
    expect(errors).toEqual([]);
  });

  for (const client of ['null', 'injected']) test(`explicit ${client} bypasses the loader`, async ({ page }) => {
    await fixture(page, `mode=signin&client=${client}&load-fails=1`);
    if (client === 'null') await expect(page.getByTestId('signin-unavailable')).toBeVisible();
    else await expect(page.getByLabel('email', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { clientLoads: number }).clientLoads)).toBe(0);
  });
});

test.describe('enabled account components with fake shared auth', () => {
  test('signup initials, validation, show/hide, duplicate guard and cooldown work', async ({ page }) => {
    await fixture(page, 'mode=signup');
    await page.getByRole('button', { name: 'create account', exact: true }).click();
    await expect(page.getByLabel('display name')).toBeFocused();
    expect(await calls(page)).toEqual([]);
    await page.getByLabel('display name').fill('Student Example');
    await expect(page.getByText('SE', { exact: true })).toBeVisible();
    await page.getByLabel('email', { exact: true }).fill('student@example.test');
    const password = page.getByLabel('password', { exact: true });
    await password.fill(fakePassword);
    await page.getByRole('button', { name: 'show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');
    const submit = page.getByRole('button', { name: 'create account', exact: true });
    await submit.dblclick();
    await expect(page.getByRole('status')).toContainText('check your inbox');
    expect(await calls(page)).toEqual(['signup']);
    await expect(password).toHaveValue('');
    await expect(page.getByRole('button', { name: 'create account', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'create account', exact: true }).click({ force: true });
    expect(await calls(page)).toEqual(['signup']);
  });

  test('sign-in failures stay generic and clear the password', async ({ page }) => {
    await fixture(page, 'mode=signin&fail=1');
    await page.getByLabel('email', { exact: true }).fill('student@example.test');
    await page.getByLabel('password', { exact: true }).fill(fakePassword);
    await page.getByRole('button', { name: 'sign in', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText("that email and password don't match.");
    expect(await calls(page)).toEqual(['signin']);
    await expect(page.getByLabel('password', { exact: true })).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
  });

  test('forgot-password panel hides the password and never exposes provider detail', async ({ page }) => {
    await fixture(page, 'mode=signin&fail=1');
    await page.getByRole('button', { name: 'forgot password?' }).click();
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
    await page.getByLabel('email', { exact: true }).fill('student@example.test');
    await page.getByRole('button', { name: 'send reset link' }).click();
    await expect(page.getByRole('status')).toHaveText('if that email has an account, a reset link is on its way.');
    expect(await calls(page)).toEqual(['forgot']);
    await page.getByRole('button', { name: 'back to sign in' }).click();
    await expect(page.getByLabel('password', { exact: true })).toHaveValue('');
  });

  test('a query parameter cannot unlock password recovery', async ({ page }) => {
    await fixture(page, 'mode=reset&recoveryReady=true&recovery=event&type=recovery&redirectType=recovery');
    await expect(page.getByRole('link', { name: 'request a reset link', exact: true })).toBeVisible();
    await expect(page.locator('input')).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
  });

  for (const [label, query] of [
    ['an ordinary sign-in code', 'mode=reset&code=fake-code-1&recovery=none'],
    ['a failed exchange', 'mode=reset&code=fake-code-1&recovery=event&exchange-fails=1'],
  ] as const) test(`${label} keeps the reset form closed`, async ({ page }) => {
    await fixture(page, query);
    await expect(page.getByRole('link', { name: 'request a reset link', exact: true })).toBeVisible();
    await expect(page.locator('input')).toHaveCount(0);
    expect(await calls(page)).toEqual(['exchange']);
    expect(page.url()).not.toContain('code=');
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
  });

  for (const recovery of ['event', 'typed']) test(`a recovery exchange (${recovery}) opens the form and clears the code`, async ({ page }) => {
    await fixture(page, `mode=reset&code=fake-code-1&recovery=${recovery}`);
    await expect(page.getByLabel('password', { exact: true })).toBeVisible();
    expect(await calls(page)).toEqual(['exchange']);
    // The code stays in the address during the exchange (supabase-js reads sb_flow_id there), then is removed.
    expect((await fixtureLog(page))[0]).toBe('exchange:fake-code-1 at ' + `?mode=reset&code=fake-code-1&recovery=${recovery}`);
    expect(page.url()).not.toContain('code=');
    expect(await clientLoads(page)).toBe(1);
  });

  test('verified recovery saves once and clears the field', async ({ page }) => {
    await fixture(page, recoveryLink);
    await page.getByLabel('password', { exact: true }).fill(fakePassword);
    await page.getByRole('button', { name: 'save new password' }).dblclick();
    await expect(page.getByRole('status')).toHaveText('your password has been changed.');
    expect(await calls(page)).toEqual(['exchange', 'update']);
    await expect(page.getByLabel('password', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'password changed' })).toHaveAttribute('aria-disabled', 'true');
  });

  for (const mode of ['signin', 'signup', 'reset']) test(`${mode} has accessible controls, size and focus`, async ({ page }) => {
    await fixture(page, mode === 'reset' ? recoveryLink : `mode=${mode}`);
    await expect(page.locator('input').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const field of await page.locator('input').all()) {
      expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(50);
    }
    for (const button of await page.getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    }
    const controls = page.locator('input, button, a[href]');
    const reached = new Set<number>();
    for (let press = 0; press < await controls.count() + 2; press++) {
      await page.keyboard.press('Tab');
      for (let index = 0; index < await controls.count(); index++) {
        if (await controls.nth(index).evaluate(el => el === document.activeElement)) {
          reached.add(index);
          expect(await controls.nth(index).evaluate(el => {
            const style = getComputedStyle(el);
            return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          })).toBe(true);
        }
      }
    }
    expect(reached.size).toBe(await controls.count());
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(item => item.id)).toEqual([]);
  });
});

test.describe('sign-in callback with fake shared auth', () => {
  test('exchanges the code once, removes it, then opens the checked next page', async ({ page }) => {
    await fixture(page, 'mode=callback&code=fake-code-1&next=%2Fsupport');
    await page.waitForURL(url => url.pathname === '/support');
    const entries = await fixtureLog(page);
    expect(entries).toEqual([
      'exchange:fake-code-1 at ?mode=callback&code=fake-code-1&next=%2Fsupport',
      expect.stringMatching(/^replaced:http:\/\/localhost:\d+\/__account-fixture$/),
    ]);
  });

  test('sends an unsafe next value to /progress', async ({ page }) => {
    await fixture(page, `mode=callback&code=fake-code-1&next=${encodeURIComponent('//evil.example')}`);
    await page.waitForURL(url => url.pathname === '/progress');
  });

  for (const [label, query, exchanged] of [
    ['a failed exchange', 'mode=callback&code=fake-code-1&exchange-fails=1', true],
    ['a provider error', 'mode=callback&error=access_denied&error_description=provider-private-detail', false],
    ['a missing code', 'mode=callback', false],
  ] as const) test(`${label} shows one generic sentence and a sign-in link`, async ({ page }) => {
    await fixture(page, query);
    await expect(page.getByRole('alert')).toHaveText("sign-in didn't finish. please try again.");
    await expect(page.getByRole('link', { name: 'back to sign in', exact: true })).toHaveAttribute('href', '/signin');
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
    expect(page.url()).not.toMatch(/code=|error/);
    expect(await calls(page)).toEqual(exchanged ? ['exchange'] : []);
    // Without a code nothing needs the client, so it is never downloaded.
    expect(await clientLoads(page)).toBe(exchanged ? 1 : 0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(item => item.id)).toEqual([]);
  });

  test('a failed client download is generic too', async ({ page }) => {
    await fixture(page, 'mode=callback&code=fake-code-1&load-fails=1');
    await expect(page.getByRole('alert')).toHaveText("sign-in didn't finish. please try again.");
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
    expect(await calls(page)).toEqual([]);
  });

  test('keeps the accounts-off message when the shared client is unconfigured', async ({ page }) => {
    await fixture(page, 'mode=callback&client=off&code=fake-code-1');
    await expect(page.getByText("accounts open soon. sign-in isn't available yet.")).toBeVisible();
    await expect(page.getByRole('link', { name: 'back to home', exact: true })).toHaveAttribute('href', '/#signup');
    expect(await calls(page)).toEqual([]);
    expect(page.url()).not.toContain('code=');
  });
});

test('/auth/callback with accounts off makes no account requests and drops the code', async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on('request', request => {
    if (/supabase|accounts\.google/.test(new URL(request.url()).hostname)) remoteRequests.push(request.url());
  });
  await page.goto('/auth/callback?code=fake-code-1&next=%2Fsupport');
  await expect(page.getByText("accounts open soon. sign-in isn't available yet.")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  expect(new URL(page.url()).search).toBe('');
  expect(remoteRequests).toEqual([]);
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

/**
 * Task 301: /account/two-factor. The real page is checked with accounts off (this build has no Supabase settings).
 * The enabled screens run the real components with the built CSS and the built page's own content security policy,
 * on a fixture page that Playwright serves; only the shared client module is replaced by a fake auth client, so no
 * request leaves the browser.
 */

const axe = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map(v => `${v.id}: ${v.help}`)).toEqual([]);
};

test.describe('/account/two-factor with accounts off', () => {
  test('is a plain, unindexed page that says accounts are not open', async ({ page }) => {
    const remote: string[] = [];
    page.on('request', request => { if (/supabase/.test(new URL(request.url()).hostname)) remote.push(request.url()); });
    await page.goto('/account/two-factor');
    await expect(page.getByRole('heading', { level: 1, name: 'two-factor sign-in' })).toBeVisible();
    await expect(page).toHaveTitle('two-factor sign-in · cueory');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByTestId('signin-unavailable')).toBeVisible();
    await expect(page.locator('main input')).toHaveCount(0);
    await axe(page);
    expect(remote).toEqual([]);
  });
});

let fixtureCode: string;
let fixtureCss: string;
let fixtureCsp: string;
test.beforeAll(async () => {
  const html = readFileSync('dist/account/two-factor.html', 'utf8');
  fixtureCss = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  fixtureCsp = html.match(/<meta http-equiv="content-security-policy" content="([^"]+)"/)?.[1] ?? '';
  if (!fixtureCss || !fixtureCsp) throw new Error('The built page was not found. Run npm run build.');
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import TwoFactor from './src/islands/TwoFactor.tsx';
      import AdminFlags from './src/islands/AdminFlags.tsx';
      const params = new URLSearchParams(location.search);
      const state = params.get('state') ?? 'off';
      window.authCalls = [];
      const factor = { id: '00000000-0000-4000-8000-0000000000f1', factor_type: 'totp', status: 'verified' };
      let factors = state === 'off' ? [] : [factor];
      let level = state === 'on' ? 'aal2' : 'aal1';
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width="210" height="210">' +
        '<rect width="21" height="21" fill="#ffffff"/><rect x="2" y="2" width="7" height="7" fill="#000000"/></svg>';
      const reply = (name, data, error = null) => {
        window.authCalls.push(name);
        return new Promise(resolve => setTimeout(() => resolve({ data: error ? null : data, error }), 50));
      };
      const mfa = {
        getAuthenticatorAssuranceLevel: () => reply('aal', {
          currentLevel: level, nextLevel: factors.some(f => f.status === 'verified') ? 'aal2' : level }),
        listFactors: () => reply('listFactors', { all: factors, totp: factors.filter(f => f.status === 'verified') }),
        enroll: () => {
          factors = [{ ...factor, status: 'unverified' }];
          return reply('enroll', { id: factor.id, type: 'totp', totp: {
            qr_code: 'data:image/svg+xml;utf-8,' + svg, secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } });
        },
        challenge: () => reply('challenge', { id: '00000000-0000-4000-8000-0000000000c1' }),
        verify: ({ code }) => {
          if (code !== '123456') return reply('verify', null, { code: 'mfa_verification_failed', status: 422, message: 'provider-private-detail' });
          factors = factors.map(f => ({ ...f, status: 'verified' }));
          level = 'aal2';
          return reply('verify', {});
        },
        unenroll: ({ factorId }) => { factors = factors.filter(f => f.id !== factorId); return reply('unenroll', { id: factorId }); },
      };
      const listeners = new Set();
      let currentUser = state === 'signed-out' ? null : { id: 'fake-user-a' };
      const auth = {
        mfa,
        getSession: () => reply('getSession', { session: currentUser ? { access_token: 'x', user: currentUser } : null }),
        refreshSession: () => { level = 'aal1'; return reply('refreshSession', {}).then(() => ({ error: null })); },
        signOut: options => { currentUser = null; window.authCalls.push('signOut:' + options.scope); return Promise.resolve({ error: null }); },
        onAuthStateChange: callback => {
          listeners.add(callback);
          queueMicrotask(() => callback('INITIAL_SESSION', currentUser ? { user: currentUser } : null));
          return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
        },
      };
      window.changeFixtureUser = userId => {
        currentUser = userId ? { id: userId } : null;
        for (const callback of listeners) callback(userId ? 'SIGNED_IN' : 'SIGNED_OUT', currentUser ? { user: currentUser } : null);
      };
      window.fixtureAuth = auth;
      createRoot(document.getElementById('fixture')).render(params.get('page') === 'admin' ? <AdminFlags /> : <TwoFactor />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-client', setup(builder) {
      builder.onResolve({ filter: /\/supabaseclient(?:\.ts)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export async function getSupabase() { return { auth: window.fixtureAuth }; }
      `, loader: 'js' }));
    } }],
  });
  fixtureCode = result.outputFiles[0]!.text;
});

/** The fixture page, under the built page's CSP. Any CSP violation is recorded. */
async function fixture(page: Page, query: string) {
  await page.route('**/__two-factor-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__two-factor-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="content-security-policy" content="${fixtureCsp}">
    <title>two-factor component test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main class="mx-auto max-w-110 p-6 font-body leading-relaxed"><h1>two-factor component test</h1>
    <div id="fixture"></div></main><script src="/__two-factor-fixture.js"></script></body></html>` }));
  await page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      (window as unknown as { cspViolations: string[] }).cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.goto(`/__two-factor-fixture?${query}`);
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { authCalls: string[] }).authCalls);
const violations = (page: Page) => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
const codeField = (page: Page) => page.getByLabel('code from your app');

async function sizesAndFocus(page: Page) {
  for (const control of await page.locator('#fixture').locator('button, a[href], input').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('two-factor with a fake auth client', () => {
  test('turns on: QR code and key, a wrong code, then the right one', async ({ page }) => {
    await fixture(page, 'state=off');
    await expect(page.getByRole('heading', { name: 'two-factor is off' })).toBeVisible();
    await sizesAndFocus(page);
    await axe(page);
    await page.getByRole('button', { name: 'turn on two-factor' }).click();

    const qr = page.getByRole('img', { name: /QR code for adding cueory/ });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('src', /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    // The image really loads under the site's CSP (img-src 'self' data:).
    expect(await qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.getByTestId('two-factor-secret')).toHaveText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP');
    await expect(codeField(page)).toBeFocused();
    await sizesAndFocus(page);
    await axe(page);

    await codeField(page).fill('000000');
    await page.getByRole('button', { name: 'turn on', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText("that code didn't work. check the 6 digits in your app and try again.");
    await expect(codeField(page)).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('provider-private-detail');

    await codeField(page).fill('123 456');
    await page.getByRole('button', { name: 'turn on', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'two-factor is on' })).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('two-factor is now on.');
    expect(await calls(page)).toEqual(['getSession', 'aal', 'listFactors', 'listFactors', 'enroll',
      'challenge', 'verify', 'challenge', 'verify']);
    expect(await violations(page)).toEqual([]);
  });

  test('a code that is not 6 digits is caught before anything is sent', async ({ page }) => {
    await fixture(page, 'state=off');
    await page.getByRole('button', { name: 'turn on two-factor' }).click();
    await codeField(page).fill('123');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('enter the 6-digit code from your authenticator app.');
    expect((await calls(page)).filter(c => c === 'challenge')).toEqual([]);
  });

  test('cancel removes the half-finished app', async ({ page }) => {
    await fixture(page, 'state=off');
    await page.getByRole('button', { name: 'turn on two-factor' }).click();
    await page.getByRole('button', { name: 'cancel' }).click();
    await expect(page.getByRole('heading', { name: 'two-factor is off' })).toBeFocused();
    expect((await calls(page)).at(-1)).toBe('unenroll');
  });

  test('sign-out removes an in-progress enrollment secret and QR code immediately', async ({ page }) => {
    await fixture(page, 'state=off');
    await expect(page.getByRole('heading', { name: 'two-factor is off' })).toBeVisible();
    await page.getByRole('button', { name: 'turn on two-factor' }).click();
    await expect(page.getByTestId('two-factor-secret')).toBeVisible();
    await page.evaluate(() => (window as unknown as { changeFixtureUser: (id: string | null) => void }).changeFixtureUser(null));
    await expect(page.getByTestId('two-factor-secret')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'sign in first' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'sign in' })).toHaveAttribute('href', '/signin?next=%2Faccount%2Ftwo-factor');
  });

  test('a second account cannot see the first account\'s pending enrollment', async ({ page }) => {
    await fixture(page, 'state=off');
    await expect(page.getByRole('heading', { name: 'two-factor is off' })).toBeVisible();
    await page.getByRole('button', { name: 'turn on two-factor' }).click();
    await expect(page.getByTestId('two-factor-secret')).toBeVisible();
    await page.evaluate(() => (window as unknown as { changeFixtureUser: (id: string | null) => void }).changeFixtureUser('fake-user-b'));
    await expect(page.getByTestId('two-factor-secret')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'two-factor is off' })).toBeVisible();
  });

  test('sign-out during slow enrollment prevents its result from restoring the old secret', async ({ page }) => {
    await fixture(page, 'state=off');
    await expect(page.getByRole('heading', { name: 'two-factor is off' })).toBeVisible();
    await page.getByRole('button', { name: 'turn on two-factor' }).click();
    await page.evaluate(() => (window as unknown as { changeFixtureUser: (id: string | null) => void }).changeFixtureUser(null));
    await expect(page.getByRole('heading', { name: 'sign in first' })).toBeVisible();
    await expect.poll(async () => (await calls(page)).includes('enroll')).toBe(true);
    await expect(page.getByTestId('two-factor-secret')).toHaveCount(0);
  });

  test('the code at sign-in, then back to where the student was going', async ({ page }) => {
    await page.route('**/admin/flags', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>back</title><p>arrived</p>' }));
    await fixture(page, 'state=needs-code&next=%2Fadmin%2Fflags');
    await expect(page.getByRole('heading', { name: 'enter your two-factor code' })).toBeVisible();
    await expect(codeField(page)).toBeFocused();
    await sizesAndFocus(page);
    await axe(page);
    await codeField(page).fill('123456');
    await page.getByRole('button', { name: 'continue' }).click();
    await expect(page).toHaveURL(/\/admin\/flags$/);
  });

  test('an outside next address is never followed', async ({ page }) => {
    await fixture(page, 'state=needs-code&next=https%3A%2F%2Fevil.example%2F');
    await codeField(page).fill('123456');
    await page.getByRole('button', { name: 'continue' }).click();
    await expect(page).toHaveURL(/\/progress$/);
  });

  test('removing needs a current code, then the session is refreshed', async ({ page }) => {
    await fixture(page, 'state=on');
    await expect(page.getByRole('heading', { name: 'two-factor is on' })).toBeVisible();
    await page.getByRole('button', { name: 'remove two-factor' }).click();
    await expect(page.getByRole('heading', { name: 'remove two-factor?' })).toBeVisible();
    await sizesAndFocus(page);
    await axe(page);
    await page.getByRole('button', { name: 'keep it on' }).click();
    await expect(page.getByRole('heading', { name: 'two-factor is on' })).toBeFocused();
    await page.getByRole('button', { name: 'remove two-factor' }).click();
    await codeField(page).fill('000000');
    await page.getByRole('button', { name: 'remove two-factor' }).click();
    await expect(page.getByRole('alert')).toContainText("that code didn't work");
    expect(await calls(page)).not.toContain('unenroll');
    await codeField(page).fill('123456');
    await page.getByRole('button', { name: 'remove two-factor' }).click();
    await expect(page.getByRole('heading', { name: 'two-factor is off' })).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('two-factor is off.');
    expect((await calls(page)).slice(-4)).toEqual(['challenge', 'verify', 'unenroll', 'refreshSession']);
  });

  test('signed out: a sign-in link that comes back here', async ({ page }) => {
    await fixture(page, 'state=signed-out');
    const link = page.getByRole('link', { name: 'sign in' });
    await expect(link).toHaveAttribute('href', '/signin?next=%2Faccount%2Ftwo-factor');
    await axe(page);
  });

  test('every control is reached by keyboard with visible focus', async ({ page }) => {
    await fixture(page, 'state=off');
    await page.getByRole('button', { name: 'turn on two-factor' }).click();
    await expect(codeField(page)).toBeFocused();
    const controls = page.locator('#fixture').locator('input, button, a[href]');
    const reached = new Set<number>();
    for (let press = 0; press < (await controls.count()) + 2; press++) {
      for (let index = 0; index < await controls.count(); index++) {
        if (await controls.nth(index).evaluate(el => el === document.activeElement)) {
          reached.add(index);
          expect(await controls.nth(index).evaluate(el => {
            const style = getComputedStyle(el);
            return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          })).toBe(true);
        }
      }
      await page.keyboard.press('Tab');
    }
    expect(reached.size).toBe(await controls.count());
  });

  test('/admin/flags at aal1 with two-factor on offers the code page', async ({ page }) => {
    await fixture(page, 'state=needs-code&page=admin');
    await expect(page.getByRole('heading', { name: 'this page is for the site owner.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'enter your two-factor code' }))
      .toHaveAttribute('href', '/account/two-factor?next=%2Fadmin%2Fflags');
  });

  test('/admin/flags offers nothing new to an account without two-factor', async ({ page }) => {
    await fixture(page, 'state=off&page=admin');
    await expect(page.getByRole('heading', { name: 'this page is for the site owner.' })).toBeVisible();
    await expect.poll(() => calls(page)).toContain('aal');
    await expect(page.getByRole('link')).toHaveCount(0);
  });
});

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
    page.on('pageerror', error => errors.push(error.message));
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
// Real components + built CSS, injected fake auth, no accounts, credentials, or provider network traffic.
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
      const params = new URLSearchParams(location.search);
      window.authCalls = [];
      const call = async name => {
        window.authCalls.push(name);
        await new Promise(resolve => setTimeout(resolve, 150));
        return { error: params.has('fail') ? { status: 400, message: 'provider-private-detail' } : null };
      };
      const auth = {
        signUp: () => call('signup'),
        signInWithOAuth: () => call('google'),
        signInWithPassword: () => call('signin'),
        resetPasswordForEmail: () => call('forgot'),
        updateUser: () => call('update'),
      };
      createRoot(document.getElementById('fixture')).render(params.get('mode') === 'reset'
        ? <ResetPassword auth={auth} recoveryReady={!params.has('unverified')} />
        : <SignIn auth={auth} mode={params.get('mode') === 'signup' ? 'signup' : 'signin'} />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
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

test.describe('enabled account components with injected auth', () => {
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
    await fixture(page, 'mode=reset&unverified=1&recoveryReady=true');
    await expect(page.getByRole('link', { name: 'request a reset link', exact: true })).toBeVisible();
    await expect(page.locator('input')).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
  });

  test('verified recovery saves once and clears the field', async ({ page }) => {
    await fixture(page, 'mode=reset');
    await page.getByLabel('password', { exact: true }).fill(fakePassword);
    await page.getByRole('button', { name: 'save new password' }).dblclick();
    await expect(page.getByRole('status')).toHaveText('your password has been changed.');
    expect(await calls(page)).toEqual(['update']);
    await expect(page.getByLabel('password', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'password changed' })).toHaveAttribute('aria-disabled', 'true');
  });

  for (const mode of ['signin', 'signup', 'reset']) test(`${mode} has accessible controls, size and focus`, async ({ page }) => {
    await fixture(page, `mode=${mode}`);
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

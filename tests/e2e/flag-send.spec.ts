import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Task 171: the real FlagMount, the real shared client module and the real supabase-js, built with accounts on for a
// made-up project. The session is seeded in local storage, and the project's address is answered by page.route, so
// nothing leaves the browser. The fixture is intercepted by Playwright, never written into dist or shipped.
const PROJECT = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_fixture_not_a_real_key';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const REPORT_ID = '11111111-1111-4111-8111-111111111111';
const PAGE_PATH = '/learn/study-skills/questions';

let fixtureCode: string;
let fixtureCss: string;
test.beforeAll(async () => {
  const html = readFileSync('dist/index.html', 'utf8');
  fixtureCss = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  if (!fixtureCss) throw new Error('The production stylesheet was not found. Run npm run build.');
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import FlagMount from './src/islands/FlagMount.tsx';
      const params = new URLSearchParams(location.search);
      const item = params.has('item') ? { itemId: '${ITEM_ID}', itemVersionId: '${VERSION_ID}' } : {};
      createRoot(document.getElementById('fixture')).render(<FlagMount page="${PAGE_PATH}" variant="icon" {...item} />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env': JSON.stringify({ PUBLIC_SUPABASE_URL: PROJECT, PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY }),
    },
  });
  fixtureCode = result.outputFiles[0]!.text;
});

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

type Reply = { status: number; body: unknown };
/** Opens the fixture, optionally signed in, and answers the made-up project's submit_flag with `reply` (by call number). */
async function fixture(page: Page, options: { signedIn: boolean; query?: string; reply?: (call: number) => Reply }) {
  const rpcCalls: Request[] = [];
  const otherCalls: string[] = [];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: USER_ID, role: 'authenticated', exp })}.fixture`;
  if (options.signedIn) {
    await page.addInitScript(([token, user, expiresAt]) => {
      localStorage.setItem('cueory-auth', JSON.stringify({
        access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, refresh_token: 'fixture-refresh',
        user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'student@example.test', app_metadata: {}, user_metadata: {} },
      }));
    }, [accessToken, USER_ID, exp] as const);
  }
  await page.route(`${PROJECT}/**`, async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST' && url.pathname === '/rest/v1/rpc/submit_flag') {
      rpcCalls.push(route.request());
      const reply = options.reply?.(rpcCalls.length) ?? { status: 200, body: REPORT_ID };
      await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
    } else {
      otherCalls.push(`${route.request().method()} ${url.pathname}`);
      await route.abort();
    }
  });
  await page.route('**/__flag-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__flag-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>flag component test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main class="mx-auto max-w-110 p-6 pt-section font-body leading-relaxed"><h1>flag component test</h1>
    <div id="fixture" class="mt-section pt-section"></div></main><script src="/__flag-fixture.js"></script></body></html>` }));
  await page.goto(`/__flag-fixture?${options.query ?? 'x=1'}`);
  return { rpcCalls, otherCalls, accessToken };
}

const flagButton = (page: Page) => page.getByRole('button', { name: 'flag or comment', exact: true });

async function fillReport(page: Page) {
  await flagButton(page).click();
  await page.getByRole('radio', { name: 'something confusing' }).check();
  await page.getByLabel('anything to add? (optional)').fill('  the second choice reads oddly  ');
}

test.describe('flag or comment with accounts on', () => {
  test('a signed-in student sends a report with the item and exactly the submit_flag arguments', async ({ page }) => {
    const { rpcCalls, otherCalls, accessToken } = await fixture(page, { signedIn: true, query: 'item=1' });
    await fillReport(page);
    await expect(page.getByTestId('flag-form')).toContainText(`item ${ITEM_ID}, version ${VERSION_ID}`);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'send', exact: true }).click();
    await expect(page.getByTestId('flag-result')).toHaveText('thank you. your report is in.');
    await expect(flagButton(page)).toHaveAttribute('aria-expanded', 'false');

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.postDataJSON()).toEqual({
      page: PAGE_PATH, item_id: ITEM_ID, item_version_id: VERSION_ID, reason: 'confusing', comment: 'the second choice reads oddly',
    });
    const headers = rpcCalls[0]!.headers();
    expect(headers.apikey).toBe(KEY);
    expect(headers.authorization).toBe(`Bearer ${accessToken}`);
    expect(otherCalls).toEqual([]);
  });

  test('the comment field shows a visible patient-information warning that describes it', async ({ page }) => {
    await fixture(page, { signedIn: true });
    await flagButton(page).click();
    const warning = page.getByTestId('flag-patient-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('please don\'t include patient names, dates of birth, medical record numbers');
    const box = page.getByLabel('anything to add? (optional)');
    const warningId = await warning.getAttribute('id');
    expect((await box.getAttribute('aria-describedby'))?.split(' ')).toContain(warningId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  });

  test('a page with no item sends null item context', async ({ page }) => {
    const { rpcCalls } = await fixture(page, { signedIn: true });
    await fillReport(page);
    await page.getByRole('button', { name: 'send', exact: true }).click();
    await expect(page.getByTestId('flag-result')).toHaveText('thank you. your report is in.');
    expect(rpcCalls[0]!.postDataJSON()).toMatchObject({ page: PAGE_PATH, item_id: null, item_version_id: null });
  });

  test('an unconfirmed account sees a plain sentence, never the raw refusal', async ({ page }) => {
    const { rpcCalls } = await fixture(page, {
      signedIn: true,
      reply: () => ({ status: 403, body: { code: 'P0001', message: 'confirm your email to use this', details: null, hint: null } }),
    });
    await fillReport(page);
    await page.getByRole('button', { name: 'send', exact: true }).click();
    const sentence = 'please confirm your email to send a report — look for the link in your inbox.';
    await expect(page.getByTestId('flag-visible-result')).toHaveText(sentence);
    await expect(page.getByTestId('flag-result')).toHaveText(sentence);
    await expect(page.locator('body')).not.toContainText('confirm your email to use this');
    // The draft stays so the student can send it once confirmed.
    await expect(page.getByLabel('anything to add? (optional)')).toHaveValue('  the second choice reads oddly  ');
    expect(rpcCalls).toHaveLength(1);
  });

  test('the rate limit and unknown errors keep the form\'s own lines', async ({ page }) => {
    const { rpcCalls } = await fixture(page, {
      signedIn: true,
      reply: call => ({ status: 400, body: { code: 'P0001', message: call === 1 ? 'that is a lot of reports; please try again later' : 'private database detail' } }),
    });
    await fillReport(page);
    await page.getByRole('button', { name: 'send', exact: true }).click();
    await expect(page.getByTestId('flag-result')).toHaveText("you've sent a few reports this hour. please try again later.");
    await page.getByRole('button', { name: 'send', exact: true }).click();
    await expect(page.getByTestId('flag-result')).toHaveText("it didn't send. please try again.");
    await expect(page.locator('body')).not.toContainText('private database detail');
    expect(rpcCalls).toHaveLength(2);
  });

  test('a sign-in in another tab is picked up when the form opens again, without a reload (Codex on #237)', async ({ page, context }) => {
    const { rpcCalls, accessToken } = await fixture(page, { signedIn: false });
    await flagButton(page).click();
    const panel = page.getByTestId('flag-form');
    await expect(panel).toContainText('a free account is needed to send a report');
    await flagButton(page).click();
    await expect(flagButton(page)).toHaveAttribute('aria-expanded', 'false');

    // Another tab of this site signs in: supabase-js keeps the session in shared local storage.
    const other = await context.newPage();
    await other.route('**/__blank', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>other tab</title>' }));
    await other.goto('/__blank');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await other.evaluate(([token, user, expiresAt]) => {
      localStorage.setItem('cueory-auth', JSON.stringify({
        access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, refresh_token: 'fixture-refresh',
        user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'student@example.test', app_metadata: {}, user_metadata: {} },
      }));
    }, [accessToken, USER_ID, exp] as const);
    await other.close();

    await flagButton(page).click();
    await expect(page.getByRole('radio', { name: 'something confusing' })).toBeVisible();
    await expect(panel).not.toContainText('a free account is needed to send a report');
    await page.getByRole('radio', { name: 'something confusing' }).check();
    await page.getByRole('button', { name: 'send', exact: true }).click();
    await expect(page.getByTestId('flag-result')).toHaveText('thank you. your report is in.');
    expect(rpcCalls).toHaveLength(1);
  });

  test('signed out, the form offers the email instead and calls nothing', async ({ page }) => {
    const { rpcCalls, otherCalls } = await fixture(page, { signedIn: false });
    await flagButton(page).click();
    const panel = page.getByTestId('flag-form');
    await expect(panel).toContainText('a free account is needed to send a report');
    await expect(panel.getByRole('link', { name: 'hello@cueory.app' })).toBeVisible();
    await expect(panel.getByTestId('flag-patient-warning')).toContainText('please don\'t include patient names');
    await expect(panel.getByRole('button', { name: 'send', exact: true })).toHaveCount(0);
    expect(rpcCalls).toEqual([]);
    expect(otherCalls).toEqual([]);
  });
});

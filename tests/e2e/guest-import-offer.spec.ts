import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const USER = '550e8400-e29b-41d4-a716-446655440001';
const OTHER = '550e8400-e29b-41d4-a716-446655440002';
const MARKER = `cueory-guest-imported:${USER}`;
const OTHER_MARKER = `cueory-guest-imported:${OTHER}`;

test.describe('/progress with accounts off', () => {
  test('shows no offer and contacts no account service, even with saved progress', async ({ page }) => {
    const remote: string[] = [];
    page.on('request', request => { if (/supabase/.test(new URL(request.url()).hostname)) remote.push(request.url()); });
    await page.addInitScript(() => {
      localStorage.setItem('cueory-progress', JSON.stringify({
        version: 1, onboarding: { course: 'fundamentals', examDate: null, done: true },
        decks: { 'deck-a': { know: ['card-a'], learning: [], starred: [] } },
      }));
    });
    await page.goto('/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'your progress on this device' })).toBeVisible();
    await expect(page.getByTestId('guest-import-offer')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'bring it in' })).toHaveCount(0);
    expect(await page.evaluate(key => Object.keys(localStorage).filter(k => k.startsWith(key)), 'cueory-guest-imported:')).toEqual([]);
    expect(remote).toEqual([]);
  });
});

// Browser-only component fixture, intercepted by Playwright and never shipped. The real island and built CSS run;
// only the shared Supabase client module is replaced by a fake signed-in session and an in-memory database whose
// calls are recorded in localStorage, so two tabs share one record.
let fixtureCode: string;
let fixtureCss: string;
test.beforeAll(async () => {
  const html = readFileSync('dist/progress.html', 'utf8');
  fixtureCss = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  if (!fixtureCss) throw new Error('The production stylesheet was not found. Run npm run build.');
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import GuestImportOffer from './src/islands/GuestImportOffer.tsx';
      const params = new URLSearchParams(location.search);
      if (params.has('seed')) {
        const exam = new Date(); exam.setDate(exam.getDate() + 30);
        const pad = n => String(n).padStart(2, '0');
        const examDate = exam.getFullYear() + '-' + pad(exam.getMonth() + 1) + '-' + pad(exam.getDate());
        localStorage.setItem('cueory-progress', JSON.stringify({
          version: 1, onboarding: { course: 'fundamentals', examDate, done: true }, decks: {},
        }));
      }
      createRoot(document.getElementById('fixture')).render(<GuestImportOffer />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-client', setup(builder) {
      builder.onResolve({ filter: /\/supabaseclient(?:\.ts)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        const params = new URLSearchParams(location.search);
        const record = (call) => {
          const calls = JSON.parse(localStorage.getItem('fixture-db-calls') || '[]');
          calls.push(call);
          localStorage.setItem('fixture-db-calls', JSON.stringify(calls));
        };
        const answer = () => new Promise(resolve => setTimeout(() => resolve({
          error: params.has('fail') ? { code: '08006', message: 'provider-private-detail' } : null,
        }), 200));
        // The signed-in account can be switched through localStorage ('none' = signed out). Like supabase-js's
        // cross-tab broadcast, a switch made in another tab is announced to onAuthStateChange listeners here;
        // a switch made in this tab is not, which stands in for a missed announcement.
        const signedInAs = () => localStorage.getItem('fixture-user') ?? '${USER}';
        const client = {
          auth: {
            onAuthStateChange: (callback) => {
              const onStorage = (event) => {
                if (event.key !== 'fixture-user') return;
                const id = signedInAs();
                callback(id === 'none' ? 'SIGNED_OUT' : 'SIGNED_IN', id === 'none' ? null : { user: { id } });
              };
              window.addEventListener('storage', onStorage);
              return { data: { subscription: { unsubscribe: () => window.removeEventListener('storage', onStorage) } } };
            },
          },
          from: (table) => ({
            insert: (row) => { record(['insert', table, row]); return answer(); },
            update: (patch) => ({ eq: (column, value) => { record(['update', table, patch, column, value]); return answer(); } }),
          }),
        };
        export async function getSupabase() { return params.get('client') === 'off' ? null : client; }
        export async function getSessionState() {
          const id = signedInAs();
          return params.has('signed-out') || id === 'none' ? { signedIn: false } : { signedIn: true, userId: id, email: 'student@example.test' };
        }
      `, loader: 'js' }));
    } }],
  });
  fixtureCode = result.outputFiles[0].text;
});

async function routes(page: Page) {
  await page.route('**/__guest-import-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__guest-import-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>guest import test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main id="main" class="mx-auto max-w-prose p-6 font-body leading-relaxed"><h1>your progress on this device</h1>
    <div id="fixture"></div></main><script src="/__guest-import-fixture.js"></script></body></html>` }));
}

async function open(page: Page, query: string) {
  await routes(page);
  await page.goto(`/__guest-import-fixture?${query}`);
}

const dbCalls = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fixture-db-calls') || '[]') as unknown[][]);
const marker = (page: Page) => page.evaluate(key => localStorage.getItem(key), MARKER);
const offer = (page: Page) => page.getByRole('region', { name: 'bring in your progress from this device?' });

test.describe('guest import offer after sign-in', () => {
  test('shows nothing when accounts are off, signed out, or nothing is saved', async ({ page }) => {
    await open(page, 'seed=1&client=off');
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: 'bring it in' })).toHaveCount(0);
    await open(page, 'signed-out=1');
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: 'bring it in' })).toHaveCount(0);
    await page.evaluate(() => localStorage.removeItem('cueory-progress'));
    await open(page, 'x=1');
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: 'bring it in' })).toHaveCount(0);
    expect(await dbCalls(page)).toEqual([]);
    expect(await marker(page)).toBeNull();
  });

  test('offers once and brings the exam date in', async ({ page }) => {
    await open(page, 'seed=1');
    await expect(offer(page)).toBeVisible();
    await expect(offer(page)).toContainText('on this device: your exam date.');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations.map(v => v.id)).toEqual([]);
    for (const button of await offer(page).getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'bring it in' }).dblclick();
    await expect(page.getByRole('status')).toHaveText('your exam date is in your account now.');
    await expect(page.getByRole('status')).toBeFocused();
    const calls = await dbCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.slice(0, 2)).toEqual(['insert', 'exam_plans']);
    expect(Object.keys(calls[0]![2] as object).sort()).toEqual(['course', 'exam_date']);
    expect(await marker(page)).toBe('1');

    await open(page, 'x=1');
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: 'bring it in' })).toHaveCount(0);
    expect(await dbCalls(page)).toHaveLength(1);
  });

  test('"not now" hides the offer for good and saves nothing', async ({ page }) => {
    await open(page, 'seed=1');
    await page.getByRole('button', { name: 'not now' }).focus();
    await page.keyboard.press('Enter');
    await expect(offer(page)).toHaveCount(0);
    await expect(page.locator('h1')).toBeFocused();
    expect(await marker(page)).toBe('declined');
    await open(page, 'x=1');
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: 'bring it in' })).toHaveCount(0);
    expect(await dbCalls(page)).toEqual([]);
  });

  test('a failure keeps the offer for a retry and shows no provider detail', async ({ page }) => {
    await open(page, 'seed=1&fail=1');
    await page.getByRole('button', { name: 'bring it in' }).click();
    await expect(page.getByRole('alert')).toHaveText('your exam date could not be saved. please try again.');
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
    await expect(page.getByRole('button', { name: 'bring it in' })).toBeVisible();
    expect(await marker(page)).toBeNull();
  });

  test('two tabs: one import, and the other tab stops offering', async ({ page, context }) => {
    await open(page, 'seed=1');
    const second = await context.newPage();
    await open(second, 'x=1');
    await expect(offer(page)).toBeVisible();
    await expect(offer(second)).toBeVisible();

    await Promise.all([
      page.getByRole('button', { name: 'bring it in' }).click(),
      second.getByRole('button', { name: 'bring it in' }).click(),
    ]);
    await expect.poll(() => marker(page)).toBe('1');
    await expect(offer(page)).toHaveCount(0);
    await expect(offer(second)).toHaveCount(0);
    expect((await dbCalls(page)).filter(call => call[0] === 'insert')).toHaveLength(1);

    const third = await context.newPage();
    await open(third, 'x=1');
    await third.waitForTimeout(300);
    await expect(third.getByRole('button', { name: 'bring it in' })).toHaveCount(0);
  });

  test('another tab saying "not now" removes this tab\'s offer', async ({ page, context }) => {
    await open(page, 'seed=1');
    const second = await context.newPage();
    await open(second, 'x=1');
    await expect(offer(second)).toBeVisible();
    await page.getByRole('button', { name: 'not now' }).click();
    await expect(offer(second)).toHaveCount(0);
    expect(await dbCalls(second)).toEqual([]);
  });

  test('signing out or into another account in another tab moves the offer to that account', async ({ page, context }) => {
    await open(page, 'seed=1');
    await expect(offer(page)).toBeVisible();
    const second = await context.newPage();
    await open(second, 'signed-out=1');
    await second.evaluate(() => localStorage.setItem('fixture-user', 'none'));
    await expect(offer(page)).toHaveCount(0);

    await second.evaluate(id => localStorage.setItem('fixture-user', id), OTHER);
    await expect(offer(page)).toBeVisible();
    await page.getByRole('button', { name: 'bring it in' }).click();
    await expect(page.getByRole('status')).toHaveText('your exam date is in your account now.');
    expect(await page.evaluate(key => localStorage.getItem(key), OTHER_MARKER)).toBe('1');
    expect(await marker(page)).toBeNull();
  });

  test('a switch this tab never heard about is caught before anything is written', async ({ page }) => {
    await open(page, 'seed=1');
    await expect(offer(page)).toBeVisible();
    await page.evaluate(id => localStorage.setItem('fixture-user', id), OTHER);
    await page.getByRole('button', { name: 'bring it in' }).click();
    await expect(offer(page)).toHaveCount(0);
    expect(await dbCalls(page)).toEqual([]);
    expect(await marker(page)).toBeNull();
    expect(await page.evaluate(key => localStorage.getItem(key), OTHER_MARKER)).toBeNull();
  });
});

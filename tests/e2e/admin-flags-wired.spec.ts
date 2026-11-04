import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

/**
 * Task 305: /admin/flags wired to Task 65's database functions. The real island and the built CSS and CSP run on a
 * fixture page Playwright serves; only the shared client module is replaced by a fake with `rpc` (answering
 * admin_list_flags, admin_mark_flag_handled and admin_reopen_flag over made-up rows) and `auth.mfa`. Nothing leaves the
 * browser. Who may see the inbox is decided by the fake the way the database decides it: an admin at aal2.
 */

const axe = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map(v => `${v.id}: ${v.help}`)).toEqual([]);
};

let fixtureCode: string;
let fixtureCss: string;
let fixtureCsp: string;
test.beforeAll(async () => {
  const html = readFileSync('dist/admin/flags.html', 'utf8');
  fixtureCss = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  fixtureCsp = html.match(/<meta http-equiv="content-security-policy" content="([^"]+)"/)?.[1] ?? '';
  if (!fixtureCss || !fixtureCsp) throw new Error('The built page was not found. Run npm run build.');
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import AdminFlags from './src/islands/AdminFlags.tsx';
      const params = new URLSearchParams(location.search);
      // who: admin (aal2), admin-aal1 (two-factor on, code not entered), student, broken (every call fails once).
      let who = params.get('who') ?? 'admin';
      window.rpcCalls = [];
      const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
      let rows = [
        { id: id(1), user_id: id(900), page: '/learn/study-skills/questions', item_id: id(100), item_version_id: id(101),
          reason: 'typo', comment: 'sample comment one', status: 'open', created_at: '2026-11-02T10:00:00.123456+00:00', handled_at: null },
        { id: id(2), user_id: id(901), page: '/learn/study-skills', item_id: null, item_version_id: null,
          reason: 'broken', comment: null, status: 'open', created_at: '2026-11-02T09:00:00+00:00', handled_at: null },
        { id: id(3), user_id: id(902), page: '/play', item_id: null, item_version_id: null,
          reason: 'other', comment: 'sample comment: already looked at.', status: 'handled',
          created_at: '2026-11-01T09:00:00+00:00', handled_at: '2026-11-01T12:00:00+00:00' },
      ];
      if (who === 'capped' || who === 'capped-handled') {
        // More than 2,000 open or handled reports, so older records are hidden until the filter changes.
        const handled = who === 'capped-handled';
        rows = Array.from({ length: 2100 }, (_, i) => ({ id: id(5000 + i), user_id: id(900), page: '/play', item_id: null,
          item_version_id: null, reason: 'typo', comment: 'sample ' + i,
          status: handled ? 'handled' : 'open',
          created_at: new Date(Date.UTC(2026, 10, 2, 10, 0, 0) - i * 1000).toISOString(),
          handled_at: handled ? '2026-11-02T12:00:00+00:00' : null }));
      }
      let failures = who === 'broken' ? 1 : 0;
      const refusal = { code: '42501', message: 'only the site owner, signed in with two-factor, can do this', details: null, hint: null };
      window.completedRpcs = 0;
      const later = value => new Promise(resolve => setTimeout(() => {
        window.completedRpcs += 1;
        resolve(value);
      }, params.get('delay') === 'slow' ? 350 : 50));
      const rpc = (fn, args) => {
        window.rpcCalls.push([fn, args]);
        if (failures > 0) { failures -= 1; return later({ data: null, error: { code: '57014', message: 'provider-private-detail' } }); }
        if (who !== 'admin' && who !== 'broken' && who !== 'capped' && who !== 'capped-handled') return later({ data: null, error: refusal });
        if (fn === 'admin_list_flags') {
          const sorted = rows.filter(r => r.status === args.flag_status)
            .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
          const start = args.before_id ? sorted.findIndex(r => r.id === args.before_id) + 1 : 0;
          return later({ data: sorted.slice(start, start + args.max_rows), error: null });
        }
        const row = rows.find(r => r.id === args.flag_id);
        if (!row) return later({ data: null, error: { code: '22023', message: 'that report was not found' } });
        if (fn === 'admin_mark_flag_handled') {
          rows = rows.map(r => r.id === row.id ? { ...r, status: 'handled', handled_at: r.handled_at ?? '2026-11-02T12:34:56.5+00:00' } : r);
          return later({ data: rows.find(r => r.id === row.id).handled_at, error: null });
        }
        if (fn === 'admin_reopen_flag') {
          rows = rows.map(r => r.id === row.id ? { ...r, status: 'open', handled_at: null } : r);
          return later({ data: null, error: null });
        }
        return later({ data: null, error: { code: 'PGRST202', message: 'unknown function' } });
      };
      const listeners = new Set();
      // The stale-response race test must know that the UI has subscribed before simulating sign-out.
      window.authListenerCount = () => listeners.size;
      window.setFixtureWho = next => {
        who = next;
        // The real Supabase listener emits this after cross-tab sign-out and account changes.
        for (const listener of listeners) {
          listener(next === 'signed-out' ? 'SIGNED_OUT' : 'SIGNED_IN',
            next === 'signed-out' ? null : { user: { id: id(999) } });
        }
      };
      window.fixtureClient = {
        rpc,
        auth: {
          onAuthStateChange: listener => {
            listeners.add(listener);
            return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
          },
          mfa: { getAuthenticatorAssuranceLevel: () => later({
            data: {
              currentLevel: who === 'admin' || who === 'broken' || who === 'capped' || who === 'capped-handled' ? 'aal2' : 'aal1',
              nextLevel: who === 'student' ? 'aal1' : 'aal2',
            },
            error: null,
          }) },
        },
      };
      createRoot(document.getElementById('fixture')).render(<AdminFlags />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-client', setup(builder) {
      builder.onResolve({ filter: /\/supabaseclient(?:\.ts)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export async function getSupabase() { return window.fixtureClient; }
      `, loader: 'js' }));
    } }],
  });
  fixtureCode = result.outputFiles[0]!.text;
});

async function fixture(page: Page, query: string) {
  await page.route('**/__admin-flags-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__admin-flags-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="content-security-policy" content="${fixtureCsp}">
    <title>admin flags component test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main id="main" class="mx-auto max-w-page p-6 font-body leading-relaxed">
    <div id="fixture"></div></main><script src="/__admin-flags-fixture.js"></script></body></html>` }));
  await page.goto(`/__admin-flags-fixture?${query}`);
}
type Call = [string, Record<string, unknown>];
const calls = (page: Page) => page.evaluate(() => (window as unknown as { rpcCalls: Call[] }).rpcCalls);

test.describe('/admin/flags wired to the database functions', () => {
  test('an admin at aal2 lists, marks handled and reopens, with the exact function arguments', async ({ page }) => {
    await fixture(page, 'who=admin');
    const rows = page.getByTestId('admin-flags-row');
    await expect(page.getByRole('heading', { level: 1, name: 'reports' })).toBeVisible();
    await expect(rows).toHaveCount(2);
    await axe(page);

    const target = rows.filter({ hasText: 'something broken' });
    await target.getByRole('button', { name: /^mark handled/ }).click();
    await expect(target.getByRole('button', { name: /^reopen/ })).toBeVisible();
    await expect(target.locator('td:focus')).toHaveCount(1);
    await expect(page.getByRole('status')).toContainText('marked handled: something broken');

    await page.getByRole('radio', { name: 'handled', exact: true }).check();
    await expect(rows).toHaveCount(2);
    const reopened = rows.filter({ hasText: 'something else' });
    await reopened.getByRole('button', { name: /^reopen/ }).click();
    await expect(reopened).toContainText('not handled');
    await expect(page.getByRole('status')).toContainText('reopened: something else');
    await page.getByRole('radio', { name: 'not handled' }).check();
    await expect(rows).toHaveCount(2);
    await axe(page);

    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const list = (status: string) => ['admin_list_flags', { flag_status: status, max_rows: 200, before_created_at: null, before_id: null }];
    expect(await calls(page)).toEqual([
      list('open'),
      ['admin_mark_flag_handled', { flag_id: id(2) }],
      list('handled'),
      ['admin_reopen_flag', { flag_id: id(3) }],
      list('open'),
    ]);
  });

  test('a list cut off at 2,000 reports says so in plain words', async ({ page }) => {
    await fixture(page, 'who=capped');
    await expect(page.getByTestId('admin-flags-capped')).toHaveText(
      'showing the newest 2,000 reports. older ones may be hidden. mark some handled to see more.');
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(2000);
  });

  test('the handled-report cap tells the admin to reopen reports instead of marking them handled', async ({ page }) => {
    await fixture(page, 'who=capped-handled');
    await page.getByRole('radio', { name: 'handled', exact: true }).check();
    await expect(page.getByTestId('admin-flags-capped')).toHaveText(
      'showing the newest 2,000 reports. older ones may be hidden. reopen some handled reports to see more.');
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(2000);
  });

  test('a complete list shows no cap notice', async ({ page }) => {
    await fixture(page, 'who=admin');
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(2);
    await expect(page.getByTestId('admin-flags-capped')).toHaveCount(0);
  });

  test('a sign-out or account switch clears an already loaded private inbox', async ({ page }) => {
    await fixture(page, 'who=admin');
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(2);

    await page.evaluate(() => (window as unknown as { setFixtureWho: (value: string) => void }).setFixtureWho('student'));
    await expect(page.getByRole('heading', { level: 1, name: 'this page is for the site owner.' })).toBeVisible();
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('sample comment one');
  });

  test('a delayed pre-sign-out response cannot restore private rows', async ({ page }) => {
    await fixture(page, 'who=admin&delay=slow');
    await expect.poll(async () => (await calls(page)).length).toBeGreaterThan(0);
    // A sign-out broadcast before the fake listener exists would not test the production race at all.
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { authListenerCount: () => number }).authListenerCount())).toBeGreaterThan(0);
    await page.evaluate(() => (window as unknown as { setFixtureWho: (value: string) => void }).setFixtureWho('signed-out'));

    await expect(page.getByRole('heading', { level: 1, name: 'this page is for the site owner.' })).toBeVisible();
    await expect.poll(async () => page.evaluate(() =>
      (window as unknown as { completedRpcs: number }).completedRpcs)).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('sample comment one');
  });

  test('a student is refused with the one sentence, and stays on the page', async ({ page }) => {
    await fixture(page, 'who=student');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('this page is for the site owner.');
    await expect(page.locator('table, fieldset, a')).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/__admin-flags-fixture/);
    await expect(page.locator('body')).not.toContainText(/42501|two-factor, can do this/);
  });

  test('an admin who has not entered the two-factor code is sent to the code page, and back here after', async ({ page }) => {
    await page.route('**/account/two-factor?*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>code</title>' }));
    await fixture(page, 'who=admin-aal1');
    await expect(page).toHaveURL(/\/account\/two-factor\?next=%2Fadmin%2Fflags$/);
  });

  test('a failure says so without database text, and try again loads the inbox', async ({ page }) => {
    await fixture(page, 'who=broken');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('the reports could not be loaded.');
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
    await page.getByRole('button', { name: 'try again' }).click();
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(2);
  });
});

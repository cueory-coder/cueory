import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Task 145: the exam date in a signed-in student's account. The real setup and progress islands run with built CSS;
// only the shared client module is replaced by an in-page stand-in for exam_plans, so nothing reaches a provider.
// The fixture is intercepted by Playwright, never written into dist or shipped.

/** A local calendar day `days` from now, YYYY-MM-DD. Far enough from today that time zones don't matter. */
const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const SERVER_DATE = daysFromNow(40);
const DEVICE_DATE = daysFromNow(80);
const NEW_DATE = daysFromNow(60);

let fixtureCode: string;
let fixtureCss: string;
test.beforeAll(async () => {
  const html = readFileSync('dist/start.html', 'utf8');
  fixtureCss = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  if (!fixtureCss) throw new Error('The production stylesheet was not found. Run npm run build.');
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import Onboarding from './src/islands/Onboarding.tsx';
      import ProgressPanel from './src/islands/ProgressPanel.tsx';
      const params = new URLSearchParams(location.search);
      const rows = JSON.parse(params.get('rows') ?? '[]');
      const fail = params.get('fail');
      window.planRows = rows;
      window.planCalls = [];
      const log = (call) => window.planCalls.push(call);
      const reply = (value, wait = 50) => new Promise(resolve => setTimeout(() => resolve(value), wait));
      // '&slow=list' holds the account load back long enough for the student to act first.
      const listWait = params.get('slow') === 'list' ? 1500 : 50;
      const refused = { code: '500', message: 'provider-private-detail' };
      window.fixtureClient = {
        from(table) {
          if (table !== 'exam_plans') throw new Error('unexpected table ' + table);
          return {
            select: (columns) => ({ limit: (n) => {
              log('list ' + columns + ' ' + n);
              return reply(fail === 'list' ? { data: null, error: refused } : { data: rows.map(r => ({ ...r })), error: null }, listWait);
            } }),
            update: (patch) => ({ eq: (column, value) => ({ select: () => {
              log('update ' + value + ' ' + patch.exam_date);
              if (fail === 'update') return reply({ data: null, error: refused });
              const hit = rows.filter(r => r[column] === value);
              hit.forEach(r => { r.exam_date = patch.exam_date; });
              return reply({ data: hit.map(r => ({ course: r.course })), error: null });
            } }) }),
            insert: (row) => {
              log('insert ' + row.course + ' ' + row.exam_date);
              rows.push({ ...row });
              return reply({ error: null });
            },
            delete: () => ({ eq: (column, value) => {
              log('delete ' + value);
              // '&fail=delete-once': the first removal fails, as a dropped connection would.
              if (fail === 'delete-once' && !window.deleteFailed) {
                window.deleteFailed = true;
                return reply({ error: refused });
              }
              rows.splice(0, rows.length, ...rows.filter(r => r[column] !== value));
              return reply({ error: null });
            } }),
          };
        },
      };
      const island = params.get('island');
      if (island === 'start') createRoot(document.getElementById('fixture')).render(<Onboarding />);
      if (island === 'progress') createRoot(document.getElementById('fixture')).render(<ProgressPanel decks={[]} />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-client', setup(builder) {
      builder.onResolve({ filter: /\/supabaseclient(?:\.ts)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        const params = new URLSearchParams(location.search);
        export async function getSupabase() {
          return params.get('accounts') === 'off' ? null : window.fixtureClient;
        }
        let checks = 0;
        export async function sessionCheckFrom(client) {
          // '&session=fail-once': the first session check is rejected, as a dropped connection would.
          if (params.get('session') === 'fail-once' && checks++ === 0) throw new Error('session-private-detail');
          if (!client || params.has('signed-out')) return { signedIn: false };
          return { signedIn: true, userId: '00000000-0000-4000-8000-000000000001', email: '' };
        }
      `, loader: 'js' }));
    } }],
  });
  fixtureCode = result.outputFiles[0]!.text;
});

/** Opens the fixture with this device's saved setup answers and the account's rows. */
async function open(page: Page, island: 'start' | 'progress', device: object | null, query = '', rows: object[] = []) {
  await page.route('**/__exam-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__exam-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>exam plan test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main class="mx-auto max-w-prose p-6 font-body leading-relaxed"><h1>exam plan test</h1>
    <div id="fixture"></div></main><script src="/__exam-fixture.js"></script></body></html>` }));
  await page.goto('/__exam-fixture?island=none');
  await page.evaluate((onboarding) => {
    localStorage.clear();
    if (onboarding) localStorage.setItem('cueory-progress', JSON.stringify({ version: 1, onboarding, decks: {} }));
  }, device);
  await page.goto(`/__exam-fixture?island=${island}&rows=${encodeURIComponent(JSON.stringify(rows))}${query}`);
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { planCalls: string[] }).planCalls);
const deviceAnswers = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('cueory-progress') ?? 'null')?.onboarding);
const toExam = async (page: Page) => {
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
};

test.describe('exam date, signed in', () => {
  test("the account's date wins on load, and a changed date is saved to the account", async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: DEVICE_DATE, done: true }, '', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await expect.poll(() => deviceAnswers(page)).toEqual({ course: 'med-surg-1', examDate: SERVER_DATE, done: true });
    await toExam(page);
    await expect(page.getByLabel('when is your exam?')).toHaveValue(SERVER_DATE);

    await page.getByLabel('when is your exam?').fill(NEW_DATE);
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    await expect(page.getByTestId('exam-sync')).toHaveText('your exam date is saved to your account too.');
    expect(await deviceAnswers(page)).toEqual({ course: 'med-surg-1', examDate: NEW_DATE, done: true });
    expect(await calls(page)).toEqual(['list course,exam_date 10', `update med-surg-1 ${NEW_DATE}`]);
    expect(await page.evaluate(() => (window as unknown as { planRows: unknown }).planRows))
      .toEqual([{ course: 'med-surg-1', exam_date: NEW_DATE }]);
  });

  test('a first exam date adds the plan, and clearing it removes the plan', async ({ page }) => {
    await open(page, 'start', null);
    await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
    await toExam(page);
    await page.getByLabel('when is your exam?').fill(NEW_DATE);
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.getByTestId('exam-sync')).toHaveText('your exam date is saved to your account too.');
    expect(await calls(page)).toEqual([
      'list course,exam_date 10', `update fundamentals ${NEW_DATE}`, `insert fundamentals ${NEW_DATE}`,
    ]);

    // Back later: the fixture's account is rebuilt from the page address, so it is opened again with the saved plan.
    await open(page, 'start', { course: 'fundamentals', examDate: NEW_DATE, done: true }, '', [
      { course: 'fundamentals', exam_date: NEW_DATE },
    ]);
    await toExam(page);
    await page.getByRole('button', { name: 'skip', exact: true }).click();
    await expect(page.getByTestId('exam-sync')).toHaveText('your exam date is cleared from your account too.');
    expect((await calls(page)).at(-1)).toBe('delete fundamentals');
  });

  test('a failed save keeps the date on the device and says so in one sentence', async ({ page }) => {
    await open(page, 'start', { course: 'both', examDate: null, done: true }, '&fail=update');
    await toExam(page);
    await page.getByLabel('when is your exam?').fill(NEW_DATE);
    await page.getByRole('button', { name: 'save my answers' }).click();
    const note = page.getByTestId('exam-sync');
    await expect(note).toHaveText('your exam date is saved on this device, but it couldn’t be saved to your account. try again later.');
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
    expect(await deviceAnswers(page)).toEqual({ course: 'both', examDate: NEW_DATE, done: true });
  });

  test("the progress page shows the account's date and says it is saved to the account", async ({ page }) => {
    await open(page, 'progress', { course: 'med-surg-1', examDate: DEVICE_DATE, done: true }, '', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    const words = await page.evaluate(async (day) => {
      const [y, m, d] = day.split('-').map(Number) as [number, number, number];
      return `${new Date(y, m - 1, d).toLocaleString('en-US', { month: 'long' }).toLowerCase()} ${d}, ${y}`;
    }, SERVER_DATE);
    await expect(page.getByText(`exam: ${words}`)).toBeVisible();
    await expect(page.getByText('an exam date you set is also saved to your account.')).toBeVisible();
    expect(await deviceAnswers(page)).toEqual({ course: 'med-surg-1', examDate: SERVER_DATE, done: true });
  });

  test('forgetting while the account load is on its way stays forgotten (Codex on #232)', async ({ page }) => {
    await open(page, 'progress', { course: 'med-surg-1', examDate: DEVICE_DATE, done: true }, '&slow=list', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await page.getByRole('button', { name: 'forget my progress on this device' }).click();
    await page.getByRole('button', { name: 'yes, forget it' }).click();
    await expect(page.getByText('done. your progress is no longer saved on this device.')).toBeVisible();
    await expect.poll(() => calls(page)).toEqual(['list course,exam_date 10']);
    await page.waitForTimeout(1800);
    expect(await deviceAnswers(page)).toBeUndefined();
    await expect(page.getByText('you haven’t answered them yet.')).toBeVisible();
    await expect(page.getByText('exam:')).toHaveCount(0);
  });

  test('a course skipped before the account load finishes stays skipped (Codex on #232)', async ({ page }) => {
    await open(page, 'start', null, '&slow=list', [{ course: 'med-surg-1', exam_date: SERVER_DATE }]);
    await page.getByRole('button', { name: 'skip', exact: true }).click();
    await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
    await expect.poll(() => calls(page), { timeout: 5000 }).toEqual(['list course,exam_date 10']);
    await page.waitForTimeout(1800);
    // No course, so there is no course to take an account date from: the date stays blank.
    await expect(page.getByLabel('when is your exam?')).toHaveValue('');
    await page.getByRole('button', { name: 'back' }).click();
    await expect(page.getByRole('radio', { name: 'not sure yet' })).toBeChecked();
    await page.getByRole('button', { name: 'continue', exact: true }).click();
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.locator(':focus')).toContainText('no course picked.');
    expect(await deviceAnswers(page)).toEqual({ course: null, examDate: null, done: true });
    expect(await calls(page)).toEqual(['list course,exam_date 10']);
  });

  test('skipping the date before the account load lands clears the account plan, and /progress keeps it cleared (Codex on #232)', async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: null, done: true }, '&slow=list', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await toExam(page);
    await page.getByRole('button', { name: 'skip', exact: true }).click();
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    await expect(page.getByTestId('exam-sync')).toHaveText('your exam date is cleared from your account too.', { timeout: 5000 });
    expect(await calls(page)).toEqual(['list course,exam_date 10', 'delete med-surg-1']);
    expect(await page.evaluate(() => (window as unknown as { planRows: unknown[] }).planRows)).toEqual([]);
    expect(await deviceAnswers(page)).toEqual({ course: 'med-surg-1', examDate: null, done: true });

    // The account no longer has the date, so the progress page can't bring it back.
    await open(page, 'progress', { course: 'med-surg-1', examDate: null, done: true });
    await expect(page.getByText('course: med-surg i')).toBeVisible();
    await expect(page.getByText('exam: no date')).toBeVisible();
    expect(await deviceAnswers(page)).toEqual({ course: 'med-surg-1', examDate: null, done: true });
  });

  test("a course picked while the account loads gets that course's account date, never the saved course's (Codex on #232)", async ({ page }) => {
    const FUNDAMENTALS_DATE = daysFromNow(100);
    await open(page, 'start', { course: 'med-surg-1', examDate: null, done: true }, '&slow=list', [
      { course: 'med-surg-1', exam_date: SERVER_DATE }, { course: 'fundamentals', exam_date: FUNDAMENTALS_DATE },
    ]);
    await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
    await toExam(page);
    await expect(page.getByLabel('when is your exam?')).toHaveValue(FUNDAMENTALS_DATE, { timeout: 5000 });
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    expect(await deviceAnswers(page)).toEqual({ course: 'fundamentals', examDate: FUNDAMENTALS_DATE, done: true });
    // The account already has that date for fundamentals: nothing to send, and med-surg's date is never copied over.
    await page.waitForTimeout(300);
    expect(await calls(page)).toEqual(['list course,exam_date 10']);
    expect(await page.evaluate(() => (window as unknown as { planRows: unknown }).planRows)).toEqual([
      { course: 'med-surg-1', exam_date: SERVER_DATE }, { course: 'fundamentals', exam_date: FUNDAMENTALS_DATE },
    ]);
  });

  test('a course picked while the account loads, with no plan for it, does not take the saved course\'s date (Codex on #232)', async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: null, done: true }, '&slow=list', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
    await toExam(page);
    await expect.poll(() => calls(page), { timeout: 5000 }).toEqual(['list course,exam_date 10']);
    await page.waitForTimeout(1800);
    await expect(page.getByLabel('when is your exam?')).toHaveValue('');
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.locator(':focus')).toContainText('no exam date.');
    await page.waitForTimeout(300);
    expect(await calls(page)).toEqual(['list course,exam_date 10']);
    expect(await deviceAnswers(page)).toEqual({ course: 'fundamentals', examDate: null, done: true });
  });

  test('saving before the account load lands fills an untouched date afterwards and sends nothing (Codex on #232)', async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: null, done: true }, '&slow=list', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await toExam(page);
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    await expect.poll(() => deviceAnswers(page), { timeout: 5000 }).toEqual({ course: 'med-surg-1', examDate: SERVER_DATE, done: true });
    const words = await page.evaluate(async (day) => {
      const [y, m, d] = day.split('-').map(Number) as [number, number, number];
      return `${new Date(y, m - 1, d).toLocaleString('en-US', { month: 'long' }).toLowerCase()} ${d}, ${y}`;
    }, SERVER_DATE);
    await expect(page.getByText(`exam: ${words}.`)).toBeVisible();
    expect(await calls(page)).toEqual(['list course,exam_date 10']);
  });

  test('an account date clears when the course changes, after the load, to one with no plan (Codex on #232)', async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: null, done: true }, '', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await expect.poll(() => deviceAnswers(page)).toEqual({ course: 'med-surg-1', examDate: SERVER_DATE, done: true });
    await toExam(page);
    await expect(page.getByLabel('when is your exam?')).toHaveValue(SERVER_DATE);
    await page.getByRole('button', { name: 'back' }).click();
    await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
    await toExam(page);
    await expect(page.getByLabel('when is your exam?')).toHaveValue('');
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.locator(':focus')).toContainText('no exam date.');
    await expect(page.getByRole('link', { name: 'see what’s saved on this device' })).toBeVisible();
    expect(await calls(page)).toEqual(['list course,exam_date 10']);
    expect(await deviceAnswers(page)).toEqual({ course: 'fundamentals', examDate: null, done: true });
  });

  test('the result links wait until the account has the change, so leaving early cannot undo it (Codex on #232)', async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: null, done: true }, '&slow=list', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await toExam(page);
    await page.getByRole('button', { name: 'skip', exact: true }).click();
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    await expect(page.locator(':focus')).toContainText('saving to your account…');
    await expect(page.getByRole('link', { name: 'see what’s saved on this device' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'start studying' })).toHaveCount(0);
    // The plans are still on their way, so the removal hasn't been sent yet.
    expect(await calls(page)).toEqual(['list course,exam_date 10']);

    await expect(page.getByTestId('exam-sync')).toHaveText('your exam date is cleared from your account too.', { timeout: 5000 });
    await expect(page.getByTestId('exam-sync-pending')).toHaveCount(0);
    expect(await calls(page)).toEqual(['list course,exam_date 10', 'delete med-surg-1']);
    await expect(page.getByRole('link', { name: 'see what’s saved on this device' })).toBeVisible();
  });

  test('a failed account save says so, offers a retry, and the retry sends it (Codex on #232)', async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: SERVER_DATE, done: true }, '&fail=delete-once', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await toExam(page);
    await page.getByRole('button', { name: 'skip', exact: true }).click();
    const note = page.getByTestId('exam-sync');
    await expect(note).toHaveText('your exam date is cleared on this device, but it couldn’t be cleared from your account. try again later.');
    await expect(page.locator('body')).not.toContainText('provider-private-detail');
    await expect(page.getByRole('link', { name: 'see what’s saved on this device' })).toBeVisible();
    const retry = page.getByRole('button', { name: 'try saving again' });
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(note).toHaveText('your exam date is cleared from your account too.');
    await expect(retry).toHaveCount(0);
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    expect(await calls(page)).toEqual(['list course,exam_date 10', 'delete med-surg-1', 'delete med-surg-1']);
  });

  test('a failed session check never claims the date reached the account, and the retry sends it', async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: SERVER_DATE, done: true }, '&session=fail-once', [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await toExam(page);
    await page.getByRole('button', { name: 'skip', exact: true }).click();
    const note = page.getByTestId('exam-sync');
    await expect(note).toContainText('hasn’t been saved to your account');
    await expect(page.locator('body')).not.toContainText('session-private-detail');
    await expect(page.locator('body')).not.toContainText('saved to your account too');
    await expect(page.getByRole('link', { name: 'start studying' })).toBeVisible();
    expect(await deviceAnswers(page)).toMatchObject({ course: 'med-surg-1', examDate: null });
    const retry = page.getByRole('button', { name: 'try saving again' });
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(note).toHaveText('your exam date is cleared from your account too.');
    await expect(retry).toHaveCount(0);
  });

  test('a failed load leaves the device date and says so', async ({ page }) => {
    await open(page, 'progress', { course: 'med-surg-1', examDate: DEVICE_DATE, done: true }, '&fail=list');
    await expect(page.getByTestId('exam-sync'))
      .toHaveText('your account’s exam date couldn’t be loaded, so this shows what’s saved on this device.');
    expect(await deviceAnswers(page)).toEqual({ course: 'med-surg-1', examDate: DEVICE_DATE, done: true });
  });
});

for (const [name, query] of [['signed out', '&signed-out'], ['accounts off', '&accounts=off']] as const) {
  test(`exam date, ${name}: it stays on the device and nothing is sent`, async ({ page }) => {
    await open(page, 'start', { course: 'med-surg-1', examDate: DEVICE_DATE, done: true }, query, [
      { course: 'med-surg-1', exam_date: SERVER_DATE },
    ]);
    await toExam(page);
    await expect(page.getByLabel('when is your exam?')).toHaveValue(DEVICE_DATE);
    await page.getByLabel('when is your exam?').fill(NEW_DATE);
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    await expect(page.getByTestId('exam-sync')).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
    expect(await deviceAnswers(page)).toEqual({ course: 'med-surg-1', examDate: NEW_DATE, done: true });

    await open(page, 'progress', { course: 'med-surg-1', examDate: DEVICE_DATE, done: true }, query);
    await expect(page.getByText('all of this is saved in this browser only. cueory never receives it.')).toBeVisible();
    expect(await calls(page)).toEqual([]);
  });
}

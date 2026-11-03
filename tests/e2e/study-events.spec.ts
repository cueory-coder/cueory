import { expect, test, type Page, type Request } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Task 147: the real-questions player sends study events through the shared Supabase client.
// Browser-only fixture: it is intercepted by Playwright, never written into dist or shipped. It bundles the real
// player, the real shared client and the real supabase-js package. The project address is this test server itself
// (a local address is allowed for local Supabase), so every Supabase request is answered by page.route below and
// nothing reaches a real project. The session in local storage is invented and has never been valid anywhere.
const ITEM_1 = '00000000-0000-4000-8000-000000000101';
const VERSION_1 = '00000000-0000-4000-8000-000000000201';
const ITEM_2 = '00000000-0000-4000-8000-000000000102';
const VERSION_2 = '00000000-0000-4000-8000-000000000202';
const USER = '00000000-0000-4000-8000-0000000000aa';
const FAKE_ACCESS = 'fixture-access-token-not-real';
const FAKE_KEY = 'sb_publishable_example_not_a_real_key';

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
      import QuestionsPlayer from './src/islands/QuestionsPlayer.tsx';
      import { getSupabase } from './src/islands/supabaseclient.ts';
      import { sampleChecker } from './src/islands/questions.ts';
      const mode = new URLSearchParams(location.search).get('mode');
      const questions = [
        { id: '${ITEM_1}', type: 'single', stem: 'sample: choose a shape.',
          choices: [{ id: 'a', text: 'sample circle' }, { id: 'b', text: 'sample square' }] },
        { id: '${ITEM_2}', type: 'sata', stem: 'sample: choose the colors.',
          choices: [{ id: 'a', text: 'sample red' }, { id: 'b', text: 'sample stone' }, { id: 'c', text: 'sample blue' }] },
      ];
      const root = createRoot(document.getElementById('fixture'));
      if (mode === 'sample') {
        const items = questions.map((question, index) => ({ ...question, id: 'sample-' + index, status: 'sample', key: ['a'],
          rationales: Object.fromEntries(question.choices.map(choice => [choice.id, 'sample feedback ' + choice.id])) }));
        root.render(<QuestionsPlayer questions={items.map(({ id, type, stem, choices }) => ({ id, type, stem, choices }))}
          check={sampleChecker(items)} />);
      } else {
        getSupabase().then(client => root.render(<QuestionsPlayer questions={questions} remote={{
          signedIn: mode !== 'signed-out', transport: client,
          versions: [{ item_id: '${ITEM_1}', id: '${VERSION_1}' }, { item_id: '${ITEM_2}', id: '${VERSION_2}' }],
        }} />));
      }
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.PUBLIC_SUPABASE_URL': 'location.origin',
      'import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(FAKE_KEY),
    },
  });
  fixtureCode = result.outputFiles[0]!.text;
});

interface Rpc { name: string; body: unknown; headers: Record<string, string> }

async function fixture(page: Page, mode: 'signed-in' | 'signed-out' | 'sample') {
  const rpcs: Rpc[] = [];
  const supabase: string[] = [];
  page.on('request', (request: Request) => {
    if (/\/(rest|auth)\/v1\//.test(new URL(request.url()).pathname)) supabase.push(request.url());
  });
  if (mode === 'signed-in') {
    await page.addInitScript(({ user, token }) => {
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem('cueory-auth', JSON.stringify({
        access_token: token, refresh_token: 'fixture-refresh-not-real', token_type: 'bearer',
        expires_in: 3600, expires_at: now + 3600,
        user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'student@example.test',
          app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' },
      }));
    }, { user: USER, token: FAKE_ACCESS });
  }
  await page.route('**/rest/v1/rpc/*', async route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split('/').at(-1)!;
    rpcs.push({ name, body: request.postDataJSON(), headers: request.headers() });
    if (name === 'check_answer') {
      const args = request.postDataJSON() as { version_id: string };
      const letters = args.version_id === VERSION_1 ? ['a', 'b'] : ['a', 'b', 'c'];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        correct: true, key: ['a'], version_id: args.version_id,
        rationales: Object.fromEntries(letters.map(letter => [letter, `sample feedback ${letter}`])),
      }) });
    }
    const events = (request.postDataJSON() as { events: unknown[] }).events;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(events.length) });
  });
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 500, body: '{}' }));
  await page.route('**/__study-events-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__study-events-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>study events test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main class="mx-auto max-w-110 p-6 font-body leading-relaxed"><h1>study events test</h1>
    <div id="fixture"></div></main><script src="/__study-events-fixture.js"></script></body></html>` }));
  await page.goto(`/__study-events-fixture?mode=${mode}`);
  return { rpcs, supabase };
}

/** The tab is hidden, as when the student switches away: the player sends what is waiting. */
const hideTab = (page: Page) => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});

async function answerBoth(page: Page) {
  await page.getByLabel('sample circle').check();
  await page.getByRole('button', { name: 'check', exact: true }).click();
  await expect(page.getByText('right.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'next question' }).click();
  await page.getByLabel('sample red').check();
  await page.getByRole('button', { name: 'check', exact: true }).click();
  await expect(page.getByRole('button', { name: 'next question' })).toBeVisible();
}

test('a signed-in student sends one batch of answered events, with only ids, times and no answer data', async ({ page }) => {
  const { rpcs } = await fixture(page, 'signed-in');
  await expect(page.getByText('question 1 of 2')).toBeVisible();
  await page.waitForTimeout(600); // time on screen before the first check
  await answerBoth(page);
  expect(rpcs.map(rpc => rpc.name)).toEqual(['check_answer', 'check_answer']);
  await hideTab(page);
  await expect.poll(() => rpcs.map(rpc => rpc.name)).toEqual(['check_answer', 'check_answer', 'record_study_events']);

  const sent = rpcs[2]!;
  // Through the shared client: the publishable key and the student's own sign-in.
  expect(sent.headers['apikey']).toBe(FAKE_KEY);
  expect(sent.headers['authorization']).toBe(`Bearer ${FAKE_ACCESS}`);
  expect(Object.keys(sent.body as object)).toEqual(['events']);
  const events = (sent.body as { events: Record<string, unknown>[] }).events;
  expect(events).toHaveLength(2);
  expect(events.map(event => [event.item_id, event.version_id, event.kind]))
    .toEqual([[ITEM_1, VERSION_1, 'answered'], [ITEM_2, VERSION_2, 'answered']]);
  for (const event of events) {
    expect(Object.keys(event).sort()).toEqual(['at', 'item_id', 'kind', 'ms_on_item', 'version_id']);
    expect(Number.isInteger(event.ms_on_item) && (event.ms_on_item as number) >= 0 &&
      (event.ms_on_item as number) <= 1_800_000).toBe(true);
    expect(event.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(Math.abs(Date.parse(event.at as string) - Date.now())).toBeLessThan(5 * 60_000);
  }
  expect(events[0]!.ms_on_item as number).toBeGreaterThanOrEqual(500);
  expect(JSON.stringify(sent.body)).not.toMatch(/picked|choice|correct|rationale|stem|sample|key/);

  // Nothing is sent twice.
  await hideTab(page);
  await page.waitForTimeout(300);
  expect(rpcs.filter(rpc => rpc.name === 'record_study_events')).toHaveLength(1);
});

for (const mode of ['signed-out', 'sample'] as const) test(`${mode} questions send no study events`, async ({ page }) => {
  const { rpcs, supabase } = await fixture(page, mode);
  if (mode === 'signed-out') {
    await expect(page.getByText('a free account is needed for real questions.')).toBeVisible();
  } else {
    await answerBoth(page);
  }
  await hideTab(page);
  await page.waitForTimeout(300);
  expect(rpcs).toEqual([]);
  expect(supabase).toEqual([]);
});

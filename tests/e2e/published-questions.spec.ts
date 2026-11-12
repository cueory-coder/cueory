import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

/**
 * Task 172: the real questions page (/learn/questions?concept=<slug>).
 *
 * The built site has accounts off, so the page itself is checked for its closed state. The signed-in path runs the
 * real island, the real shared client module and the real supabase-js package in a fixture page that Playwright
 * serves (never written into dist). The project address is a fake one, the key is a labeled fake publishable key, the
 * session is a fake one in local storage, and every request to the project is answered by the routes below.
 * Questions are invented, labeled samples: no question-bank data, keys or rationales.
 */
const PROJECT = 'https://abcdefghijklmnopqrst.supabase.co';
const FAKE_KEY = 'sb_publishable_example_not_a_real_key';
const FAKE_TOKEN = 'fixture-access-token-not-real';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const concept = { id: uuid(1), slug: 'sample-concept', title: 'sample concept (fixture)', published: true };
const items = [{ id: uuid(11), concept_id: uuid(1), type: 'single' }, { id: uuid(12), concept_id: uuid(1), type: 'sata' }];
const versions = [
  { id: uuid(21), item_id: uuid(11), version: 1, stem: 'sample: which of these is a shape?', status: 'published' },
  { id: uuid(22), item_id: uuid(12), version: 3, stem: 'sample: pick every color.', status: 'published' },
];
const choices = [
  { item_version_id: uuid(21), choice_id: 'a', text: 'sample circle' },
  { item_version_id: uuid(21), choice_id: 'b', text: 'sample tuesday' },
  { item_version_id: uuid(22), choice_id: 'a', text: 'sample red' },
  { item_version_id: uuid(22), choice_id: 'b', text: 'sample seven' },
  { item_version_id: uuid(22), choice_id: 'c', text: 'sample blue' },
];
// Only the mocked check_answer reply carries feedback, as the real function does after an attempt.
const feedback = { correct: true, key: ['a'], rationales: { a: 'sample rationale: a circle is a shape.', b: 'sample rationale: tuesday is a day.' }, version_id: uuid(21) };

let fixtureCode: string;
let fixtureCss: string;
test.beforeAll(async () => {
  const html = readFileSync('dist/learn/questions.html', 'utf8');
  fixtureCss = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1] ?? '';
  if (!fixtureCss) throw new Error('The production stylesheet was not found. Run npm run build.');
  const result = await build({
    stdin: { contents: `
      import React, { useEffect, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import PublishedQuestions from './src/islands/PublishedQuestions.tsx';
      import FlagMount from './src/islands/FlagMount.tsx';
      import { onFlagItem } from './src/islands/flagitem.ts';
      function FlagProbe() {
        const [item, setItem] = useState('none');
        useEffect(() => onFlagItem(next => setItem(next ? next.itemId + ' ' + next.itemVersionId : 'none')), []);
        return <p data-testid="flag-probe">{item}</p>;
      }
      createRoot(document.getElementById('fixture')).render(<><PublishedQuestions /><FlagProbe />{new URLSearchParams(location.search).has('flag') && <div className="mt-section pt-section"><div className="mt-section pt-section"><FlagMount page="/learn/questions" variant="icon" /></div></div>}</>);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.PUBLIC_SUPABASE_URL': JSON.stringify(PROJECT),
      'import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(FAKE_KEY),
    },
  });
  fixtureCode = result.outputFiles[0]!.text;
});

interface Seen { method: string; path: string; query: URLSearchParams; auth: string | null; body: unknown }

/** Answers the fake project's REST and RPC calls the way the website's grants and policies would. */
async function mockProject(page: Page, options: { checkReply?: unknown; empty?: boolean; failConceptReads?: number } = {}) {
  let failuresLeft = options.failConceptReads ?? 0;
  const seen: Seen[] = [];
  const rows: Record<string, Record<string, unknown>[]> = { concepts: [concept], items: options.empty ? [] : items, item_versions: versions, item_choices: choices };
  await page.route(`${PROJECT}/**`, async (route) => {
    const request: Request = route.request();
    const url = new URL(request.url());
    const body = request.postData() ? JSON.parse(request.postData()!) : undefined;
    seen.push({ method: request.method(), path: url.pathname, query: url.searchParams, auth: request.headers()['authorization'] ?? null, body });
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/rest/v1/rpc/submit_flag' && request.method() === 'POST') {
      return route.fulfill({ status: 200, headers, body: JSON.stringify(uuid(99)) });
    }
    if (url.pathname === '/rest/v1/rpc/check_answer' && request.method() === 'POST') {
      return route.fulfill({ status: 200, headers, body: JSON.stringify(options.checkReply ?? feedback) });
    }
    const table = /^\/rest\/v1\/(\w+)$/.exec(url.pathname)?.[1];
    if (request.method() === 'GET' && table && table in rows) {
      if (table === 'concepts' && failuresLeft > 0) {
        failuresLeft--;
        return route.fulfill({ status: 503, headers, body: JSON.stringify({ message: 'sample private server detail' }) });
      }
      const columns = (url.searchParams.get('select') ?? '').split(',');
      // PostgREST filters as supabase-js sends them: column=eq.value and column=in.(a,b).
      const filters = [...url.searchParams].filter(([name]) => !['select', 'order', 'offset', 'limit'].includes(name));
      const match = (row: Record<string, unknown>) => filters.every(([column, filter]) => {
        const value = String(row[column]);
        if (filter.startsWith('eq.')) return value === filter.slice(3);
        if (filter.startsWith('in.(') && filter.endsWith(')')) return filter.slice(4, -1).split(',').includes(value);
        return false;
      });
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      const data = rows[table]!.filter(match).slice(offset, offset + limit)
        .map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
      return route.fulfill({ status: 200, headers, body: JSON.stringify(data) });
    }
    return route.fulfill({ status: 404, headers, body: JSON.stringify({ message: 'not mocked' }) });
  });
  return seen;
}

async function openFixture(page: Page, options: { signedIn: boolean; search?: string }) {
  await page.route('**/__questions-fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixtureCode }));
  await page.route('**/__questions-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>questions component test</title><link rel="stylesheet" href="${fixtureCss}"></head>
    <body><main class="mx-auto max-w-prose p-6 font-body leading-relaxed"><h1>questions component test</h1>
    <div id="fixture"></div></main><script src="/__questions-fixture.js"></script></body></html>` }));
  if (options.signedIn) {
    // A fake session in the shared client's storage key (supabaseclient.ts AUTH_STORAGE_KEY). Not a real token.
    const session = {
      access_token: FAKE_TOKEN, refresh_token: 'fixture-refresh-token-not-real', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: uuid(42), aud: 'authenticated', role: 'authenticated', email: 'student@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' },
    };
    await page.addInitScript(value => localStorage.setItem('cueory-auth', value), JSON.stringify(session));
  }
  await page.goto(`/__questions-fixture${options.search ?? '?concept=sample-concept'}`);
}

test.describe('Task 172: real questions page as built (accounts off)', () => {
  test('says real questions open soon, stays out of search, and calls no project', async ({ page }) => {
    const remote: string[] = [];
    page.on('request', request => { if (/supabase/.test(new URL(request.url()).hostname)) remote.push(request.url()); });
    await page.goto('/learn/questions?concept=sample-concept');
    await expect(page.getByRole('heading', { level: 1, name: 'questions', exact: true })).toBeVisible();
    await expect(page.getByTestId('questions-closed')).toHaveText('real questions open soon.');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map(result => `${result.id}: ${result.help}`)).toEqual([]);
    expect(remote).toEqual([]);
  });
});

test.describe('Task 172: real questions with a fake project', () => {
  test('signed in: loads a fake concept and checks an answer only through check_answer', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const seen = await mockProject(page);
    await openFixture(page, { signedIn: true });

    await expect(page.getByTestId('questions-concept')).toHaveText('sample concept (fixture)');
    await expect(page.getByText('question 1 of 2')).toBeVisible();
    await expect(page.getByTestId('flag-probe')).toHaveText(`${uuid(11)} ${uuid(21)}`);

    // Reads: only the four public tables, only granted columns, nothing about answers, all signed in.
    const reads = seen.filter(request => request.method === 'GET');
    expect(reads.map(request => request.path)).toEqual([
      '/rest/v1/concepts', '/rest/v1/items', '/rest/v1/item_versions', '/rest/v1/item_choices',
    ]);
    expect(reads.map(request => request.query.get('select'))).toEqual([
      'id,slug,title', 'id,type', 'id,item_id,version,stem,status', 'item_version_id,choice_id,text',
    ]);
    expect(reads[0]!.query.get('slug')).toBe('eq.sample-concept');
    expect(reads[2]!.query.get('status')).toBe('eq.published');
    for (const request of reads) {
      expect(request.query.get('offset')).toBe('0');
      expect(request.query.get('limit')).toBe(request.path === '/rest/v1/concepts' ? '2' : '100');
      expect(request.auth).toBe(`Bearer ${FAKE_TOKEN}`);
    }
    expect(seen.some(request => /item_answers|rationale|is_correct/.test(request.path + request.query.toString()))).toBe(false);
    expect(seen.filter(request => request.path.includes('/rpc/'))).toEqual([]);

    await page.getByLabel('sample circle').check();
    await page.getByRole('button', { name: 'check', exact: true }).click();
    await expect(page.getByText('right.', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('sample rationale: a circle is a shape.')).toBeVisible();
    await expect(page.getByText("you picked this, and it's right")).toBeVisible();

    const checks = seen.filter(request => request.path === '/rest/v1/rpc/check_answer');
    expect(checks).toHaveLength(1);
    expect(checks[0]!.method).toBe('POST');
    expect(checks[0]!.body).toEqual({ item_id: uuid(11), version_id: uuid(21), picked: ['a'] });
    expect(checks[0]!.auth).toBe(`Bearer ${FAKE_TOKEN}`);

    await page.getByRole('button', { name: 'next question' }).click();
    await expect(page.getByText('question 2 of 2')).toBeVisible();
    await expect(page.getByText('select all that apply')).toBeVisible();
    await expect(page.getByTestId('flag-probe')).toHaveText(`${uuid(12)} ${uuid(22)}`);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map(result => `${result.id}: ${result.help}`)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a malformed check_answer reply shows a calm retry message, never feedback', async ({ page }) => {
    await mockProject(page, { checkReply: { correct: true, key: ['a'], rationales: {}, version_id: uuid(21) } });
    await openFixture(page, { signedIn: true });
    await page.getByLabel('sample circle').check();
    await page.getByRole('button', { name: 'check', exact: true }).click();
    // rpcerrors.ts: a reply without every key's rationale is refused and shown as one calm sentence.
    await expect(page.getByText('something went wrong — please try again.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'check', exact: true })).toBeVisible();
    await expect(page.getByText('right.', { exact: true })).toHaveCount(0);
  });

  test('signed out: one sentence with sign-up and sign-in links, and no question is read', async ({ page }) => {
    const seen = await mockProject(page);
    await openFixture(page, { signedIn: false });
    const sentence = page.getByTestId('questions-signed-out');
    await expect(sentence).toHaveText('sign in to answer real questions, or create a free account.');
    const next = encodeURIComponent('/__questions-fixture?concept=sample-concept');
    await expect(sentence.getByRole('link', { name: 'create a free account' })).toHaveAttribute('href', `/signup?next=${next}`);
    await expect(sentence.getByRole('link', { name: 'sign in' })).toHaveAttribute('href', `/signin?next=${next}`);
    expect(seen.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
    const linkHeights = await sentence.getByRole('link').evaluateAll(links =>
      links.map(link => link.getBoundingClientRect().height));
    expect(linkHeights.every(height => height >= 44)).toBe(true);
    await expect(page.getByTestId('flag-probe')).toHaveText('none');
  });

  test('an unknown concept says so, without asking for its items', async ({ page }) => {
    const seen = await mockProject(page);
    await openFixture(page, { signedIn: true, search: '?concept=sample-missing' });
    await expect(page.getByTestId('questions-not-found')).toContainText('there are no published questions for this topic yet.');
    expect(seen.filter(request => request.path.startsWith('/rest/')).map(request => request.path)).toEqual(['/rest/v1/concepts']);
  });
});

test.describe('W20: clear question loading, empty, and retry states', () => {
  test('announces loading until the concept request finishes', async ({ page }) => {
    await mockProject(page);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/rest\/v1\/concepts(?:\?|$)/, async route => {
      await gate;
      await route.fallback();
    });
    try {
      await openFixture(page, { signedIn: true });
      await expect(page.getByTestId('questions-loading')).toHaveText('loading questions…');
      await expect(page.getByTestId('questions-loading')).toHaveAttribute('role', 'status');
    } finally {
      release();
    }
    await expect(page.getByTestId('questions-concept')).toHaveText('sample concept (fixture)');
    await expect(page.getByTestId('questions-loading')).toHaveCount(0);
  });

  test('explains when there are no published questions and never renders a player', async ({ page }) => {
    const seen = await mockProject(page, { empty: true });
    await openFixture(page, { signedIn: true });
    const empty = page.getByTestId('questions-not-found');
    await expect(empty).toContainText('there are no published questions for this topic yet.');
    await expect(empty).toHaveAttribute('role', 'status');
    await expect(empty.getByRole('link', { name: 'back to the course library' })).toHaveAttribute('href', '/learn');
    await expect(page.locator('fieldset')).toHaveCount(0);
    expect(seen.filter(request => request.method === 'GET').map(request => request.path))
      .toEqual(['/rest/v1/concepts', '/rest/v1/items']);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map(result => result.id + ': ' + result.help)).toEqual([]);
  });

  test('keeps failure details private; keyboard and pointer retries recover', async ({ page }) => {
    const seen = await mockProject(page, { failConceptReads: 2 });
    // Hold the first retry open so keyboard focus can be verified while loading.
    let conceptReads = 0;
    let releaseRetry!: () => void;
    const gate = new Promise<void>(resolve => { releaseRetry = resolve; });
    await page.route(/\/rest\/v1\/concepts(?:\?|$)/, async route => {
      conceptReads++;
      if (conceptReads === 2) await gate;
      await route.fallback();
    });
    await openFixture(page, { signedIn: true });
    await expect(page.getByRole('alert')).toHaveText("couldn't load questions. please try again.");
    await expect(page.getByText('sample private server detail')).toHaveCount(0);
    const retry = page.getByRole('button', { name: 'try again', exact: true });
    await expect(retry).toBeVisible();
    expect(await retry.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map(result => result.id + ': ' + result.help)).toEqual([]);

    await page.keyboard.press('Tab');
    await expect(retry).toBeFocused();
    await expect(retry).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    try {
      await expect(page.getByTestId('questions-retry-loading')).toHaveText('loading questions…');
      await expect(retry).toHaveAttribute('aria-disabled', 'true');
      await expect(retry).toBeFocused();
      await expect(page.getByRole('alert')).toHaveCount(0);
      // A repeated keyboard activation while busy must not send a second retry.
      await expect.poll(() => conceptReads).toBe(2);
      await page.keyboard.press('Enter');
      expect(conceptReads).toBe(2);
    } finally {
      releaseRetry();
    }
    await expect(page.getByRole('alert')).toHaveText("couldn't load questions. please try again.");
    await expect(retry).toHaveAttribute('aria-disabled', 'false');
    await expect(retry).toBeFocused();
    await retry.click();
    const conceptResult = page.getByTestId('questions-concept');
    await expect(conceptResult).toHaveText('sample concept (fixture)');
    await expect(conceptResult).toBeFocused();
    expect(seen.filter(request => request.method === 'GET' && request.path === '/rest/v1/concepts')).toHaveLength(3);
  });


  test('failed load can recover to an empty state and moves focus to the next guidance', async ({ page }) => {
    const seen = await mockProject(page, { empty: true, failConceptReads: 1 });
    await openFixture(page, { signedIn: true });
    await expect(page.getByRole('alert')).toHaveText("couldn't load questions. please try again.");
    await page.getByRole('button', { name: 'try again' }).click();
    const empty = page.getByTestId('questions-not-found');
    await expect(empty).toContainText('there are no published questions for this topic yet.');
    await expect(empty).toBeFocused();
    const back = empty.getByRole('link', { name: 'back to the course library' });
    await expect(back).toHaveAttribute('href', '/learn');
    expect(await back.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await back.focus();
    await expect(back).toHaveCSS('outline-style', 'solid');
    expect(seen.filter(request => request.path === '/rest/v1/concepts')).toHaveLength(2);
    await expect(page.locator('fieldset')).toHaveCount(0);
  });

  test('an invalid concept slug is empty without requesting any public question data', async ({ page }) => {
    const seen = await mockProject(page);
    await openFixture(page, { signedIn: true, search: '?concept=bad%20slug' });
    await expect(page.getByTestId('questions-not-found'))
      .toContainText('there are no published questions for this topic yet.');
    expect(seen.filter(request => request.path.startsWith('/rest/v1/'))).toEqual([]);
  });

  test('fits phone, tablet, and desktop in Light and Evening, with reduced motion and axe', async ({ page }) => {
    await mockProject(page);
    await openFixture(page, { signedIn: true });
    await expect(page.getByText('question 1 of 2')).toBeVisible();
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const paletteColors = new Set<string>();
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        // Test the actual Cueory theme tokens, not only a device preference change.
        await page.evaluate(mode => { document.documentElement.dataset.theme = mode; }, colorScheme);
        const pageColor = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim());
        expect(pageColor.length).toBeGreaterThan(0);
        paletteColors.add(pageColor);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expect(page.getByText('question 1 of 2')).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(results.violations.map(result => result.id + ': ' + result.help)).toEqual([]);
      }
      expect(paletteColors.size).toBe(2);
    }
  });
});

test.describe('Task 172: the real flag form on the real questions page', () => {
  test('reports carry the question being shown, and none after the last one', async ({ page }) => {
    const seen = await mockProject(page);
    await openFixture(page, { signedIn: true, search: '?concept=sample-concept&flag=1' });
    await expect(page.getByText('question 1 of 2')).toBeVisible();

    const send = async (words: string) => {
      await page.getByRole('button', { name: 'flag or comment', exact: true }).click();
      await page.getByRole('radio', { name: 'something confusing' }).check();
      await page.getByLabel('anything to add? (optional)').fill(words);
      await page.getByRole('button', { name: 'send', exact: true }).click();
      await expect(page.getByTestId('flag-result')).toHaveText('thank you. your report is in.');
    };
    const flags = () => seen.filter(request => request.path === '/rest/v1/rpc/submit_flag').map(request => request.body);

    await send('first question');
    await page.getByLabel('sample circle').check();
    await page.getByRole('button', { name: 'check', exact: true }).click();
    await page.getByRole('button', { name: 'next question' }).click();
    await expect(page.getByText('question 2 of 2')).toBeVisible();
    await send('second question');

    // Finish the set: the second question's reply, then "next question". The probe and the form both lose the item.
    await page.route(`${PROJECT}/rest/v1/rpc/check_answer`, route => route.request().method() === 'POST'
      ? route.fulfill({
        status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({ correct: true, key: ['a', 'c'], rationales: { a: 'sample rationale a', b: 'sample rationale b', c: 'sample rationale c' }, version_id: uuid(22) }),
      })
      : route.fallback());
    await page.getByLabel('sample red').check();
    await page.getByLabel('sample blue').check();
    await page.getByRole('button', { name: 'check', exact: true }).click();
    await page.getByRole('button', { name: 'next question' }).click();
    await expect(page.getByTestId('flag-probe')).toHaveText('none');
    await send('after the set');

    expect(flags()).toMatchObject([
      { item_id: uuid(11), item_version_id: uuid(21), comment: 'first question' },
      { item_id: uuid(12), item_version_id: uuid(22), comment: 'second question' },
      { item_id: null, item_version_id: null, comment: 'after the set' },
    ]);
  });
});

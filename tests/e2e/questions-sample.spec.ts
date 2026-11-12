import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const route = '/learn/study-skills/questions';
const dataRoute = '**/learn/study-skills/questions/study-skills-01.json';

// Labeled, non-clinical placeholders only. The sample checker is not a real question bank.
const samples = {
  status: 'sample',
  items: [
    {
      id: 'sample-one', status: 'sample', type: 'single', stem: '[sample question 1]',
      choices: [{ id: 'a', text: '[sample choice A]' }, { id: 'b', text: '[sample choice B]' }],
      key: ['a'], rationales: { a: '[sample rationale A]', b: '[sample rationale B]' },
    },
    {
      id: 'sample-two', status: 'sample', type: 'sata', stem: '[sample question 2]',
      choices: [
        { id: 'a', text: '[sample choice A]' },
        { id: 'b', text: '[sample choice B]' },
        { id: 'c', text: '[sample choice C]' },
      ],
      key: ['a', 'c'],
      rationales: { a: '[sample rationale A]', b: '[sample rationale B]', c: '[sample rationale C]' },
    },
  ],
};
const fulfillSamples = async (page: import('@playwright/test').Page, data: unknown = samples) => {
  await page.route(dataRoute, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(data),
  }));
};

test('announces sample loading until the own-site JSON request settles', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(dataRoute, async route => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(samples) });
  });
  try {
    await page.goto(route);
    await expect(page.getByTestId('sample-questions-loading')).toHaveText('loading questions…');
    await expect(page.getByTestId('sample-questions-loading')).toHaveAttribute('role', 'status');
  } finally {
    release();
  }
  await expect(page.getByTestId('sample-questions-ready')).toBeVisible();
});

test('empty sample data gives a calm message without any question controls', async ({ page }) => {
  await fulfillSamples(page, { status: 'sample', items: [] });
  await page.goto(route);
  await expect(page.getByTestId('sample-questions-empty')).toHaveText('no sample questions are available yet.');
  await expect(page.getByTestId('sample-questions-empty')).toHaveAttribute('role', 'status');
  await expect(page.locator('fieldset')).toHaveCount(0);
});

test('failed JSON gives no raw error, retry works with keyboard, and focus reaches recovered questions', async ({ page }) => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(dataRoute, async route => {
    calls++;
    if (calls === 1) return route.fulfill({
      status: 503, contentType: 'application/json', body: '{"message":"[sample internal error]"}',
    });
    await gate;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(samples) });
  });
  await page.goto(route);
  await expect(page.getByTestId('sample-questions-failed')).toHaveText(
    "couldn't load sample questions. please try again.",
  );
  await expect(page.getByText('[sample internal error]')).toHaveCount(0);
  const retry = page.getByRole('button', { name: 'try again' });
  expect(await retry.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await retry.focus();
  await expect(retry).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  try {
    await expect(page.getByTestId('sample-questions-retry-loading')).toHaveText('loading questions…');
    await expect(retry).toHaveAttribute('aria-disabled', 'true');
    await expect(retry).toBeFocused();
    // A second keyboard activation while loading cannot start another network request.
    await page.keyboard.press('Enter');
    expect(calls).toBe(2);
  } finally {
    release();
  }
  await expect(page.getByTestId('sample-questions-ready')).toBeVisible();
  await expect(page.getByText('sample questions ready.')).toBeFocused();
  expect(calls).toBe(2);
});


test('unlabeled or malformed public sample data fails closed without answer controls', async ({ page }) => {
  await fulfillSamples(page, { status: 'published', items: samples.items });
  await page.goto(route);
  await expect(page.getByTestId('sample-questions-failed')).toHaveText(
    "couldn't load sample questions. please try again.",
  );
  await expect(page.locator('fieldset')).toHaveCount(0);
  await expect(page.getByTestId('sample-questions-ready')).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(result => result.id + ': ' + result.help)).toEqual([]);
});

test('answers by tap and keyboard, shows symbols plus words, and finishes with the right summary', async ({ page }) => {
  await fulfillSamples(page);
  await page.goto(route);
  await expect(page.getByTestId('sample-questions-ready')).toBeVisible();

  const board = page.getByTestId('sample-questions-ready');
  await expect(board.getByText('question 1 of 2')).toBeVisible();
  await board.getByLabel('[sample choice A]').check();
  await board.getByRole('button', { name: 'check', exact: true }).click();
  await expect(board.getByText('right.', { exact: true }).first()).toBeVisible();
  await expect(board.getByText("you picked this, and it's right")).toBeVisible();
  await expect(board.locator('[aria-hidden="true"]').filter({ hasText: '✓' }).first()).toBeVisible();
  await board.getByRole('button', { name: 'next question' }).click();

  await expect(board.getByText('select all that apply')).toBeVisible();
  await board.getByLabel('[sample choice A]').focus();
  await page.keyboard.press('Space');
  await board.getByRole('button', { name: 'check', exact: true }).click();
  await expect(board.getByText('not quite.', { exact: true }).first()).toBeVisible();
  await expect(board.getByText("this is right, and you didn't pick it")).toBeVisible();
  await board.getByRole('button', { name: 'next question' }).click();

  await expect(board.getByText('right on 1 of 2.')).toBeVisible();
  await board.getByRole('button', { name: 'try the missed ones again' }).click();
  await expect(board.getByText('question 1 of 1')).toBeVisible();
  await board.getByLabel('[sample choice A]').check();
  await board.getByLabel('[sample choice C]').check();
  await board.getByRole('button', { name: 'check', exact: true }).click();
  await expect(board.getByText('right.', { exact: true }).first()).toBeVisible();
  await board.getByRole('button', { name: 'next question' }).click();
  await expect(board.getByText('right on 1 of 1.')).toBeVisible();
});

test('is accessible and fits 390, 820 and 1440 in Light and Evening with reduced motion', async ({ page }) => {
  await fulfillSamples(page);
  await page.goto(route);
  await expect(page.getByTestId('sample-questions-ready')).toBeVisible();
  for (const size of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    const pageColors = new Set<string>();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.evaluate(mode => { document.documentElement.dataset.theme = mode; }, colorScheme);
      const color = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim());
      expect(color.length).toBeGreaterThan(0);
      pageColors.add(color);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const item of await page.locator('fieldset label').all()) {
        expect(await item.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map(result => result.id + ': ' + result.help)).toEqual([]);
    }
    expect(pageColors.size).toBe(2);
  }
});

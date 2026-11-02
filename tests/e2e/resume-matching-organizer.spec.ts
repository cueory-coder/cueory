import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const KEY = 'cueory-resume';
const MATCHING = '/learn/study-skills/matching';
const ORGANIZER = '/learn/study-skills/organizer';

// The marketing note has its own tests and must not interrupt keyboard flows here.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage may be disabled */ }
  });
});

const saved = (page: Page) => page.evaluate((key) => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}, KEY);

async function axeClean(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function matchPair(page: Page, number: number) {
  const terms = page.getByRole('region', { name: 'Terms' });
  const meanings = page.getByRole('region', { name: 'Meanings' });
  await terms.getByRole('button', { name: new RegExp(`^Placeholder card ${number}, front\\.`) }).focus();
  await page.keyboard.press('Enter');
  await meanings.getByRole('button', { name: new RegExp(`^Placeholder card ${number}, back\\.`) }).focus();
  await page.keyboard.press('Enter');
}

async function place(page: Page, name: string, key: string) {
  const item = page.getByTestId('organizer').getByRole('button', { name: new RegExp(`^${name}(?:\\s|$)`) });
  await item.focus();
  await page.keyboard.press(key);
}

test('matching resumes only two confirmed pairs with progress and keyboard navigation', async ({ page }) => {
  await page.goto(MATCHING);
  await matchPair(page, 1);
  await matchPair(page, 2);
  await expect.poll(async () => (await saved(page))?.itemIndex).toBe(2);
  const snapshot = await saved(page);
  expect(snapshot).toMatchObject({
    tool: 'matching', page: MATCHING, step: 'round-1', totalItems: 3,
    phase: 'working', answers: { 'term-0': 'meaning-0', 'term-1': 'meaning-1' },
  });
  expect(Object.keys(snapshot.answers)).toHaveLength(2);
  expect(JSON.stringify(snapshot)).not.toMatch(/Placeholder card|Christian's reviewed|rationale|correctAnswer/);

  // An unconfirmed third term must never enter the stored record.
  await page.getByRole('region', { name: 'Terms' }).getByRole('button', { name: /^Placeholder card 3, front\./ }).click();
  expect(Object.keys((await saved(page)).answers)).toHaveLength(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toBeVisible();
  await axeClean(page);
  await page.getByRole('button', { name: 'continue question 3' }).click();
  await expect(page.getByText('Matched 2 of 3 · Misses: 0')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'matching progress' })).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByRole('region', { name: 'Terms' }).getByRole('button', { name: /^Placeholder card 1, front\./ })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('region', { name: 'Meanings' }).getByRole('button', { name: /^Placeholder card 2, back\./ })).toHaveAttribute('aria-disabled', 'true');
  await matchPair(page, 3);
  await expect(page.getByText('All 3 matched.')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.phase).toBe('results');
  await page.reload();
  await page.getByRole('button', { name: 'continue with results' }).click();
  await expect(page.getByText('All 3 matched.')).toBeVisible();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByText('Matched 0 of 3 · Misses: 0')).toBeVisible();
  expect(await saved(page)).toBeNull();
});

test('matching start over discards saved selections instead of restoring them', async ({ page }) => {
  await page.goto(MATCHING);
  await matchPair(page, 1);
  await expect.poll(async () => Object.keys((await saved(page))?.answers ?? {}).length).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'start over' }).click();
  await expect(page.getByText('Matched 0 of 3 · Misses: 0')).toBeVisible();
  expect(await saved(page)).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
});

test('organizer restores only locked placements after check, not unchecked moves', async ({ page }) => {
  await page.goto(ORGANIZER);
  await place(page, 'apple', '1');
  await place(page, 'carrot', '2');
  await place(page, 'rice', '3');
  await page.getByTestId('organizer').getByRole('button', { name: 'check' }).click();
  await expect.poll(async () => (await saved(page))?.itemIndex).toBe(3);
  const first = await saved(page);
  expect(first).toMatchObject({
    tool: 'organizer', page: ORGANIZER, module: 'study-skills-01', step: 'checks-1',
    itemIndex: 3, totalItems: 8, phase: 'working',
    answers: { apple: 'fruit', carrot: 'vegetable', rice: 'grain' },
  });
  expect(Object.keys(first.answers)).toHaveLength(3);
  // Only structured IDs appear. This sample uses the same words for group IDs and visible group names.
  expect(Object.keys(first)).not.toContain('answerKey');
  expect(JSON.stringify(first)).not.toMatch(/"text"|"front"|"back"|"correct"|"rationale"/);
  await place(page, 'plum', '1'); // Not yet checked. Do not save.
  expect(Object.keys((await saved(page)).answers)).toHaveLength(3);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toBeVisible();
  await axeClean(page);
  await page.getByRole('button', { name: 'continue question 4' }).click();
  await expect(page.getByRole('progressbar', { name: 'organizer progress' })).toHaveAttribute('aria-valuenow', '3');
  await expect(page.getByTestId('organizer').getByRole('list', { name: 'fruit' }).getByRole('button', { name: /^apple/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('organizer').getByRole('list', { name: 'tray' }).getByRole('button', { name: /^plum/ })).toBeVisible();
  for (const [name, key] of [['pear', '1'], ['plum', '1'], ['spinach', '2'], ['onion', '2'], ['oats', '3']] as const) {
    await place(page, name, key);
  }
  await page.getByTestId('organizer').getByRole('button', { name: 'check' }).click();
  await expect(page.getByTestId('organizer-result')).toContainText('all 8 sorted in 2 tries.');
  await expect.poll(async () => (await saved(page))?.phase).toBe('results');
  await page.reload();
  await page.getByRole('button', { name: 'continue with results' }).click();
  await expect(page.getByTestId('organizer-result')).toContainText('all 8 sorted in 2 tries.');
  await page.getByRole('button', { name: 'sort again' }).click();
  await expect(page.getByRole('progressbar', { name: 'organizer progress' })).toHaveAttribute('aria-valuenow', '0');
  expect(await saved(page)).toBeNull();
});

test('organizer start over clears the saved checked placements', async ({ page }) => {
  await page.goto(ORGANIZER);
  await place(page, 'apple', '1');
  await page.getByTestId('organizer').getByRole('button', { name: 'check' }).click();
  await expect.poll(async () => (await saved(page))?.itemIndex).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'start over' }).click();
  await expect(page.getByRole('progressbar', { name: 'organizer progress' })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByTestId('organizer').getByRole('list', { name: 'tray' }).getByRole('button')).toHaveCount(8);
  expect(await saved(page)).toBeNull();
});

test('both boards work without browser storage and show no resume prompt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('storage denied', 'SecurityError'); },
    });
  });
  await page.goto(MATCHING);
  await matchPair(page, 1);
  await expect(page.getByText('Matched 1 of 3 · Misses: 0')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
  await page.goto(ORGANIZER);
  await place(page, 'apple', '1');
  await page.getByTestId('organizer').getByRole('button', { name: 'check' }).click();
  await expect(page.getByRole('progressbar', { name: 'organizer progress' })).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
});

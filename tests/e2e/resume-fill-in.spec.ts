import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const path = '/learn/study-skills/fill-in';

// The delayed welcome popup is tested elsewhere; it must not interrupt study controls here.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* blocked storage */ }
  });
});

async function open(page: Page) {
  await page.goto(path);
  const board = page.getByTestId('fill-in');
  await expect(board.getByRole('textbox', { name: 'the missing word' })).toBeVisible();
  return board;
}

async function submit(page: Page, word: string) {
  const input = page.getByTestId('fill-in').getByRole('textbox', { name: 'the missing word' });
  await input.fill(word);
  await input.press('Enter');
  await expect(page.getByTestId('fill-in').getByRole('button', { name: 'next' })).toBeVisible();
}

for (const width of [390, 1440]) {
  test(`two submitted blanks resume at the third item, ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 840 });
    const board = await open(page);
    await submit(page, 'honey');
    await board.getByRole('button', { name: 'next' }).click();
    await submit(page, 'days');
    await board.getByRole('button', { name: 'next' }).click();
    await expect(board.getByText('round 1 · item 3 of 4')).toBeVisible();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null'));
    expect(saved).toMatchObject({
      tool: 'fill-in', page: path, itemIndex: 2, itemId: 'item-2', totalItems: 4,
      step: 'advance-2', phase: 'working', timer: null,
      answers: { 'item-0': ['n:honey'], 'item-1': ['n:days'] },
    });
    // No bracketed answer key, sentence text, unseen answer words or source content ID is stored.
    const raw = JSON.stringify(saved);
    expect(raw).not.toContain('Bees make');
    expect(raw).not.toContain('A week has');
    expect(raw).not.toContain('pencil');
    expect(raw).not.toContain('umbrella');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toBeVisible();
    await expect.poll(() => board.getByTestId('fill-in-session').evaluate((node) => (node as HTMLElement).inert)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(accessibility.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await page.getByRole('button', { name: 'continue question 3' }).click();
    await expect(board.getByText('round 1 · item 3 of 4')).toBeVisible();
    await expect(board.getByRole('region', { name: 'your submitted answers' })).toContainText('item 1: honey');
    await expect(board.getByRole('region', { name: 'your submitted answers' })).toContainText('item 2: days');
    await expect(board.getByRole('textbox', { name: 'the missing word' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('start over discards the snapshot and restores an empty first item', async ({ page }) => {
  const board = await open(page);
  await submit(page, 'honey');
  await board.getByRole('button', { name: 'next' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'start over' }).click();
  await expect(board.getByText('round 1 · item 1 of 4')).toBeVisible();
  await expect(board.getByRole('region', { name: 'your submitted answers' })).toHaveCount(0);
  await expect(board.getByRole('textbox', { name: 'the missing word' })).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('cueory-resume'))).toBeNull();
});

test('a hint keeps its repeat-round meaning through a reload and ends on results', async ({ page }) => {
  const board = await open(page);
  await board.getByRole('button', { name: 'hint' }).click();
  await submit(page, 'honey');
  await board.getByRole('button', { name: 'next' }).click();
  for (const value of ['days', 'pencil', 'umbrella']) {
    await submit(page, value);
    await board.getByRole('button', { name: 'next' }).click();
  }
  await expect(board.getByText('round 2 · item 1 of 1')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null'));
  expect(saved.answers['item-0']).toEqual(['h:honey']);
  expect(saved.step).toBe('advance-4');
  await page.reload();
  await page.getByRole('button', { name: 'continue question 1' }).click();
  await expect(board.getByText('round 2 · item 1 of 1')).toBeVisible();
  await submit(page, 'honey');
  await board.getByRole('button', { name: 'next' }).click();
  await expect(board.getByText('all 4 recalled in 2 rounds.')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null')?.phase)).toBe('results');
  await page.reload();
  await page.getByRole('button', { name: 'continue with results' }).click();
  await expect(board.getByText('all 4 recalled in 2 rounds.')).toBeVisible();
});

test('an almost-correct attempt is saved as a student submission and can be retried', async ({ page }) => {
  const board = await open(page);
  await submit(page, 'honey');
  await board.getByRole('button', { name: 'next' }).click();
  await submit(page, 'days');
  await board.getByRole('button', { name: 'next' }).click();
  const field = board.getByRole('textbox', { name: 'the missing word' });
  await field.fill('pnecil');
  await field.press('Enter');
  await expect(board.getByText('almost. check the spelling.')).toBeVisible();
  await field.fill('pencil');
  await field.press('Enter');
  await expect(board.getByRole('button', { name: 'next' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null'));
  expect(saved.answers['item-2']).toEqual(['n:pnecil', 'n:pencil']);
  await page.reload();
  await page.getByRole('button', { name: 'continue question 3' }).click();
  await expect(board.getByRole('textbox', { name: 'the missing word' })).toHaveValue('pencil');
  await expect(board.getByRole('button', { name: 'next' })).toBeVisible();
});

test('blocked local storage never blocks studying and cannot show a false resume prompt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('storage is blocked'); },
    });
  });
  const board = await open(page);
  await submit(page, 'honey');
  await board.getByRole('button', { name: 'next' }).click();
  await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
  await page.reload();
  await expect(board.getByText('round 1 · item 1 of 4')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
});

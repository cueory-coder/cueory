import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const path = '/learn/study-skills/label-it';
const key = 'cueory-resume';
const board = (page: Page) => page.getByTestId('labelit');
const saved = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage can be blocked */ }
  });
});

async function open(page: Page) {
  await page.goto(path);
  await expect(page.getByTestId('labelit-status')).toBeVisible();
}

async function markLabel(page: Page, number: number, mark: 'know it' | 'still learning') {
  await board(page).getByRole('button', { name: `uncover label ${number}`, exact: true }).click();
  await board(page).getByRole('group', { name: `mark label ${number}`, exact: true }).getByRole('button', { name: mark, exact: true }).click();
}

test('marked labels resume with their marks, while an uncovered unmarked label becomes covered', async ({ page }) => {
  await open(page);
  await markLabel(page, 1, 'know it');
  await markLabel(page, 2, 'still learning');
  await board(page).getByRole('button', { name: 'uncover label 3', exact: true }).click();
  const snapshot = await saved(page);
  expect(snapshot).toMatchObject({
    tool: 'label-it', page: path, module: 'study-skills-01', step: 'round-1',
    itemIndex: 2, itemId: 'window', totalItems: 4, timer: null, phase: 'working',
    answers: { roof: { mark: 'know', round: 'current' }, chimney: { mark: 'learning', round: 'current' } },
  });
  expect(Object.keys(snapshot.answers)).toEqual(['roof', 'chimney']);
  // Sample IDs happen to equal their label words. Only IDs and own marks, never label-content fields, are saved.
  expect(JSON.stringify(snapshot)).not.toMatch(/"text"|"image"|"credit"|"correct"|"rationale"|house\.svg/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toBeVisible();
  expect(await page.getByTestId('labelit-session').evaluate(node => (node as HTMLElement).inert)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.help}`)).toEqual([]);
  await page.getByRole('button', { name: 'continue question 3', exact: true }).click();
  await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1: roof');
  await expect(page.getByTestId('cover-2')).toHaveAccessibleName('label 2: chimney');
  await expect(page.getByTestId('cover-3')).toHaveAccessibleName('label 3, covered');
  await expect(board(page).getByRole('group', { name: 'mark label 1', exact: true }).getByRole('button', { name: 'know it', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(board(page).getByRole('group', { name: 'mark label 2', exact: true }).getByRole('button', { name: 'still learning', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('labelit-session').locator('[tabindex="-1"]').first()).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('start over clears the save and lifecycle cannot put it back', async ({ page }) => {
  await open(page);
  await markLabel(page, 1, 'know it');
  await page.reload();
  await page.getByRole('button', { name: 'start over', exact: true }).click();
  await expect(page.getByTestId('labelit-status')).toHaveText('4 covered · know it: 0 · still learning: 0');
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  expect(await saved(page)).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
});

test('later rounds preserve earlier know-it marks and current-round marks, then resume results', async ({ page }) => {
  await open(page);
  await markLabel(page, 1, 'know it');
  await markLabel(page, 2, 'still learning');
  await markLabel(page, 3, 'know it');
  await markLabel(page, 4, 'still learning');
  await board(page).getByRole('button', { name: 'study the 2 still learning', exact: true }).click();
  await markLabel(page, 2, 'know it');
  await page.reload();
  await page.getByRole('button', { name: 'continue question 4', exact: true }).click();
  await expect(page.getByTestId('labelit-status')).toHaveText('round 2 · 1 covered · know it: 3 · still learning: 0');
  await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1: roof');
  await expect(board(page).getByRole('group', { name: 'mark label 1', exact: true })).toHaveCount(0);
  await markLabel(page, 4, 'know it');
  await expect(board(page).getByText("that's every label for now.")).toBeVisible();
  expect((await saved(page)).phase).toBe('results');
  await page.reload();
  await page.getByRole('button', { name: 'continue with results', exact: true }).click();
  await expect(board(page).getByText("that's every label for now.")).toBeVisible();
  await board(page).getByRole('button', { name: 'start over', exact: true }).click();
  expect(await saved(page)).toBeNull();
});

test('reveal all and cover all keep their behavior and covered marks do not return', async ({ page }) => {
  await open(page);
  await markLabel(page, 1, 'know it');
  await board(page).getByRole('button', { name: 'reveal all', exact: true }).click();
  await expect(page.getByTestId('labelit-status')).toHaveText('0 covered · know it: 1 · still learning: 0');
  await board(page).getByRole('button', { name: 'cover all', exact: true }).click();
  expect((await saved(page)).answers).toEqual({});
  await page.reload();
  await page.getByRole('button', { name: 'continue question 1', exact: true }).click();
  await expect(page.getByTestId('labelit-status')).toHaveText('4 covered · know it: 0 · still learning: 0');
});

test('lifecycle flushes the latest own marks, without saving newly revealed label text', async ({ page }) => {
  await open(page);
  await markLabel(page, 1, 'still learning');
  await board(page).getByRole('button', { name: 'uncover label 2', exact: true }).click();
  await page.evaluate(key => {
    localStorage.removeItem(key);
    dispatchEvent(new Event('pagehide'));
  }, key);
  expect((await saved(page)).answers).toEqual({ roof: { mark: 'learning', round: 'current' } });
});

test('merely visiting or revealing does not overwrite a different study tool save', async ({ page }) => {
  await page.addInitScript(({ path, key }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), tool: 'cards',
      page: path.replace('label-it', 'cards'), itemIndex: 0, totalItems: 3, answers: {}, timer: null, phase: 'working' }));
  }, { path, key });
  await open(page);
  await board(page).getByRole('button', { name: 'uncover label 1', exact: true }).click();
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  expect((await saved(page)).tool).toBe('cards');
});

test('unknown label IDs in a structurally valid snapshot safely restart without revealing labels', async ({ page }) => {
  await open(page);
  await markLabel(page, 1, 'know it');
  const snapshot = await saved(page);
  snapshot.answers = { unknown: { mark: 'know', round: 'current' } };
  // Seed the next document after pagehide flushes this page's valid draft.
  await page.addInitScript(({ key, snapshot }) => {
    localStorage.setItem(key, JSON.stringify(snapshot));
  }, { key, snapshot });
  await page.reload();
  expect((await saved(page)).answers).toEqual(snapshot.answers);
  await page.getByRole('button', { name: 'continue question 2', exact: true }).click();
  await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
  expect(await saved(page)).toBeNull();
});

test('blocked storage does not block uncovering, marking, or reloading a fresh board', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked storage'); } });
  });
  await open(page);
  await markLabel(page, 1, 'know it');
  await expect(page.getByTestId('labelit-status')).toHaveText('3 covered · know it: 1 · still learning: 0');
  await page.reload();
  await expect(page.getByTestId('labelit-status')).toHaveText('4 covered · know it: 0 · still learning: 0');
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

const supportedProjects = new Set(['phone', 'desktop']);

test.describe('label it page', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!supportedProjects.has(test.info().project.name), 'Task 408 covers phone and desktop only');
    await page.goto('/learn/study-skills/label-it');
  });

  test('shows the page heading, sample state, drawing credit, and lesson link', async ({ page }) => {
    await expect(page).toHaveTitle('label it: lesson 1 · cueory');
    await expect(page.locator('main h1')).toHaveText('label it');
    await expect(page.locator('main')).toContainText(
      'the labels on the drawing are covered. uncover them one at a time, or all at once, and mark each one.',
    );
    await expect(page.getByTestId('label-it-sample-note')).toHaveText(
      "this is a sample with an everyday drawing. the lesson's own diagrams come later.",
    );
    await expect(page.getByRole('img', { name: 'a simple drawing of a house with four labels' })).toBeVisible();
    await expect(page.getByText('drawing: cueory, an everyday sample made for this page')).toBeVisible();
    await expect(page.getByRole('link', { name: 'back to the lesson' })).toHaveAttribute(
      'href',
      '/learn/study-skills',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('supports keyboard and tap state changes with spoken status text', async ({ page }) => {
    const board = page.getByTestId('labelit');
    const status = page.getByTestId('labelit-status');
    const live = page.getByTestId('labelit-live');

    await expect(board).toBeVisible();
    await expect(status).toHaveText('4 covered · know it: 0 · still learning: 0');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
    await expect(page.getByTestId('cover-2')).toHaveAccessibleName('label 2, covered');
    await expect(board).not.toContainText(/roof|chimney|window|door/);

    await page.getByTestId('cover-1').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1: roof');
    await expect(live).toHaveText('label 1: roof.');

    await board.getByRole('button', { name: 'uncover label 2' }).click();
    await expect(board.getByRole('group', { name: 'mark label 2' }).getByRole('button', { name: 'know it' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(live).toHaveText('chimney: know it. 3 left to mark.');
    await expect(status).toHaveText('2 covered · know it: 1 · still learning: 0');

    await board.getByRole('button', { name: 'reveal all' }).click();
    await expect(status).toHaveText('0 covered · know it: 1 · still learning: 0');
    await expect(board.getByRole('button', { name: 'still learning' }).first()).toBeVisible();
    expect(await board.getByRole('button', { name: 'know it' }).count()).toBe(4);
  });
});

test.describe('label it without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps the lesson fallback available', async ({ page }) => {
    test.skip(!supportedProjects.has(test.info().project.name), 'Task 408 covers phone and desktop only');
    const response = await page.goto('/learn/study-skills/label-it');
    expect(response?.status()).toBe(200);
    await expect(page.locator('main h1')).toHaveText('label it');
    await expect(page.locator('main')).toContainText('label it needs JavaScript.');
    await expect(page.getByRole('link', { name: 'lesson page', exact: true })).toHaveAttribute(
      'href',
      '/learn/study-skills',
    );
  });
});

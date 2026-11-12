import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const route = '/learn/study-skills/questions';

test.describe('Task 95: modern sample questions page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(route);
  });

  test('shows the lesson name, clear sample notice, and centered practice surface', async ({ page }) => {
    await expect(page).toHaveTitle(/questions: lesson 1/);
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'questions' })).toBeVisible();
    await expect(page.getByTestId('questions-lesson-name')).toHaveText('Lesson 1: How to study for nursing school');
    await expect(page.getByTestId('questions-sample-note')).toHaveText('these are labeled samples');
    await expect(page.getByText("these are sample questions with everyday answers. the lesson's own questions come later.")).toBeVisible();

    const surface = page.getByTestId('question-surface');
    await expect(surface).toBeVisible();
    const appearance = await surface.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        shadow: style.boxShadow,
        border: style.borderTopStyle,
      };
    });
    expect(appearance.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(appearance.shadow).not.toBe('none');
    expect(appearance.border).toBe('solid');

    // The sample JSON is fetched after React mounts. Never mistake a loading
    // placeholder for a working question player.
    const board = page.getByTestId('questions');
    await expect(board.locator('fieldset legend')).toBeVisible({ timeout: 15000 });
    await expect(board.locator('fieldset input').first()).toBeVisible();
  });

  test('keeps sample answering functional and provides both study navigation links', async ({ page }) => {
    const board = page.getByTestId('questions');
    const firstChoice = board.locator('fieldset input').first();
    await expect(firstChoice).toBeVisible({ timeout: 15000 });
    await firstChoice.check();
    await board.getByRole('button', { name: 'check', exact: true }).click();
    await expect(board.getByRole('button', { name: 'next question' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'more ways to study' });
    await expect(nav.getByRole('link', { name: 'back to lesson' })).toHaveAttribute('href', '/learn/study-skills');
    const learn = nav.getByRole('link', { name: 'try learn mode' });
    await expect(learn).toHaveAttribute('href', '/learn/study-skills/learn-mode');

    const targetHeights = await nav.getByRole('link').evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().height),
    );
    expect(targetHeights).toHaveLength(2);
    expect(targetHeights.every((height) => height >= 44)).toBe(true);

    await learn.click();
    await expect(page).toHaveURL(/\/learn\/study-skills\/learn-mode$/);
  });

  test('passes axe and does not scroll sideways after the actual questions load', async ({ page }) => {
    const board = page.getByTestId('questions');
    await expect(board.locator('fieldset legend')).toBeVisible({ timeout: 15000 });
    await expect(board.locator('fieldset input').first()).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);

    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
  });
});

test.describe('W20: the published questions page shell', () => {
  test('shows a loading fallback before hydration and a reachable way back to the library', async ({ page }) => {
    const built = readFileSync('dist/learn/questions.html', 'utf8');
    expect(built).toContain('loading questions…');
    await page.goto('/learn/questions?concept=sample-concept');
    await expect(page.getByRole('heading', { level: 1, name: 'questions' })).toBeVisible();
    await expect(page.getByText('practice with published questions when they are available.')).toBeVisible();
    const link = page.getByRole('navigation', { name: 'more ways to study' })
      .getByRole('link', { name: 'back to the course library' });
    await expect(link).toHaveAttribute('href', '/learn');
    expect(await link.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  });
});

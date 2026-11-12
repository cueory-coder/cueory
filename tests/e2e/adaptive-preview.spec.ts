import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SAMPLE_ADAPTIVE_QUESTIONS } from '../../src/islands/adaptivequiz';

const route = '/preview/adaptive';

test('has one heading, noindex, and honest sample-only instructions', async ({ page }) => {
  await page.goto(route);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'adaptive quiz preview' })).toBeVisible();
  await expect(page.getByTestId('adaptive-preview')).toBeVisible();
  await expect(page.getByText('five labeled sample questions. nothing is saved or sent.')).toBeVisible();
  await expect(page.getByTestId('adaptive-why')).toContainText('why this question:');
  await expect(page.getByRole('link', { name: 'back to the course library' })).toHaveAttribute('href', '/learn');
});
test('answers a complete session by keyboard and tap, with explanation, summary and restart', async ({ page }) => {
  await page.goto(route);
  const seen = new Set<string>();
  for (let index = 0; index < 5; index++) {
    const questionId = await page.getByTestId('adaptive-question').getAttribute('data-question-id');
    expect(questionId).toBeTruthy();
    expect(seen.has(questionId!)).toBe(false);
    seen.add(questionId!);
    const item = SAMPLE_ADAPTIVE_QUESTIONS.find(q => q.id === questionId)!;
    const option = page.getByRole('radio', { name: item.sampleKey === 'a' ? '[sample] choice A' : '[sample] choice B' });
    await option.focus();
    await page.keyboard.press('Space');
    await expect(option).toBeChecked();
    await page.getByRole('button', { name: 'check sample answer' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('adaptive-result')).toHaveText('✓ right.');
    const next = page.getByRole('button', { name: 'next sample question' });
    expect(await next.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await next.click();
  }
  const finished = page.getByTestId('adaptive-finished');
  await expect(finished).toContainText('right on 5 of 5 sample questions.');
  expect(seen.size).toBe(5);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /adaptive/i.test(key)))).toEqual([]);
  await finished.getByRole('button', { name: 'start again' }).click();
  await expect(page.getByTestId('adaptive-question')).toBeVisible();
});
test('wrong selection is named in words and changes the next why-line', async ({ page }) => {
  await page.goto(route);
  const id = await page.getByTestId('adaptive-question').getAttribute('data-question-id');
  const first = SAMPLE_ADAPTIVE_QUESTIONS.find(q => q.id === id)!;
  await page.getByRole('radio', { name: first.sampleKey === 'a' ? '[sample] choice B' : '[sample] choice A' }).check();
  await page.getByRole('button', { name: 'check sample answer' }).click();
  await expect(page.getByTestId('adaptive-result')).toHaveText('✕ not quite.');
  await page.getByRole('button', { name: 'next sample question' }).click();
  await expect(page.getByTestId('adaptive-why')).toContainText('missed last time');
  await expect(page.getByRole('region', { name: 'sample concept progress' })).toContainText('learning');
});
test('fits phone, tablet and desktop in Light and Evening and passes axe', async ({ page }) => {
  await page.goto(route);
  await expect(page.getByTestId('adaptive-question')).toBeVisible();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const label of await page.locator('fieldset label').all()) {
        expect(await label.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map(result => result.id + ': ' + result.help)).toEqual([]);
    }
  }
});

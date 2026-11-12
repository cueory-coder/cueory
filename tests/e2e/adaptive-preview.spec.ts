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
    await expect(page.getByTestId('adaptive-result')).toBeFocused();
    const next = page.getByRole('button', { name: 'next sample question' });
    expect(await next.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await next.click();
    if (index < 4) await expect(page.getByTestId('adaptive-question')).toBeFocused();
  }
  const finished = page.getByTestId('adaptive-finished');
  await expect(finished).toContainText('right on 5 of 5 sample questions.');
  await expect(finished.getByRole('status')).toBeFocused();
  expect(seen.size).toBe(5);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /adaptive/i.test(key)))).toEqual([]);
  await finished.getByRole('button', { name: 'start again' }).click();
  await expect(page.getByTestId('adaptive-question')).toBeVisible();
  await expect(page.getByTestId('adaptive-question')).toBeFocused();
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

test('answer cannot be checked twice and keyboard focus lands on readable feedback', async ({ page }) => {
  await page.goto(route);
  const check = page.getByRole('button', { name: 'check sample answer' });
  await expect(check).toBeDisabled();
  await page.getByRole('radio', { name: '[sample] choice B' }).check();
  await check.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('adaptive-result')).toBeFocused();
  await expect(page.getByTestId('adaptive-preview').locator('fieldset')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'check sample answer' })).toHaveCount(0);
  await expect(page.getByTestId('adaptive-count')).toContainText('sample question 1 of 5');
  await page.getByRole('button', { name: 'next sample question' }).click();
  await expect(page.getByTestId('adaptive-question')).toBeFocused();
  await expect(page.getByTestId('adaptive-count')).toContainText('sample question 2 of 5');
});


test('uses real touch taps on every sample choice and button through the final summary', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  try {
    const touchPage = await context.newPage();
    await touchPage.goto(route);
    const seen = new Set<string>();
    for (let index = 0; index < SAMPLE_ADAPTIVE_QUESTIONS.length; index++) {
      const id = await touchPage.getByTestId('adaptive-question').getAttribute('data-question-id');
      expect(id).toBeTruthy();
      expect(seen.has(id!)).toBe(false);
      seen.add(id!);
      const sample = SAMPLE_ADAPTIVE_QUESTIONS.find(item => item.id === id)!;
      const label = touchPage.getByTestId('adaptive-preview').locator('fieldset label').filter({
        hasText: sample.sampleKey === 'a' ? '[sample] choice A' : '[sample] choice B',
      });
      await label.tap();
      await expect(touchPage.getByRole('radio', {
        name: sample.sampleKey === 'a' ? '[sample] choice A' : '[sample] choice B',
      })).toBeChecked();
      await touchPage.getByRole('button', { name: 'check sample answer' }).tap();
      await expect(touchPage.getByTestId('adaptive-result')).toHaveText('✓ right.');
      await touchPage.getByRole('button', { name: 'next sample question' }).tap();
    }
    await expect(touchPage.getByTestId('adaptive-finished')).toContainText('right on 5 of 5 sample questions.');
    expect(seen.size).toBe(5);
    await touchPage.getByRole('button', { name: 'start again' }).tap();
    await expect(touchPage.getByTestId('adaptive-question')).toBeVisible();
  } finally {
    await context.close();
  }
});


test('finished Restart target stays 44 by 44 in every size and palette', async ({ page }) => {
  await page.goto(route);
  for (let index = 0; index < SAMPLE_ADAPTIVE_QUESTIONS.length; index++) {
    await page.getByRole('radio', { name: '[sample] choice A' }).check();
    await page.getByRole('button', { name: 'check sample answer' }).click();
    await page.getByRole('button', { name: 'next sample question' }).click();
  }
  const finished = page.getByTestId('adaptive-finished');
  const restart = finished.getByRole('button', { name: 'start again' });
  await expect(finished).toContainText(/right on \d of 5 sample questions\./);
  await expect(restart).toBeVisible();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.evaluate(mode => { document.documentElement.dataset.theme = mode; }, colorScheme);
      const rect = await restart.boundingBox();
      expect(rect?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await restart.focus();
  // Keyboard navigation, not programmatic focus alone, must show the focus ring.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(restart).toBeFocused();
  await expect(restart).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('adaptive-question')).toBeFocused();
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
    const actualPalettes = new Set<string>();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      // Restore the first sample before each palette's Check and Next target assertions.
      await page.goto(route);
      await expect(page.getByTestId('adaptive-question')).toBeVisible();
      await page.evaluate(mode => { document.documentElement.dataset.theme = mode; }, colorScheme);
      const pageColor = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim());
      expect(pageColor.length).toBeGreaterThan(0);
      actualPalettes.add(pageColor);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const check = page.getByRole('button', { name: 'check sample answer' });
      for (const target of [...await page.getByTestId('adaptive-preview').locator('fieldset label').all(), check]) {
        const rect = await target.boundingBox();
        expect(rect?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(rect?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map(result => result.id + ': ' + result.help)).toEqual([]);
      await page.getByRole('radio', { name: '[sample] choice A' }).check();
      await check.click();
      const next = page.getByRole('button', { name: 'next sample question' });
      const nextRect = await next.boundingBox();
      expect(nextRect?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(nextRect?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    expect(actualPalettes.size).toBe(2);
  }
});

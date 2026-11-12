import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const path = '/learn/study-skills';
const reader = (page: Page) => page.getByTestId('study-reader').getByTestId('sentence-stepper');
const sentences = (page: Page) => reader(page).getByTestId('stepper-sentences').getByRole('listitem');
const backButton = (page: Page) => reader(page).getByRole('button', { name: 'back', exact: true });
const nextButton = (page: Page) => reader(page).getByRole('button', { name: 'next sentence', exact: true });
const showAllButton = (page: Page) => reader(page).getByRole('button', { name: 'show all', exact: true });
const notice = (page: Page) => reader(page).getByRole('status', { name: 'lesson sentence update' });

test('keyboard next announces only the new sentence and keeps focus on the button', async ({ page }) => {
  await page.goto(path);
  await expect(sentences(page)).toHaveCount(1);
  await expect(reader(page)).toContainText('sentence 1 of 3');
  await backButton(page).focus();
  await page.keyboard.press('Tab');
  await expect(nextButton(page)).toBeFocused();
  expect(await nextButton(page).evaluate(el =>
    el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'
  )).toBe(true);

  await page.keyboard.press('Enter');
  await expect(sentences(page)).toHaveCount(2);
  await expect(nextButton(page)).toBeFocused();
  const second = await sentences(page).last().innerText();
  await expect(notice(page)).toHaveText(`now showing 2 of 3: ${second}`);
  // Older route tests use a substring text locator: the counter must be the only match.
  await expect(page.getByText('sentence 2 of')).toHaveCount(1);
  await expect(reader(page)).toContainText('sentence 2 of 3');
  await expect(reader(page).getByTestId('stepper-sentences')).toHaveAttribute('aria-live', 'off');

  await page.keyboard.press('Enter');
  await expect(sentences(page)).toHaveCount(3);
  await expect(nextButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(nextButton(page)).toBeFocused();
  const third = await sentences(page).last().innerText();
  await expect(notice(page)).toHaveText(`now showing 3 of 3: ${third}`);
  await page.keyboard.press('Enter');
  await expect(sentences(page)).toHaveCount(3);
  await expect(notice(page)).toHaveText(`now showing 3 of 3: ${third}`);
});

test('show all works by keyboard and tap without moving focus', async ({ page }) => {
  await page.goto(path);
  await showAllButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(showAllButton(page)).toBeFocused();
  await expect(sentences(page)).toHaveCount(3);
  await expect(notice(page)).toHaveText('all 3 sentences are now shown.');
  await expect(showAllButton(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(reader(page)).toContainText("that's the whole lesson for now.");

  await backButton(page).click();
  await expect(backButton(page)).toBeFocused();
  await expect(sentences(page)).toHaveCount(2);
  await expect(notice(page)).toHaveText('back to 2 of 3.');
  await showAllButton(page).click();
  await expect(showAllButton(page)).toBeFocused();
  await expect(sentences(page)).toHaveCount(3);
});

for (const width of [390, 820, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`stepper ${width}px ${colorScheme}: touch targets, no motion, no overflow, axe`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 820 ? 1180 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto(path);
      const stepper = reader(page);
      await expect(sentences(page)).toHaveCount(1);
      for (const button of [backButton(page), nextButton(page), showAllButton(page)]) {
        const box = await button.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await nextButton(page).click();
      await expect(sentences(page)).toHaveCount(2);
      await showAllButton(page).click();
      await expect(sentences(page)).toHaveCount(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const moving = await stepper.locator('*').evaluateAll(elements => elements.some(el => {
        const style = getComputedStyle(el);
        const active = (value: string) => value.split(',').some(part => {
          const trimmed = part.trim();
          const seconds = trimmed.endsWith('ms') ? Number.parseFloat(trimmed) / 1000 : Number.parseFloat(trimmed);
          return seconds > 0.001;
        });
        return (style.animationName !== 'none' && active(style.animationDuration))
          || (style.transitionProperty !== 'none' && active(style.transitionDuration));
      }));
      expect(moving).toBe(false);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations).toEqual([]);
    });
  }
}

test('touch-only controls reveal the next sentence and show all', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL, hasTouch: true, viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.goto(path);
    await expect(sentences(page)).toHaveCount(1);
    await nextButton(page).tap();
    await expect(sentences(page)).toHaveCount(2);
    await showAllButton(page).tap();
    await expect(sentences(page)).toHaveCount(3);
    await expect(notice(page)).toHaveText('all 3 sentences are now shown.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
});

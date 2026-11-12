import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { sizeOf } from './projects';

const route = '/learn/study-skills/print-fill-in';
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const sampleAnswers = ['honey', 'days', 'pencil', 'umbrella'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('cueory-theme');
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch { /* Use the device theme when storage is unavailable. */ }
  });
});

test('sample worksheet contains blanks, not answers, and the answer key comes last', async ({ page }) => {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('[data-fill-in-sample-note]')).toBeVisible();

  const prompts = page.locator('[data-worksheet-item]');
  const answers = page.locator('[data-answer-item]');
  await expect(prompts).toHaveCount(4);
  await expect(answers).toHaveCount(4);
  await expect(page.locator('[data-worksheet-answers]')).toBeHidden();
  await expect(page.locator('[data-worksheet-blank]')).toHaveCount(4);
  const worksheetText = await page.locator('[data-worksheet]').innerText();
  for (const answer of sampleAnswers) expect(worksheetText.toLowerCase()).not.toContain(answer);
  await expect(answers).toHaveText(sampleAnswers);
  await expect(page.getByRole('link', { name: 'back to fill-in' })).toHaveAttribute('href', '/learn/study-skills/fill-in');
  await expect(page.locator('main button, main iframe')).toHaveCount(0);
});

test('printing starts the answer key on a new page in black and white', async ({ page }) => {
  await page.goto(route);
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  for (const selector of ['body > header', 'body > footer', '[data-print-hidden]']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  const answerSection = page.locator('[data-worksheet-answers]');
  await expect(answerSection).toBeVisible();
  await expect(answerSection).toHaveCSS('break-before', /^(page|always)$/);
  const worksheet = page.locator('[data-worksheet]');
  expect(await worksheet.evaluate((el) => el.compareDocumentPosition(document.querySelector('[data-worksheet-answers]')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  for (const prompt of await page.locator('[data-worksheet-item]').all()) {
    await expect(prompt).toHaveCSS('break-inside', 'avoid');
  }
  const colors = await page.evaluate(() => ({
    paper: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(document.querySelector<HTMLElement>('main h1')!).color,
  }));
  expect(colors).toEqual({ paper: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)' });
});

test('keyboard, touch, tap target and axe work across sizes and palettes', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const sizes = {
    phone: { width: 390, height: 844 },
    tablet: { width: 820, height: 1180 },
    desktop: { width: 1440, height: 900 },
  } as const;
  await page.setViewportSize(sizes[sizeOf(testInfo)]);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(route);
    const palette = await page.evaluate(() => ({
      choice: document.documentElement.getAttribute('data-theme'),
      page: getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim().toLowerCase(),
    }));
    expect(palette).toEqual({ choice: null, page: theme === 'dark' ? '#1c1917' : '#f9f5ef' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const link = page.getByRole('link', { name: 'back to fill-in' });
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    let reachedByTab = false;
    for (let index = 0; index < 16; index++) {
      await page.keyboard.press('Tab');
      if (await link.evaluate((el) => el === document.activeElement)) {
        reachedByTab = true;
        break;
      }
    }
    expect(reachedByTab, 'back link is reachable by keyboard Tab').toBe(true);
    await expect(link).toBeFocused();
    expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    const axe = await new AxeBuilder({ page }).withTags(axeTags).analyze();
    expect(axe.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);
    if (testInfo.project.use.hasTouch) await link.tap();
    else await link.click();
    await expect(page).toHaveURL(/\/learn\/study-skills\/fill-in\/?$/);
  }
});

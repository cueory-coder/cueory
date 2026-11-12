import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { runStaticCheckOnce, sizeOf } from './projects';

const route = '/learn/study-skills/print-cards';
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

// Keep a saved manual theme pick and the timed promo from obscuring the actual page under test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('cueory-theme');
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch { /* Device theme and the no-promo layout still work when storage is blocked. */ }
  });
});

test('printable cards are static, labeled and not indexed', async ({ page }, testInfo) => {
  runStaticCheckOnce(testInfo);
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.getByText('these cards are placeholders.')).toBeVisible();

  const cards = page.locator('[data-print-card]');
  await expect(cards).toHaveCount(3);
  await expect(cards.first().locator('[data-card-side="front"]')).toContainText('Placeholder card 1, front.');
  await expect(cards.first().locator('[data-card-side="back"]')).toContainText('Placeholder card 1, back.');
  await expect(page.getByRole('link', { name: 'back to cards' })).toHaveAttribute('href', '/learn/study-skills/cards');
  await expect(page.locator('main button, main [role="button"], main iframe')).toHaveCount(0);

});

test('the screen card sheet passes accessibility checks in each project', async ({ page }) => {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  const axe = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('printed cards keep both faces side by side, without site controls or clipping', async ({ page }) => {
  await page.goto(route);
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  await expect(page.locator('[data-print-hidden]')).toBeHidden();
  for (const selector of ['body > header', 'body > footer', 'body > a[href="#main"]']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  const cards = page.locator('[data-print-card]');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS('display', 'grid');
    await expect(card).toHaveCSS('break-inside', 'avoid');
    const bounds = await card.evaluate((el) => {
      const front = el.querySelector<HTMLElement>('[data-card-side="front"]')!.getBoundingClientRect();
      const back = el.querySelector<HTMLElement>('[data-card-side="back"]')!.getBoundingClientRect();
      return {
        sameRow: Math.abs(front.top - back.top) <= 1,
        sideBySide: back.left >= front.right,
        fitsWidth: back.right <= el.getBoundingClientRect().right + 1,
      };
    });
    expect(bounds).toEqual({ sameRow: true, sideBySide: true, fitsWidth: true });
  }
  const rowSpacing = await cards.nth(1).evaluate((element) =>
    getComputedStyle(element).marginBlockStart);
  expect(parseFloat(rowSpacing)).toBeGreaterThan(0);

  const colors = await page.evaluate(() => ({
    paper: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(document.querySelector<HTMLElement>('main h1')!).color,
  }));
  expect(colors).toEqual({ paper: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)' });

  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByRole('link', { name: 'back to cards' })).toBeVisible();
});

test('sheet works at phone, tablet and desktop in both palettes, with keyboard and tap', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const sizes = {
    phone: { width: 390, height: 844 },
    tablet: { width: 820, height: 1180 },
    desktop: { width: 1440, height: 900 },
  } as const;
  await page.setViewportSize(sizes[sizeOf(testInfo)]);

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    const palette = await page.evaluate(() => ({
      activeOverride: document.documentElement.getAttribute('data-theme'),
      page: getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim().toLowerCase(),
    }));
    expect(palette).toEqual({ activeOverride: null, page: theme === 'dark' ? '#1c1917' : '#f9f5ef' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const back = page.getByRole('link', { name: 'back to cards' });
    const box = await back.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    let reachedByTab = false;
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      if (await back.evaluate((element) => element === document.activeElement)) {
        reachedByTab = true;
        break;
      }
    }
    expect(reachedByTab, 'back link should be reachable by keyboard').toBe(true);
    await expect(back).toBeFocused();
    const focus = await back.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(focus).not.toBe('none');

    const axe = await new AxeBuilder({ page }).withTags(axeTags).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    if (testInfo.project.use.hasTouch) await back.tap();
    else await back.click();
    await expect(page).toHaveURL(/\/learn\/study-skills\/cards\/?$/);
  }
});

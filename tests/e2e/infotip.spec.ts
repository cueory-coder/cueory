import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/*
  The ⓘ button (src/components/InfoTip.astro, Christian, 2026-11-02): a description that still has value waits behind
  it. A real button with aria-expanded; a tap, a click, Enter or Space opens it, a second press or Escape closes it,
  and hovering never does.
*/

test.beforeEach(async ({ page }) => {
  // The once-only promo panel (D-59) would take focus part-way: start as if it had been shown.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

test('on a lesson page it opens and closes by keyboard and says whether it is open', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  const info = page.getByRole('button', { name: 'more about fill-in' });
  const panel = page.locator('#lesson-intro-info');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await expect(info).toHaveAttribute('aria-controls', 'lesson-intro-info');
  await expect(panel).toBeHidden();

  // Hovering alone never opens it.
  await info.hover();
  await expect(panel).toBeHidden();

  // The tap target is at least 44 px, though the icon is small.
  const box = await info.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await info.focus();
  await page.keyboard.press('Enter');
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveText('read each sentence and type the missing word. a hint shows its first letter.');
  const axe = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.keyboard.press('Enter');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();

  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expect(info).toBeFocused();

  // A tap or click opens it, and a second one closes it.
  await info.click();
  await expect(panel).toBeVisible();
  await info.click();
  await expect(panel).toBeHidden();
});

test('its focus ring shows, and with reduced motion nothing animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/learn/study-skills/organizer');
  const info = page.getByRole('button', { name: 'more about organizer' });
  await page.locator('main h1').click();
  await page.keyboard.press('Tab');
  await expect(info).toBeFocused();
  const ring = await info.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(ring).not.toBe('none');
  await page.keyboard.press('Enter');
  expect(await page.locator('#lesson-intro-info').evaluate((el) => el.getAnimations().length)).toBe(0);
});

test('each tile on the lesson hub has its own ⓘ, and opening one leaves the others closed', async ({ page }) => {
  await page.goto('/learn/study-skills');
  const cards = page.getByRole('button', { name: 'more about cards' });
  const learn = page.getByRole('button', { name: 'more about learn' });
  await cards.click();
  await expect(page.locator('#mode-tile-cards-info')).toHaveText('flip through the key ideas.');
  await expect(page.locator('#mode-tile-cards-info')).toBeVisible();
  await expect(learn).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#mode-tile-learn-info')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the ⓘ keeps its space but stays out of the way, since it could not open', async ({ page }) => {
    await page.goto('/learn/study-skills/fill-in');
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.locator('[data-infotip]')).toHaveCSS('visibility', 'hidden');
  });
});

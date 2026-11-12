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

test('tapping outside closes the active tip without stealing focus', async ({ page }) => {
  await page.goto('/learn/study-skills');
  const cards = page.getByRole('button', { name: 'more about cards' });
  const panel = page.locator('#mode-tile-cards-info');
  await cards.click();
  await expect(panel).toBeVisible();
  await panel.click();
  await expect(panel).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(panel).toBeHidden();
  await expect(cards).toHaveAttribute('aria-expanded', 'false');
});

test('one tip closes when another opens, and Escape also works from outside the panel', async ({ page }) => {
  await page.goto('/learn/study-skills');
  const cards = page.getByRole('button', { name: 'more about cards' });
  const learn = page.getByRole('button', { name: 'more about learn' });
  await cards.click();
  await learn.click();
  await expect(cards).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#mode-tile-cards-info')).toBeHidden();
  await expect(learn).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mode-tile-learn-info')).toBeVisible();
  await page.locator('main a').first().focus();
  await page.keyboard.press('Escape');
  await expect(learn).toHaveAttribute('aria-expanded', 'false');
  await expect(learn).toBeFocused();
});

test('new words in an open tip are politely announced, but closing clears the announcement', async ({ page }) => {
  await page.goto('/learn/study-skills');
  const button = page.getByRole('button', { name: 'more about cards' });
  const panel = page.locator('#mode-tile-cards-info');
  const live = page.locator('[data-infotip-live="mode-tile-cards-info"]');
  await expect(live).toHaveAttribute('role', 'status');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveAttribute('aria-atomic', 'true');
  await button.click();
  await expect(panel).toBeVisible();
  await expect(live).toBeEmpty();
  await panel.evaluate((element) => { element.textContent = '[sample updated tip]'; });
  await expect(live).toHaveText('[sample updated tip]');
  await panel.evaluate((element) => { element.textContent = '[sample second update]'; });
  await expect(live).toHaveText('[sample second update]');
  await button.click();
  await expect(live).toBeEmpty();
});

test('hidden tip details are announced only after becoming visible', async ({ page }) => {
  await page.goto('/learn/study-skills');
  const button = page.getByRole('button', { name: 'more about cards' });
  const panel = page.locator('#mode-tile-cards-info');
  const live = page.locator('[data-infotip-live="mode-tile-cards-info"]');
  await button.click();
  await expect(live).toBeEmpty();

  await panel.evaluate((element) => {
    const detail = document.createElement('span');
    detail.setAttribute('data-sample-detail', '');
    detail.textContent = '[sample newly visible detail]';
    detail.hidden = true;
    element.appendChild(detail);
  });
  await expect(live).toBeEmpty();
  await panel.locator('[data-sample-detail]').evaluate((element) => {
    (element as HTMLElement).hidden = false;
  });
  await expect(live).toContainText('[sample newly visible detail]');
  await button.click();
  await expect(live).toBeEmpty();
});

test('Escape from a focused control inside a tip returns focus to its info button', async ({ page }) => {
  await page.goto('/learn/study-skills');
  const button = page.getByRole('button', { name: 'more about cards' });
  const panel = page.locator('#mode-tile-cards-info');
  await button.click();
  await panel.evaluate((element) => {
    const link = document.createElement('a');
    link.href = '#main';
    link.textContent = '[sample related link]';
    element.appendChild(link);
  });
  const sampleLink = panel.getByRole('link', { name: '[sample related link]' });
  await sampleLink.focus();
  await expect(sampleLink).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
});

for (const width of [390, 820, 1440]) {
  for (const theme of ['Light', 'Dark']) {
    test('tip interactions pass axe and have no overflow at ' + width + 'px in ' + theme, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/learn/study-skills');
      const toggle = page.getByRole('contentinfo').locator('[data-footer-toggle]');
      await toggle.scrollIntoViewIfNeeded();
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      await page.getByRole('radio', { name: theme }).check();
      const info = page.getByRole('button', { name: 'more about cards' });
      const box = await info.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
      await info.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#mode-tile-cards-info')).toBeVisible();
      const report = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      expect(report.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

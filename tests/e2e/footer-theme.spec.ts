import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

// Task 85: the footer is one slim bar at the end of the page (flag, small logo, chevron); the chevron opens the links
// panel above it, which holds the motto, links, socials, contact email, copyright and the theme switch.

// Suppress the promo panel so it doesn't interfere with keyboard focus.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage blocked: panel never shows anyway.
    }
  });
});

const footerOf = (page: Page) => page.getByRole('contentinfo');
const chevron = (page: Page) => footerOf(page).locator('[data-footer-toggle]');

async function openFooterLinks(page: Page) {
  await chevron(page).scrollIntoViewIfNeeded();
  await expect(chevron(page)).toBeVisible();
  if ((await chevron(page).getAttribute('aria-expanded')) !== 'true') await chevron(page).click();
  await expect(chevron(page)).toHaveAttribute('aria-expanded', 'true');
}

test.describe('footer bar', () => {
  test('one slim bar at the end of the page: flag left, logo home in the middle, chevron right', async ({ page }) => {
    await page.goto('/privacy');
    const footer = footerOf(page);
    await expect(footer).toHaveCount(1);
    expect(await footer.evaluate((el) => getComputedStyle(el).position)).toBe('static');
    // In the page's flow, at its very end.
    expect(
      await footer.evaluate(
        (el) => el.getBoundingClientRect().bottom + window.scrollY >= document.documentElement.scrollHeight - 1,
      ),
    ).toBe(true);

    const flag = footer.getByRole('button', { name: 'flag or comment', exact: true });
    const home = footer.getByRole('link', { name: 'cueory, home', exact: true });
    const more = footer.getByRole('button', { name: 'more links', exact: true });
    await expect(flag).toBeVisible();
    await expect(home).toHaveAttribute('href', '/');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    // Icons only: no words in the corners.
    await expect(flag).toHaveText('');
    await expect(more).toHaveText('');

    const width = page.viewportSize()!.width;
    const flagBox = (await flag.boundingBox())!;
    const moreBox = (await more.boundingBox())!;
    const logoBox = (await home.locator('.logo').boundingBox())!;
    for (const box of [flagBox, moreBox]) {
      expect(Math.round(box.width)).toBe(48);
      expect(Math.round(box.height)).toBe(48);
    }
    expect(logoBox.width).toBeGreaterThanOrEqual(62);
    expect(logoBox.width).toBeLessThanOrEqual(70);
    expect(flagBox.x).toBeLessThan(width / 3);
    expect(moreBox.x).toBeGreaterThan((2 * width) / 3 - moreBox.width);
    expect(Math.abs(logoBox.x + logoBox.width / 2 - width / 2)).toBeLessThanOrEqual(2);
    // The bar's three controls share one row, about 56 px tall.
    const bar = (await footer.locator('[data-footer-toggle]').locator('..').boundingBox())!;
    expect(bar.height).toBeGreaterThanOrEqual(52);
    expect(bar.height).toBeLessThanOrEqual(60);
    for (const box of [flagBox, moreBox, logoBox]) {
      expect(box.y).toBeGreaterThanOrEqual(bar.y);
      expect(box.y + box.height).toBeLessThanOrEqual(bar.y + bar.height + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('every page has exactly one "flag or comment", in the footer, and it opens the report form', async ({ page }) => {
    for (const path of ['/', '/privacy', '/support']) {
      await page.goto(path);
      const flags = page.getByRole('button', { name: 'flag or comment', exact: true });
      await expect(flags).toHaveCount(1);
      await expect(page.getByRole('link', { name: 'flag or comment', exact: true })).toHaveCount(0);
      await expect(footerOf(page).getByRole('button', { name: 'flag or comment', exact: true })).toBeVisible();
      await flags.click();
      await expect(flags).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByTestId('flag-form')).toContainText('a free account is needed to send a report');
    }
  });

  test('the chevron opens and closes the links panel above the bar, by tap and by keyboard', async ({ page }) => {
    await page.goto('/privacy');
    const footer = footerOf(page);
    const panel = footer.locator('#site-footer-panel');
    await expect(panel).toBeHidden();
    await expect(footer.getByRole('link', { name: 'terms' })).toBeHidden();

    await chevron(page).click();
    await expect(chevron(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(chevron(page)).toHaveAccessibleName('fewer links');
    await expect(panel).toBeVisible();
    // Above the bar.
    expect((await panel.boundingBox())!.y).toBeLessThan((await chevron(page).boundingBox())!.y);
    for (const name of ['courses', 'coming soon', 'privacy', 'terms', 'disclaimer', 'support cueory', 'hello@cueory.app']) {
      await expect(footer.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(footer.getByText('by nursing students, for nursing students.', { exact: true })).toBeVisible();
    await expect(footer.getByText(/^© \d{4} cueory\. study help, not medical advice\.$/)).toBeVisible();
    await expect(footer.getByRole('group', { name: 'Theme' })).toBeVisible();

    await chevron(page).click();
    await expect(panel).toBeHidden();
    await expect(chevron(page)).toHaveAccessibleName('more links');

    // Keyboard: Enter opens it, and Tab follows the current footer link order.
    await chevron(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(footer.getByRole('link', { name: 'courses', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(footer.getByRole('link', { name: 'coming soon', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(footer.getByRole('link', { name: 'privacy', exact: true })).toBeFocused();
    await chevron(page).focus();
    await page.keyboard.press('Space');
    await expect(panel).toBeHidden();
  });

  test('the chevron turns without motion when reduced motion is on', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/privacy');
    const motion = await chevron(page)
      .locator('svg')
      .evaluate((el) => ({ property: getComputedStyle(el).transitionProperty, seconds: parseFloat(getComputedStyle(el).transitionDuration) }));
    expect(motion.property === 'none' || motion.seconds <= 0.001).toBe(true);
  });
});

test.describe('footer without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the links panel is simply open and the chevron keeps its space but stays hidden', async ({ page }) => {
    await page.goto('/privacy');
    const footer = footerOf(page);
    await expect(footer.locator('#site-footer-panel')).toBeVisible();
    await expect(footer.getByRole('link', { name: 'terms', exact: true })).toBeVisible();
    const flag = footer.getByRole('link', { name: 'flag or comment', exact: true });
    await expect(flag).toBeVisible();
    await expect(flag).toHaveAttribute('href', `mailto:hello@cueory.app?subject=${encodeURIComponent('flag or comment: /privacy')}`);
    await expect(chevron(page)).toBeHidden();
    expect((await chevron(page).evaluate((el) => el.getBoundingClientRect().width))).toBeGreaterThan(0);
  });
});

test.describe('footer theme picker', () => {
  test('theme switch updates the page and persists across navigation', async ({ page }) => {
    await page.goto('/');
    await openFooterLinks(page);
    const picker = page.getByRole('group', { name: 'Theme' });
    await expect(picker.getByRole('radio', { name: 'Follow device' })).toBeChecked();

    await picker.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Another page: the choice survives and the picker shows it.
    await page.goto('/privacy');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openFooterLinks(page);
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

    // Back to the device setting.
    await page.getByRole('radio', { name: 'Follow device' }).check();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  });

  test('a tap anywhere on a segment picks it', async ({ page }) => {
    await page.goto('/');
    await openFooterLinks(page);
    // Tap near the left edge at mid-height: a corner point lies outside the pill's rounded shape, where newer
    // Chromium hit-testing (CI) lands on the group instead of the segment.
    const segment = page.getByRole('group', { name: 'Theme' }).locator('label', { hasText: 'dark' });
    const box = (await segment.boundingBox())!;
    await segment.click({ position: { x: Math.min(10, box.width / 4), y: box.height / 2 } });
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('keyboard arrows move between theme options, with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    await openFooterLinks(page);
    const light = page.getByRole('radio', { name: 'Light' });
    const dark = page.getByRole('radio', { name: 'Dark' });
    const device = page.getByRole('radio', { name: 'Follow device' });

    await light.check();
    await light.focus();
    const ring = await light.evaluate((el) => getComputedStyle(el.closest('label')!).outlineStyle);
    expect(ring).toBe('solid');

    await page.keyboard.press('ArrowRight');
    await expect(dark).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(device).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect(dark).toBeChecked();
  });

  for (const size of [
    { width: 375, height: 812, label: 'phone' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 800, label: 'desktop' },
  ]) {
    for (const palette of [
      { name: 'Light', label: 'daytime' },
      { name: 'Dark', label: 'evening' },
    ]) {
      test(`axe clean with the links open, ${palette.label} palette, ${size.label} width`, async ({ page }, testInfo) => {
        test.skip(!isDesktopOfEachEngine(testInfo), 'sets its own sizes, so one project per engine is enough');
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto('/');
        await openFooterLinks(page);
        await page.getByRole('radio', { name: palette.name }).check();
        // The pill's colors ease over 150 ms (.segmented-option); check them once they have settled.
        await page.waitForFunction(() => document.querySelector('footer')!.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));

        const results = await new AxeBuilder({ page })
          .include('footer')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
      });
    }
  }
});

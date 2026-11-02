import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const preview = '/preview/states';

test.describe('Task 91: loading and empty states', () => {
  test('preview is unlisted and shows all variants', async ({ page }) => {
    await page.goto(preview);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { level: 1, name: 'loading and empty states' })).toBeVisible();
    await expect(page.locator('[data-skeleton-kind="lines"]')).toHaveCount(1);
    await expect(page.locator('[data-skeleton-kind="card"]')).toHaveCount(1);
    await expect(page.locator('[data-skeleton-kind="ring"]')).toHaveCount(1);
    await expect(page.locator('[data-empty-state]')).toHaveCount(4);
  });

  test('one accessible loading message per group, decorative shapes hidden', async ({ page }) => {
    await page.goto(preview);
    const groups = page.locator('[data-state-preview] [data-skeleton-kind]');
    await expect(groups).toHaveCount(3);
    for (const group of await groups.all()) {
      await expect(group).toHaveAttribute('role', 'status');
      await expect(group.locator('.sr-only')).toHaveCount(1);
      await expect(group.locator('.sr-only')).toHaveText('loading');
      await expect(group.locator('[aria-hidden="true"]')).toHaveCount(1);
    }
  });

  test('empty states have clear labels, optional icons and real navigation actions', async ({ page }) => {
    await page.goto(preview);
    const states = page.locator('[data-empty-state]');
    await expect(states.nth(0).getByRole('heading', { level: 3, name: 'nothing found.' })).toBeVisible();
    await expect(states.nth(0).locator('[data-empty-icon="search"]')).toHaveAttribute('aria-hidden', 'true');
    await expect(states.nth(1).getByRole('link')).toHaveCount(0);
    await expect(states.nth(3).locator('[data-empty-icon]')).toHaveCount(0);
    await expect(states.nth(3).getByRole('link')).toHaveCount(0);
    const action = states.nth(0).getByRole('link', { name: 'browse lessons' });
    await expect(action).toHaveAttribute('href', '/learn/study-skills');
    const size = await action.boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(44);
    expect(size!.width).toBeGreaterThanOrEqual(44);
    await action.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/learn\/study-skills$/);
  });

  test('reduced-motion mode never animates loading shapes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(preview);
    const names = await page.locator('[data-state-preview] .skeleton').evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).animationName),
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => name === 'none')).toBe(true);
  });

  test('both palettes have readable states and no accessibility violations', async ({ page }) => {
    await page.goto(preview);
    const backgrounds: string[] = [];
    // The theme switch lives in the footer's links panel (Task 85): open it first.
    const toggle = page.getByRole('contentinfo').locator('[data-footer-toggle]');
    await toggle.scrollIntoViewIfNeeded();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const choice of ['Light', 'Dark']) {
      await page.getByRole('radio', { name: choice }).check();
      const bg = await page.locator('[data-empty-state]').first().evaluate((node) => getComputedStyle(node).backgroundColor);
      backgrounds.push(bg);
      const results = await new AxeBuilder({ page })
        .include('[data-state-preview]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    }
    expect(backgrounds[0]).not.toBe(backgrounds[1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('no horizontal overflow even at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(preview);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

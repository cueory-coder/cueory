import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * Task 66: the /admin/flags inbox. Until Task 65's database functions are wired in, the real page refuses every
 * visitor. The table itself is checked on /preview/admin-flags, which mounts the same island with made-up sample rows
 * kept in the browser.
 */

const axe = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage blocked: the panel never shows anyway.
    }
  });
});

test.describe('/admin/flags, refused', () => {
  test('shows only the one sentence: no table, filter, buttons or counts', async ({ page }) => {
    await page.goto('/admin/flags');
    const main = page.locator('main#main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('this page is for the site owner.');
    await expect(main.locator('table, fieldset, [role="status"]')).toHaveCount(0);
    await expect(main.getByRole('button', { name: /mark handled|try again/ })).toHaveCount(0);
    await expect(main).not.toContainText(/report|handled|\d/);
    await axe(page);
  });

  test('is kept out of search engines', async ({ page }) => {
    await page.goto('/admin/flags');
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
  });

  for (const path of ['/', '/learn', '/play', '/support', '/privacy']) {
    test(`is not linked from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
    });
  }
});

test.describe('/admin/flags table (sample rows on the preview page)', () => {
  test('groups by question, filters open and handled, and passes axe', async ({ page }) => {
    await page.goto('/preview/admin-flags');
    const table = page.getByTestId('admin-flags-table');
    await expect(table).toBeVisible();
    await expect(page.getByRole('radio', { name: 'not handled' })).toBeChecked();

    const groups = page.getByTestId('admin-flags-group');
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toContainText('page reports (no question attached) · 1 report, 1 not handled');
    await expect(groups.nth(1)).toContainText('2 reports, 2 not handled');
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(3);
    await axe(page);

    await page.getByRole('radio', { name: 'handled', exact: true }).check();
    await expect(page.getByTestId('admin-flags-row')).toHaveCount(1);
    await expect(page.getByTestId('admin-flags-row')).toContainText('sample comment: already looked at.');
    await expect(page.getByRole('button', { name: /^mark handled/ })).toHaveCount(0);
    await axe(page);
  });

  test('scrolls the wide table inside its own box, so the page never gets wider than the screen', async ({ page }) => {
    await page.goto('/preview/admin-flags');
    await expect(page.getByTestId('admin-flags-row').first()).toBeVisible();
    const widths = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      screen: document.documentElement.clientWidth,
    }));
    expect(widths.page).toBeLessThanOrEqual(widths.screen);
  });

  test('shows a comment that looks like HTML as plain text', async ({ page }) => {
    await page.goto('/preview/admin-flags');
    const comment = page.getByTestId('admin-flags-comment').filter({ hasText: 'onerror' });
    await expect(comment).toHaveText('<img src=x onerror=alert(1)> sample comment written to look like html');
    await expect(page.getByTestId('admin-flags-table').locator('img')).toHaveCount(0);
  });

  test('mark handled works from the keyboard, updates the row and keeps focus on it', async ({ page }) => {
    await page.goto('/preview/admin-flags');
    const rows = page.getByTestId('admin-flags-row');
    await expect(rows).toHaveCount(3);
    const target = rows.filter({ hasText: 'something broken' });
    const button = target.getByRole('button', { name: /^mark handled/ });
    await button.focus();
    await page.keyboard.press('Enter');

    await expect(target).toContainText('handled');
    await expect(target.getByRole('button')).toHaveCount(0);
    await expect(target.locator('td:focus')).toHaveCount(1);
    await expect(page.getByRole('status')).toContainText('marked handled: something broken');
    await expect(page.getByTestId('admin-flags-group').nth(0)).toContainText('1 report, 0 not handled');
    // The row stays put until the filter changes, then moves to handled.
    await expect(rows).toHaveCount(3);
    await page.getByRole('radio', { name: 'handled', exact: true }).check();
    await expect(rows).toHaveCount(2);
    await page.getByRole('radio', { name: 'not handled' }).check();
    await expect(rows).toHaveCount(2);
    await axe(page);
  });

  test('every control is reachable with Tab, in order', async ({ page }) => {
    await page.goto('/preview/admin-flags');
    await expect(page.getByTestId('admin-flags-table')).toBeVisible();
    const radio = page.getByRole('radio', { name: 'not handled' });
    await radio.focus();
    const reached: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const name = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest('main')) return '';
        return el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 40) ?? '';
      });
      if (!name) break;
      reached.push(name);
    }
    expect(reached[0]).toBe('admin-flags-table');
    expect(reached.filter((n) => n.startsWith('mark handled'))).toHaveLength(3);
    expect(reached.filter((n) => n.startsWith('/'))).toHaveLength(3);
  });
});

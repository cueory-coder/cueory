import { expect, test } from '@playwright/test';

/**
 * The whole-body anatomy catalog has over 1,200 source structures. The first view must not render
 * every list button or make a keyboard user tab through the entire catalog before reaching the controls.
 */
test('whole-body catalog shows a bounded list, then moves focus to the first newly revealed structure', async ({ page }) => {
  await page.goto('/preview/anatomy-lab');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  // The combined system is added once the viewer reaches "open", not during WebGL startup.
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });

  const whole = page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body' });
  test.skip((await whole.count()) === 0, 'the real draft models are not present in this build');
  await whole.click();

  const list = page.getByRole('region', { name: 'structures' });
  await expect(list.locator('li')).toHaveCount(40);
  await expect(list.getByText(/^showing 40 of \d+ structures$/)).toBeVisible();
  await list.getByRole('button', { name: 'show 40 more structures' }).press('Enter');
  await expect(list.locator('li')).toHaveCount(80);
  await expect(list.locator('li').nth(40)).toBeFocused();

  // Search narrows the underlying full catalog, and clearing search returns to one page.
  const search = page.getByLabel('find a structure');
  await search.fill('not-an-anatomy-structure');
  await expect(list.locator('li')).toHaveCount(0);
  await expect(list.getByText('0 structures', { exact: true })).toBeVisible();
  await search.fill('');
  await expect(list.locator('li')).toHaveCount(40);
});

test('switching body systems clears the previous system\'s structure search', async ({ page }) => {
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });

  const picker = page.getByRole('group', { name: 'body system' });
  const buttons = picker.getByRole('button');
  test.skip((await buttons.count()) < 2, 'requires the fixture and another draft system');

  const list = page.getByRole('region', { name: 'structures' });
  const search = page.getByRole('searchbox', { name: 'find a structure' });
  await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
  await search.fill('fixture cube');
  await expect(list.locator('li')).toHaveCount(2);

  // The second system has different source labels. It should show all of them
  // without retaining a search typed for the fixture.
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('');
  await expect(list.locator('li').first()).toBeVisible();

  await buttons.first().click();
  await expect(search).toHaveValue('');
  await expect(list.locator('li')).toHaveCount(5);
});

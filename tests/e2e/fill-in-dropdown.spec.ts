import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked
    }
  });
});

test('fill-in dropdowns provide 4 options by default and allow toggling to type instead', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  const board = page.getByTestId('fill-in');

  // Dropdown should be default
  const dropdown = board.getByRole('combobox', { name: 'the missing word' });
  await expect(dropdown).toBeVisible();

  // Check 4 options + 1 placeholder = 5 options
  const options = dropdown.locator('option');
  await expect(options).toHaveCount(5);
  await expect(options.nth(0)).toHaveText('choose an answer...');

  // Toggle to type instead
  const toggle = board.getByRole('button', { name: 'type instead' });
  await expect(toggle).toBeVisible();
  await toggle.click();

  // Textbox is now visible
  const input = board.getByRole('textbox', { name: 'the missing word' });
  await expect(input).toBeVisible();
  await expect(board.getByRole('button', { name: 'choose from options' })).toBeVisible();

  // An answer typed outside the available options must not be submitted
  // invisibly when the student switches back to the dropdown.
  await input.fill('not a dropdown option');
  await board.getByRole('button', { name: 'choose from options' }).click();
  await expect(dropdown).toBeVisible();
  await expect(dropdown).toHaveValue('');
  await expect(board.getByRole('button', { name: 'check' })).toBeDisabled();

  // Select the correct answer from dropdown
  await dropdown.selectOption({ label: 'honey' });
  await board.getByRole('button', { name: 'check' }).click();

  // Spoken feedback and next button appear
  await expect(board.getByText('right.', { exact: true })).toBeVisible();
  const next = board.getByRole('button', { name: 'next' });
  await expect(next).toBeVisible();

  // Accessibility check on dropdown mode
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Advance to next item
  await next.click();
  await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
});

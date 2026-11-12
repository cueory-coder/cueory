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

test('a resumed free-text typo cannot be checked as a hidden dropdown answer', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  const board = page.getByTestId('fill-in');
  await board.getByRole('button', { name: 'type instead' }).click();
  const typed = board.getByRole('textbox', { name: 'the missing word' });
  await typed.fill('hnoey');
  await typed.press('Enter');
  await expect(board.getByText('almost. check the spelling.')).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null'));
  expect(saved.answers['item-0']).toEqual(['n:hnoey']);

  await page.reload();
  await page.getByRole('button', { name: 'continue question 1' }).click();
  const dropdown = board.getByRole('combobox', { name: 'the missing word' });
  await expect(dropdown).toBeVisible();

  // The restored typo is not any visible option. It must not be submitted.
  const check = board.getByRole('button', { name: 'check' });
  await expect(check).toBeDisabled();
  await dropdown.selectOption({ label: 'honey' });
  await expect(check).toBeEnabled();
  await check.click();
  await expect(board.getByText('right.', { exact: true })).toBeVisible();
});


test.use({ hasTouch: true });

for (const [size, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test('S6 dropdown keyboard and tap at ' + size + ' in ' + scheme, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/learn/study-skills/fill-in');
      const board = page.getByTestId('fill-in');
      const dropdown = board.getByRole('combobox', { name: 'the missing word' });
      await expect(dropdown).toBeVisible();
      const choices = await dropdown.locator('option').allTextContents();
      const wrongIndex = choices.findIndex((value, index) => index > 0 && value !== 'honey');
      expect(wrongIndex).toBeGreaterThan(0);
      await dropdown.focus();
      await expect(dropdown).toBeFocused();
      await dropdown.press('Home');
      for (let n = 0; n < wrongIndex; n++) await dropdown.press('ArrowDown');
      await expect(dropdown).toHaveValue(choices[wrongIndex]!);
      await board.getByRole('button', { name: 'check' }).press('Enter');
      await expect(board.getByText('the word was honey.')).toBeVisible();
      const next = board.getByRole('button', { name: 'next' });
      const box = await next.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((entry) => entry.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await next.tap();
      await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
    });
  }
}

test('S6 pre-existing n/h saved submissions resume with the same result', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  await page.evaluate(() => {
    localStorage.setItem('cueory-resume', JSON.stringify({
      version: 1, tool: 'fill-in', page: '/learn/study-skills/fill-in', step: 'advance-0',
      itemIndex: 0, itemId: 'item-0', totalItems: 4,
      answers: { 'item-0': ['n:honey'] }, timer: null, phase: 'working', savedAt: Date.now(),
    }));
  });
  await page.reload();
  const board = page.getByTestId('fill-in');
  await page.getByRole('button', { name: 'continue question 1' }).click();
  await expect(board.getByText('right.', { exact: true })).toBeVisible();
  await board.getByRole('button', { name: 'next' }).click();
  await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null'));
  expect(saved.answers.format).toBe('v2');
  expect(saved.answers['item-0']).toEqual(['l:honey']);
  await page.reload();
  await page.getByRole('button', { name: 'continue question 2' }).click();
  await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
});

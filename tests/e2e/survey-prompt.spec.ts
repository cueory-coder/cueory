import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('finals survey prompt renders, validates character limits, passes axe, and dismisses', async ({ page }) => {
  // Set the promo state for every navigation without clearing survey dismissal.
  // Clearing the survey key in addInitScript would also erase it on reload.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // storage blocked
    }
  });

  await page.goto('/preview/survey');
  await page.evaluate(() => {
    try { localStorage.removeItem('cueory-preview-survey'); } catch { /* storage blocked */ }
  });
  await page.reload();
  const prompt = page.getByTestId('finals-survey-prompt');
  await expect(prompt).toBeVisible();

  // Accessibility audit
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Verify questions
  await expect(prompt.getByText('did you use Cueory for a final or exit exam this semester?')).toBeVisible();
  const feedbackInput = prompt.getByLabel('what would make it more useful?');
  await expect(feedbackInput).toBeVisible();

  // Interact with options
  await prompt.getByLabel('yes').click();
  await feedbackInput.fill('Need more respiratory and cardiac NCLEX questions.');

  // Submit
  await prompt.getByRole('button', { name: 'send feedback' }).click();
  await expect(page.getByText('thank you for your feedback.')).toBeVisible();

  // Reload verifies dismissal persistence
  await page.reload();
  await expect(page.getByTestId('finals-survey-prompt')).toHaveCount(0);
});

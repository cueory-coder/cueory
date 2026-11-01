import { expect, test } from '@playwright/test';

// Every visual in content/visuals is still a draft (D-56), so the lesson page must look exactly as it did before the
// visuals component existed: no heading, no empty box, no credits line.
test('the study-skills lesson shows no visual and no credits while every visual is a draft', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-visual]')).toHaveCount(0);
  await expect(page.locator('[data-lesson-visuals]')).toHaveCount(0);
  await expect(page.locator('[data-visual-credits]')).toHaveCount(0);
  await expect(page.getByText('the license')).toHaveCount(0);
});

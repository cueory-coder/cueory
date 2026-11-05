import { expect, test } from '@playwright/test';

/**
 * The 3D canvas must keep touch gestures on the model even if inline styles
 * are unavailable under the site's strict content security policy.
 * The ?fixture route uses synthetic shapes, not released anatomy models.
 */
test('anatomy canvas keeps touch-action from its stylesheet, not only inline styles', async ({ page }) => {
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  // The canvas appears during lazy loading, before OrbitControls is ready.
  // Wait for a usable fixture structure so scene setup cannot race this check.
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });
  await expect(canvas).toHaveClass(/(?:^|\s)touch-none(?:\s|$)/);

  // Remove any inline touch-action installed by OrbitControls. Read the
  // inline and computed styles in the same browser task so this test cannot
  // pass just because the scene adds an inline declaration afterward.
  const touchAction = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    target.style.removeProperty('touch-action');
    return {
      inline: target.style.getPropertyValue('touch-action'),
      computed: getComputedStyle(target).touchAction,
    };
  });
  expect(touchAction).toEqual({ inline: '', computed: 'none' });
});

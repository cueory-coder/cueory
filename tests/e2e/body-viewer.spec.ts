import { expect, test } from '@playwright/test';

/**
 * E2E tests for the 3D body viewer (D-83).
 *
 * The viewer is lazy — three.js must not load before the student taps the button.
 * After tap, a placeholder model renders with OrbitControls and layer toggle buttons.
 */

test.describe('BodyViewer', () => {
  test('no three.js network request before the button is tapped', async ({ page }) => {
    const threeRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('three')) threeRequests.push(req.url());
    });

    await page.goto('/preview/body-viewer');
    // Wait for the island to hydrate (the "open the 3D view" button should appear).
    await expect(page.getByRole('button', { name: 'Open the 3D body viewer' })).toBeVisible();

    expect(threeRequests).toHaveLength(0);
  });

  test('canvas appears after tapping the open button', async ({ page }) => {
    await page.goto('/preview/body-viewer');
    await page.getByRole('button', { name: 'Open the 3D body viewer' }).click();

    // Loading spinner should appear then the canvas.
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  });

  test('layer buttons are visible with aria-pressed after the viewer loads', async ({ page }) => {
    await page.goto('/preview/body-viewer');
    await page.getByRole('button', { name: 'Open the 3D body viewer' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    for (const name of ['Skin', 'Muscle', 'Bone']) {
      const btn = page.getByRole('button', { name });
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('layer button toggles aria-pressed on click', async ({ page }) => {
    await page.goto('/preview/body-viewer');
    await page.getByRole('button', { name: 'Open the 3D body viewer' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    const boneBtn = page.getByRole('button', { name: 'Bone' });
    await expect(boneBtn).toHaveAttribute('aria-pressed', 'true');
    await boneBtn.click();
    await expect(boneBtn).toHaveAttribute('aria-pressed', 'false');
    await boneBtn.click();
    await expect(boneBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('keyboard activates the open button', async ({ page }) => {
    await page.goto('/preview/body-viewer');
    const openBtn = page.getByRole('button', { name: 'Open the 3D body viewer' });
    await openBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  });

  test('fits 320 px viewport without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/preview/body-viewer');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(320);
  });

  test('no CSP violations in console', async ({ page }) => {
    const cspErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().toLowerCase().includes('content security policy')) {
        cspErrors.push(msg.text());
      }
    });

    await page.goto('/preview/body-viewer');
    await page.getByRole('button', { name: 'Open the 3D body viewer' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    expect(cspErrors).toHaveLength(0);
  });
});

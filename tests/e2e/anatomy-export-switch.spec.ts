import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * Synthetic fixture test: delay the PNG canvas callback so a body-system click and
 * export completion occur in the same browser task, before a deferred React effect.
 */
test('switching body systems immediately invalidates the previous PNG export', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one PNG export race test per browser engine');

  await page.addInitScript(() => {
    const state = window as typeof window & {
      __cueoryPngHeld?: boolean;
      __cueoryPngRelease?: () => void;
    };
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (this.width === 1080 && this.height === 1080 && type === 'image/png') {
        state.__cueoryPngHeld = true;
        state.__cueoryPngRelease = () => callback(new Blob(['synthetic test bytes'], { type: 'image/png' }));
        return;
      }
      return original.call(this, callback, type, quality);
    };
  });

  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });

  const picker = page.getByRole('group', { name: 'body system' }).getByRole('button');
  // Draft system options must be present in this test build, not silently skipped.
  await expect.poll(() => picker.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.getByRole('button', { name: 'square 1080×1080' }).click();
  await expect.poll(
    () => page.evaluate(() => Boolean((window as typeof window & { __cueoryPngHeld?: boolean }).__cueoryPngHeld)),
  ).toBe(true);

  // Both events happen within the same browser task, before React's deferred effect.
  await picker.nth(1).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (window as typeof window & { __cueoryPngRelease?: () => void }).__cueoryPngRelease?.();
  });

  await expect(picker.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(200);
  expect(downloads).toBe(0);
  await expect(page.getByText(/^saved cueory-/)).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * Synthetic fixture only: delay the PNG canvas callback so a system-picker
 * click and the export's completion happen in the very same browser task.
 * This catches a race that ordinary delayed-network tests cannot reproduce.
 */
test('switching systems invalidates the previous PNG before React effects', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one export race check per browser engine');

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
  const fixture = page.getByRole('button', { name: 'fixture cube A', exact: true });
  await expect(fixture).toBeEnabled({ timeout: 20_000 });

  const picker = page.getByRole('group', { name: 'body system' }).getByRole('button');
  test.skip(await picker.count() < 2, 'requires a fixture and another draft body system');

  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.getByRole('button', { name: 'square 1080×1080' }).click();
  await expect.poll(
    () => page.evaluate(() => Boolean((window as typeof window & { __cueoryPngHeld?: boolean }).__cueoryPngHeld)),
  ).toBe(true);

  // Trigger both actions before React's deferred effect can invalidate the
  // old export. The click handler itself must invalidate the generation.
  await picker.nth(1).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (window as typeof window & { __cueoryPngRelease?: () => void }).__cueoryPngRelease?.();
  });

  await expect(picker.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(200);
  expect(downloads).toBe(0);
  await expect(page.getByText(/^saved cueory-/)).toHaveCount(0);
});

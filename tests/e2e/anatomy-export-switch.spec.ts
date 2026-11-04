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

test('switching systems during font preparation skips the obsolete PNG render', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one font-preparation race check per browser engine');
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });
  const picker = page.getByRole('group', { name: 'body system' }).getByRole('button');
  await expect.poll(() => picker.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

  await page.evaluate(() => {
    const state = window as typeof window & {
      __cueoryFontHolds?: number;
      __cueoryReleaseFonts?: () => void;
      __cueoryExport2dCalls?: number;
    };
    state.__cueoryFontHolds = 0;
    state.__cueoryExport2dCalls = 0;
    const originalLoad = document.fonts.load.bind(document.fonts);
    const releases: Array<() => void> = [];
    document.fonts.load = (font: string, text?: string): Promise<FontFace[]> => {
      if ((state.__cueoryFontHolds ?? 0) < 2) {
        state.__cueoryFontHolds = (state.__cueoryFontHolds ?? 0) + 1;
        return new Promise<FontFace[]>((resolve) => {
          // Finish the held requests immediately after switching systems.
          // Waiting for real fonts could let a broken export pass this test by accident.
          releases.push(() => resolve([]));
        });
      }
      return originalLoad(font, text);
    };
    state.__cueoryReleaseFonts = () => releases.splice(0).forEach((release) => release());

    // This context is requested immediately after font preparation and
    // before the expensive offscreen WebGL render or PNG encoding.
    const originalContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (kind === '2d' && this.width === 1080 && this.height === 1080) {
          state.__cueoryExport2dCalls = (state.__cueoryExport2dCalls ?? 0) + 1;
        }
        return Reflect.apply(originalContext, this, [kind, ...args]);
      },
    });
  });

  let downloads = 0;
  page.on('download', () => { downloads++; });
  try {
    await page.getByRole('button', { name: 'square 1080×1080' }).click();
    await expect.poll(() =>
      page.evaluate(() => (window as typeof window & { __cueoryFontHolds?: number }).__cueoryFontHolds),
    ).toBe(2);
    await picker.nth(1).click();
    await expect(picker.nth(1)).toHaveAttribute('aria-pressed', 'true');
  } finally {
    // Even a failed assertion must not strand document.fonts promises.
    await page.evaluate(() => {
      (window as typeof window & { __cueoryReleaseFonts?: () => void }).__cueoryReleaseFonts?.();
    });
  }

  await page.waitForTimeout(200);
  const largeCanvasCalls = await page.evaluate(() =>
    (window as typeof window & { __cueoryExport2dCalls?: number }).__cueoryExport2dCalls ?? 0);
  expect(largeCanvasCalls, 'a stale export must not start its 1080px canvas').toBe(0);
  expect(downloads).toBe(0);
  await expect(page.getByText(/^saved cueory-/)).toHaveCount(0);
});

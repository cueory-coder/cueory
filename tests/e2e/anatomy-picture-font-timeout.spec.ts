import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/** Only synthetic fixture geometry, never actual clinical or unpublished anatomy. */
test('exports an Anatomy Lab PNG when both browser font requests stall', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one image export per desktop browser engine');

  // Intercept only FontFaceSet.load(). CSS fonts and the 3D model still load normally.
  // The browser intentionally never settles either promise to reproduce an offline font stall.
  await page.addInitScript(() => {
    const requests: string[] = [];
    Object.defineProperty(document.fonts, 'load', {
      configurable: true,
      value: (declaration: string) => {
        requests.push(declaration);
        return new Promise<FontFace[]>(() => {});
      },
    });
    (window as Window & { __anatomyFontRequests?: string[] }).__anatomyFontRequests = requests;
  });

  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });

  // Without the deadline, no download fires and this test fails instead of hanging indefinitely.
  const downloadEvent = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('button', { name: 'phone 1080×1920' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('cueory-fixture-phone.png');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1920);
  await expect(page.getByText('saved cueory-fixture-phone.png.')).toBeVisible();

  const requests = await page.evaluate(
    () => (window as Window & { __anatomyFontRequests?: string[] }).__anatomyFontRequests ?? [],
  );
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatch(/^700 /);
  expect(requests[1]).toMatch(/^400 /);
});

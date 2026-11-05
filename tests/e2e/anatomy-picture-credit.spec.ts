import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

interface DrawnText {
  value: string;
  x: number;
  y: number;
  width: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Check the words actually drawn on exported PNGs and their horizontal bounds.
 * Models are the existing code-made fixture and a checked-in draft GLB, never new medical data.
 */
test('exported anatomy picture credit is complete, visible and model-specific', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one PNG export check per browser engine');

  await page.addInitScript(() => {
    const state = window as typeof window & { __cueoryPictureText?: DrawnText[] };
    state.__cueoryPictureText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, maxWidth) {
      state.__cueoryPictureText!.push({
        value: String(value),
        x,
        y,
        width: this.measureText(String(value)).width,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
      });
      if (maxWidth === undefined) return original.call(this, value, x, y);
      return original.call(this, value, x, y, maxWidth);
    };
  });

  const exportSquare = async (): Promise<DrawnText[]> => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'square 1080×1080' }).click();
    await download;
    return page.evaluate(() => (window as typeof window & { __cueoryPictureText?: DrawnText[] })
      .__cueoryPictureText ?? []);
  };

  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });

  const fixtureMarks = await exportSquare();
  const fixtureText = fixtureMarks.map((mark) => mark.value).join(' ');
  expect(fixtureText).toContain('test shapes made in code for automated tests');
  expect(fixtureText).not.toContain(LICENSE_URL);
  expect(fixtureText).not.toContain('© The Database Center for Life Science');

  // The existing small kidneys model exercises the real draft source-credit path.
  const kidney = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'kidneys and urinary tract', exact: true });
  await expect(kidney).toBeVisible();
  await kidney.click();
  // Wait for the real model load, not the previous fixture's briefly enabled export control.
  await expect(page.getByText(/^kidneys and urinary tract: \d+ structures loaded\.$/))
    .toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'square 1080×1080' }))
    .toBeEnabled({ timeout: 20_000 });
  await page.evaluate(() => {
    (window as typeof window & { __cueoryPictureText?: DrawnText[] }).__cueoryPictureText = [];
  });

  const anatomyMarks = await exportSquare();
  const anatomyText = anatomyMarks.map((mark) => mark.value).join(' ');
  expect(anatomyText).toContain('BodyParts3D');
  expect(anatomyText).toContain('© The Database Center for Life Science');
  expect(anatomyText).toContain('draft model, built from BodyParts3D 4.0');
  expect(anatomyText).not.toContain('test shapes made in code');

  // A long URI can span multiple credit lines. Read the uninterrupted drawn characters,
  // rather than requiring it to fit in one line, and verify each line stays inside the footer.
  const footer = anatomyMarks.filter((mark) =>
    mark.canvasWidth === 1080 &&
    mark.canvasHeight === 1080 &&
    mark.y >= mark.canvasHeight * 0.75 &&
    mark.x <= mark.canvasWidth * 0.1,
  );
  expect(footer.length).toBeGreaterThan(0);
  expect(footer.map((mark) => mark.value).join('')).toContain(LICENSE_URL);
  for (const line of footer) {
    expect(line.x + line.width).toBeLessThanOrEqual(line.canvasWidth - line.x + 1);
    expect(line.y).toBeLessThanOrEqual(line.canvasHeight - line.x + 1);
  }
});

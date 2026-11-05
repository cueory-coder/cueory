import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
// The exporter uses a 48px margin at the 1080px reference size and scales it
// with the picture's shorter side.
const EXPORT_EDGE_PADDING_RATIO = 48 / 1080;

interface DrawnText {
  value: string;
  x: number;
  y: number;
  width: number;
  ascent: number;
  descent: number;
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
      const metrics = this.measureText(String(value));
      state.__cueoryPictureText!.push({
        value: String(value),
        x,
        y,
        width: metrics.width,
        ascent: metrics.actualBoundingBoxAscent,
        descent: metrics.actualBoundingBoxDescent,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
      });
      if (maxWidth === undefined) return original.call(this, value, x, y);
      return original.call(this, value, x, y, maxWidth);
    };
  });

  const exportPicture = async (label: string): Promise<DrawnText[]> => {
    await page.evaluate(() => {
      (window as typeof window & { __cueoryPictureText?: DrawnText[] }).__cueoryPictureText = [];
    });
    await expect(page.getByRole('button', { name: label })).toBeEnabled({ timeout: 20_000 });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    await download;
    return page.evaluate(() => (window as typeof window & { __cueoryPictureText?: DrawnText[] })
      .__cueoryPictureText ?? []);
  };

  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });

  const fixtureMarks = await exportPicture('square 1080×1080');
  const fixtureText = fixtureMarks.map((mark) => mark.value).join(' ');
  expect(fixtureText).toContain('test shapes made in code for automated tests');
  expect(fixtureText).not.toContain(LICENSE_URL);
  expect(fixtureText).not.toContain('© The Database Center for Life Science');
  await expect(page.getByText('BodyParts3D reference model: adult human male')).toHaveCount(0);

  // The existing small kidneys model exercises the real draft source-credit path.
  const kidney = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'kidneys and urinary tract', exact: true });
  await expect(kidney).toBeVisible();
  await kidney.click();
  await expect(page.getByText('BodyParts3D reference model: adult human male')).toBeVisible();
  await expect(page.getByRole('link', { name: 'source details' })).toHaveAttribute(
    'href', 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html',
  );
  // Wait for the real model load, not the previous fixture's briefly enabled export control.
  await expect(page.getByText(/^kidneys and urinary tract: \d+ structures loaded\.$/))
    .toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'square 1080×1080' }))
    .toBeEnabled({ timeout: 20_000 });
  // Verify the actual canvas-drawn credit in every output aspect ratio.
  // The longer BodyParts3D source-scope note must fit without clipping.
  for (const size of [
    { label: 'phone 1080×1920', width: 1080, height: 1920 },
    { label: 'wide 1920×1080', width: 1920, height: 1080 },
    { label: 'square 1080×1080', width: 1080, height: 1080 },
  ] as const) {
    const anatomyMarks = await exportPicture(size.label);
    const anatomyText = anatomyMarks.map((mark) => mark.value).join(' ');
    expect(anatomyText, size.label).toContain('BodyParts3D');
    expect(anatomyText, size.label).toContain('© The Database Center for Life Science');
    expect(anatomyText, size.label).toContain('draft model, built from BodyParts3D 4.0');
    expect(anatomyText, size.label).toContain('BodyParts3D reference model: adult human male');
    expect(anatomyText, size.label).not.toContain('test shapes made in code');

    // A long license URL may wrap across lines. Keep every line on canvas.
    const footer = anatomyMarks.filter((mark) =>
      mark.canvasWidth === size.width &&
      mark.canvasHeight === size.height &&
      mark.y >= mark.canvasHeight * 0.75 &&
      mark.x <= mark.canvasWidth * 0.1,
    );
    const footerText = footer.map((mark) => mark.value).join('');
    expect(footer.length, size.label).toBeGreaterThan(0);
    expect(footerText, size.label).toContain(LICENSE_URL);
    expect(footerText, size.label).toContain('BodyParts3D reference model: adult human male');
    for (const line of footer) {
      // fillText's y is the alphabetic baseline. TextMetrics gives the actual
      // ink bounds above and below it; x must not be reused for vertical math.
      expect(Number.isFinite(line.ascent) && line.ascent > 0, size.label).toBe(true);
      expect(Number.isFinite(line.descent) && line.descent >= 0, size.label).toBe(true);
      const edgeMargin = Math.min(line.canvasWidth, line.canvasHeight) * EXPORT_EDGE_PADDING_RATIO;
      expect(line.x, size.label).toBeGreaterThanOrEqual(edgeMargin);
      expect(line.x + line.width, size.label).toBeLessThanOrEqual(line.canvasWidth - edgeMargin);
      // The exporter places the alphabetic baseline at the 48px scaled margin;
      // glyph descenders may extend into that padding but must remain on-canvas.
      expect(line.y, size.label).toBeLessThanOrEqual(line.canvasHeight - edgeMargin);
      expect(line.y - line.ascent, size.label).toBeGreaterThanOrEqual(0);
      expect(line.y + line.descent, size.label).toBeLessThanOrEqual(line.canvasHeight - 1);
    }
  }
});

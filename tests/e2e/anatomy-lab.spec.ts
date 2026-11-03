import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/**
 * The anatomy lab preview (Task 178), against the test fixture (?fixture): five shapes made in code, named "fixture
 * cube A" and so on, so these tests never depend on real anatomy. Nothing from three.js loads before the tap.
 */

const URL = '/preview/anatomy-lab?fixture';
const NAMES = ['fixture cube A', 'fixture cube B', 'fixture block C', 'fixture point D', 'fixture slab E'];

function watchCsp(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /content security policy|refused to/i.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

async function openLab(page: Page) {
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  // Every listed structure is enabled once the model has loaded.
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });
}

const list = (page: Page) => page.getByRole('region', { name: 'structures' });

test.describe('anatomy lab', () => {
  test('loads nothing from three.js before the tap, and is kept out of search engines', async ({ page }) => {
    const heavy: string[] = [];
    page.on('request', (req) => {
      if (/three|anatomyscene|\.glb/.test(req.url())) heavy.push(req.url());
    });
    await page.goto(URL);
    await expect(page.getByRole('button', { name: 'open the anatomy lab' })).toBeVisible();
    expect(heavy).toEqual([]);
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
  });

  test('without ?fixture the preview shows no fixture', async ({ page }) => {
    await page.goto('/preview/anatomy-lab');
    const open = page.getByRole('button', { name: 'open the anatomy lab' });
    // With no real systems in the build there is nothing to open; with some, the fixture isn't among them.
    await expect(open.or(page.getByText('no body systems yet.'))).toBeVisible();
    if (await open.isVisible()) {
      await open.click();
      await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('test shapes (fixture)')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'fixture cube A' })).toHaveCount(0);
    }
  });

  test('opens the fixture with its draft note, credit and release, and no CSP errors', async ({ page }) => {
    const csp = watchCsp(page);
    const glb: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('.glb')) glb.push(new globalThis.URL(req.url()).pathname);
    });
    await openLab(page);
    await expect(page.getByText('draft · labels waiting for review')).toBeVisible();
    await expect(page.getByText('test shapes made in code for automated tests: not anatomy, not from BodyParts3D')).toBeVisible();
    await expect(page.getByText('model release: fixture 1 (made in code)')).toBeVisible();
    await expect(page.locator('canvas')).toBeFocused();
    for (const name of NAMES) await expect(list(page).getByRole('button', { name, exact: true })).toBeVisible();
    expect(glb).toEqual(['/preview/anatomy-fixture/fixture.glb']);
    expect(csp).toEqual([]);
  });

  test('keyboard path: search, select from the list, name card, hide, show only, show all', async ({ page }) => {
    await openLab(page);
    await page.getByLabel('find a structure').focus();
    await page.keyboard.type('cube b');
    await expect(page.getByText('1 structure', { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    const cubeB = list(page).getByRole('button', { name: /^fixture cube B/ });
    await expect(cubeB).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(cubeB).toHaveAttribute('aria-pressed', 'true');
    const card = page.getByRole('region', { name: 'fixture cube B' });
    await expect(card).toBeVisible();
    await expect(card.getByText('name from the test fixture')).toBeVisible();

    // hide / show from the list's own button
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'hide fixture cube B' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(cubeB).toContainText('(hidden)');
    await page.getByRole('button', { name: 'show fixture cube B' }).press('Enter');
    await expect(cubeB).not.toContainText('(hidden)');

    await card.getByRole('button', { name: 'show only this' }).press('Enter');
    await page.getByLabel('find a structure').fill('');
    await expect(list(page).getByRole('button', { name: /\(hidden\)/ })).toHaveCount(4);
    await page.getByRole('button', { name: 'show all' }).press('Enter');
    await expect(list(page).getByRole('button', { name: /\(hidden\)/ })).toHaveCount(0);

    // turn and zoom from the keyboard on the canvas, then from the buttons
    await page.locator('canvas').focus();
    for (const key of ['ArrowLeft', 'ArrowUp', '+', '-']) await page.keyboard.press(key);
    await page.getByRole('button', { name: 'turn right' }).click();
    await page.getByRole('button', { name: 'reset view' }).click();
  });

  test('tapping the structure in the middle of the view selects it (raycasting)', async ({ page }) => {
    await openLab(page);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(list(page).getByRole('button', { name: 'fixture cube A', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'fixture cube A' })).toBeVisible();
  });

  test('labels toggle draws a label with a leader line for every visible structure', async ({ page }) => {
    await openLab(page);
    const labels = page.getByRole('button', { name: 'labels' });
    await expect(labels).toHaveAttribute('aria-pressed', 'false');
    await labels.click();
    await expect(labels).toHaveAttribute('aria-pressed', 'true');
    const overlay = page.getByTestId('anatomy-labels');
    await expect(overlay).toBeVisible();
    const shown = await overlay.locator('span').allTextContents();
    expect(shown.length).toBeGreaterThan(0);
    for (const text of shown) expect(NAMES).toContain(text);
    await expect(overlay.locator('line')).toHaveCount(shown.length);
    await labels.click();
    await expect(overlay).toHaveCount(0);
  });

  test('"find it": right and wrong answers in words and an icon, score, next and show me', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: 'start the quiz' }).click();
    const quiz = page.getByRole('region', { name: 'find it' });
    const prompt = quiz.getByText(/^find: /);
    const target = (await prompt.locator('strong').textContent())!;
    expect(NAMES).toContain(target);

    const wrong = NAMES.find((n) => n !== target)!;
    await list(page).getByRole('button', { name: wrong, exact: true }).click();
    await expect(quiz.locator('[data-feedback="wrong"]')).toContainText(`✗ not this one: you picked ${wrong}`);
    await expect(quiz.getByText('score: 0 of 1')).toBeVisible();

    await list(page).getByRole('button', { name: target, exact: true }).click();
    await expect(quiz.locator('[data-feedback="right"]')).toContainText(`✓ right: ${target}`);
    await expect(quiz.getByText('score: 0 of 1')).toBeVisible(); // only the first pick counts

    await quiz.getByRole('button', { name: 'next' }).click();
    const second = (await prompt.locator('strong').textContent())!;
    expect(second).not.toBe(target);
    await list(page).getByRole('button', { name: second, exact: true }).click();
    await expect(quiz.locator('[data-feedback="right"]')).toBeVisible();
    await expect(quiz.getByText('score: 1 of 2')).toBeVisible();

    await quiz.getByRole('button', { name: 'next' }).click();
    await quiz.getByRole('button', { name: 'show me' }).click();
    await expect(quiz.locator('[data-feedback="shown"]')).toContainText('here it is:');
    await expect(quiz.getByText('score: 1 of 3')).toBeVisible();
  });

  test('exports a phone picture as a 1080 × 1920 PNG with the right file name', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one export run per engine is enough');
    await openLab(page);
    await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'phone 1080×1920' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('cueory-fixture-fixture-cube-a-phone.png');
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1920);
    await expect(page.getByText('saved cueory-fixture-fixture-cube-a-phone.png')).toBeVisible();
  });

  test('fits a 320 px screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await openLab(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('has no accessibility violations, closed and open', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByRole('button', { name: 'open the anatomy lab' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
    await openLab(page);
    await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    await page.getByRole('button', { name: 'start the quiz' }).click();
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
  });
});

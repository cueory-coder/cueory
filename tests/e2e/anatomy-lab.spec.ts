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

  test('tapping a highlighted inner shape prefers it through a translucent outer shape', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one overlapping 3D pick test per browser engine');
    // No OrbitControls damping: each quarter-turn step reaches its exact angle
    // before checking overlap, instead of depending on animation timing in CI.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLab(page);
    // Block C overlaps the center ray from this side. Hide it so the
    // regression isolates cube A in front of the highlighted cube B.
    await list(page).getByRole('button', { name: 'hide fixture block C' }).click();
    // At a quarter turn the fixture's cube B sits behind the larger cube A.
    // The old nearest-only raycast picked A even when B was highlighted.
    const left = page.getByRole('button', { name: 'turn left' });
    for (let index = 0; index < 12; index++) await left.click();
    // Selecting from the structure list can scroll the page. Recalculate
    // canvas coordinates for each tap rather than reusing stale viewport pixels.
    const canvas = page.locator('canvas');
    const tapCenter = async () => {
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      if (!box) throw new Error('the fixture canvas is not visible');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    const cubeA = list(page).getByRole('button', { name: 'fixture cube A', exact: true });
    const cubeB = list(page).getByRole('button', { name: 'fixture cube B', exact: true });

    // Without a highlight the nearest outer mesh wins.
    await tapCenter();
    await expect(cubeA).toHaveAttribute('aria-pressed', 'true');
    // Picking cube B from the keyboard-accessible list fades A.
    await cubeB.click();
    await expect(cubeB).toHaveAttribute('aria-pressed', 'true');
    // Tapping the same projected point now picks the visibly opaque B,
    // rather than taking focus back to the translucent A.
    await tapCenter();
    await expect(cubeB).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'fixture cube B' })).toBeVisible();
  });

  test('labels toggle draws a label with a leader line for every visible structure', async ({ page }) => {
    await openLab(page);
    const labels = page.getByRole('button', { name: 'labels' });
    await expect(labels).toHaveAttribute('aria-pressed', 'false');
    await labels.click();
    await expect(labels).toHaveAttribute('aria-pressed', 'true');
    const overlay = page.getByTestId('anatomy-labels');
    await expect(overlay).toBeVisible();
    // Every one of the five shapes is in front from the starting view, so each gets a label and none is left out.
    await expect(overlay.locator(':scope > span')).toHaveCount(NAMES.length);
    const shown = await overlay.locator(':scope > span').allTextContents();
    expect([...shown].sort()).toEqual([...NAMES].sort());
    await expect(overlay.locator('line')).toHaveCount(shown.length);
    await expect(page.getByTestId('anatomy-label-note')).toHaveCount(0);
    await labels.click();
    await expect(overlay).toHaveCount(0);
  });

  test('marks the label of a structure hidden behind another, in words and with a dashed line', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: 'labels' }).click();
    // Twelve turns of 7.5° look from the side where cube A (40 units) stands in front of cube B (30 units).
    const left = page.getByRole('button', { name: 'turn left' });
    for (let i = 0; i < 12; i++) await left.click();
    const overlay = page.getByTestId('anatomy-labels');
    const cubeB = overlay.locator(':scope > span', { hasText: 'fixture cube B' });
    // The mark is in words, on the name's line or (in a narrow view) on a line of its own.
    await expect(cubeB).toContainText(/fixture cube B\s*\(behind\)/);
    await expect(cubeB).toHaveAttribute('data-behind', '');
    // The shapes above and below (D and E) are in nobody's shadow from that side. (Cube A is mostly hidden by block C
    // in perspective, so it may be marked too.)
    for (const name of ['fixture point D', 'fixture slab E']) {
      await expect(overlay.locator(':scope > span', { hasText: name })).not.toContainText('(behind)');
    }
    expect(await overlay.locator('g[data-behind] line').count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('anatomy-label-note')).toContainText('a label marked (behind) names a structure hidden behind others');
    // Back to the front, where every shape can be seen again.
    await page.getByRole('button', { name: 'reset view' }).click();
    await expect(overlay.locator(':scope > span[data-behind]')).toHaveCount(0);
  });

  test('layers: buttons show and hide each layer, and peel goes from the outside in, by keyboard', async ({ page }) => {
    await openLab(page);
    const layers = page.getByRole('group', { name: 'layers, skin to bone' });
    const vessels = layers.getByRole('button', { name: 'vessels (1)' });
    await expect(vessels).toHaveAttribute('aria-pressed', 'true');
    await vessels.press('Enter');
    await expect(vessels).toHaveAttribute('aria-pressed', 'false');
    await expect(list(page).getByRole('button', { name: /^fixture block C/ })).toContainText('(hidden)');
    await vessels.press('Enter');
    // Peel: vessels, then organs; the skeleton is never peeled, so the view is never empty.
    const peelButton = layers.getByRole('button', { name: /^peel a layer/ });
    await expect(peelButton).toHaveText('peel a layer: vessels');
    await peelButton.press('Enter');
    await expect(peelButton).toHaveText('peel a layer: organs');
    await peelButton.press('Enter');
    await expect(peelButton).toBeDisabled();
    await expect(list(page).getByRole('button', { name: /\(hidden\)/ })).toHaveCount(3);
    const back = layers.getByRole('button', { name: /^put a layer back/ });
    await expect(back).toHaveText('put a layer back: organs');
    await back.press('Enter');
    await back.press('Enter');
    await expect(back).toBeDisabled();
    await expect(list(page).getByRole('button', { name: /\(hidden\)/ })).toHaveCount(0);
    // The fixture is not a whole-body view, so it claims nothing about missing layers.
    await expect(page.getByTestId('anatomy-layer-gaps')).toHaveCount(0);
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

  test('find-it keeps asking its original targets after some become hidden', async ({ page }) => {
    await openLab(page);
    const quiz = page.getByRole('region', { name: 'find it' });
    await quiz.getByRole('button', { name: 'start the quiz' }).click();
    const prompt = quiz.getByText(/^find: /);
    const first = (await prompt.locator('strong').textContent())!;
    for (const name of NAMES.filter((n) => n !== first)) {
      await list(page).getByRole('button', { name: `hide ${name}` }).click();
    }
    // All remaining candidates were hidden, but the round must not end early.
    await quiz.getByRole('button', { name: 'next' }).click();
    const second = (await prompt.locator('strong').textContent())!;
    expect(second).not.toBe(first);
    // The next target is shown again so it can actually be found in 3D.
    await expect(list(page).getByRole('button', { name: `hide ${second}` })).toBeVisible();
  });

  test('can stop an active Find It round after all structures are hidden', async ({ page }) => {
    await openLab(page);
    const quiz = page.getByRole('region', { name: 'find it' });
    await quiz.getByRole('button', { name: 'start the quiz' }).click();
    for (const name of NAMES) {
      await list(page).getByRole('button', { name: `hide ${name}` }).click();
    }
    const stop = quiz.getByRole('button', { name: 'stop the quiz' });
    await expect(stop).toBeEnabled();
    await stop.click();
    const start = quiz.getByRole('button', { name: 'start the quiz' });
    await expect(start).toBeDisabled();
    await list(page).getByRole('button', { name: `show ${NAMES[0]}` }).click();
    await expect(start).toBeEnabled();
  });

  test('find-it does not add newly shown structures to the active round', async ({ page }) => {
    await openLab(page);
    const excluded = 'fixture slab E';
    await list(page).getByRole('button', { name: `hide ${excluded}` }).click();
    const quiz = page.getByRole('region', { name: 'find it' });
    await quiz.getByRole('button', { name: 'start the quiz' }).click();
    await list(page).getByRole('button', { name: `show ${excluded}` }).click();
    const prompt = quiz.getByText(/^find: /);
    const seen = new Set<string>();
    for (let i = 0; i < NAMES.length - 1; i++) {
      const target = (await prompt.locator('strong').textContent())!;
      expect(target).not.toBe(excluded);
      expect(seen.has(target)).toBe(false);
      seen.add(target);
      await quiz.getByRole('button', { name: 'next' }).click();
    }
    expect(seen.size).toBe(NAMES.length - 1);
    await expect(quiz.getByText(/^round done:/)).toBeVisible();
  });

  test('show me restores a hidden quiz target and keeps it highlighted through later controls', async ({ page }) => {
    await openLab(page);
    const quiz = page.getByRole('region', { name: 'find it' });
    await quiz.getByRole('button', { name: 'start the quiz' }).click();
    const target = (await quiz.getByText(/^find: /).locator('strong').textContent())!;
    expect(NAMES).toContain(target);

    // Hide the question's target before asking to see the answer.
    await list(page).getByRole('button', { name: `hide ${target}` }).click();
    await expect(list(page).getByRole('button', { name: `${target} (hidden)`, exact: true })).toBeVisible();
    await quiz.getByRole('button', { name: 'show me' }).click();
    await expect(quiz.locator('[data-feedback="shown"]')).toContainText(target);
    const targetButton = list(page).getByRole('button', { name: target, exact: true });
    await expect(targetButton).toHaveAttribute('aria-pressed', 'true');
    await expect(list(page).getByRole('button', { name: `hide ${target}` })).toBeDisabled();

    // Other structure selections cannot replace the revealed answer.
    const other = NAMES.find((name) => name !== target)!;
    await list(page).getByRole('button', { name: other, exact: true }).click();
    await expect(targetButton).toHaveAttribute('aria-pressed', 'true');

    // Hiding an entire layer after revealing an answer must not hide that answer.
    const layer = target.startsWith('fixture cube') ? 'organs' : target === 'fixture block C' ? 'vessels' : 'skeleton';
    const layerCount = layer === 'vessels' ? 1 : 2;
    await page.getByRole('group', { name: 'layers, skin to bone' })
      .getByRole('button', { name: `${layer} (${layerCount})`, exact: true }).click();
    await expect(targetButton).toHaveAttribute('aria-pressed', 'true');
    await expect(targetButton).not.toContainText('(hidden)');
  });

  test('a correct quiz pick unhides a structure hidden before it was found', async ({ page }) => {
    await openLab(page);
    const quiz = page.getByRole('region', { name: 'find it' });
    await quiz.getByRole('button', { name: 'start the quiz' }).click();
    const target = (await quiz.getByText(/^find: /).locator('strong').textContent())!;

    await list(page).getByRole('button', { name: `hide ${target}` }).click();
    await list(page).getByRole('button', { name: `${target} (hidden)`, exact: true }).click();
    await expect(quiz.locator('[data-feedback="right"]')).toContainText(target);
    await expect(list(page).getByRole('button', { name: target, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(list(page).getByRole('button', { name: `hide ${target}` })).toBeDisabled();
  });
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
    await expect(page.getByText('saved cueory-fixture-fixture-cube-a-phone.png.')).toBeVisible();

    // With labels on, a wide picture labels all five shapes: the note names none as left out.
    await page.getByRole('button', { name: 'clear selection' }).click();
    await page.getByRole('button', { name: 'labels' }).click();
    const wide = page.waitForEvent('download');
    await page.getByRole('button', { name: 'wide 1920×1080' }).click();
    expect((await wide).suggestedFilename()).toBe('cueory-fixture-wide.png');
    await expect(page.getByText(/^saved cueory-fixture-wide\.png\.$/)).toBeVisible();
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

test.describe('anatomy lab whole body loads layers on demand', () => {
  test('only the outer layer is requested at first; a deeper layer only when peeled to', async ({ page }) => {
    const glb: string[] = [];
    page.on('request', (req) => {
      if (/\.glb(\?|$)/.test(req.url())) glb.push(req.url().split('?')[0]!);
    });
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    const picker = page.getByRole('group', { name: 'body system' });
    test.skip((await picker.getByRole('button', { name: 'whole body' }).count()) === 0, 'no real whole-body models in this build');
    await page.waitForLoadState('networkidle');
    glb.length = 0;
    await picker.getByRole('button', { name: 'whole body' }).click();
    const note = page.getByTestId('anatomy-files');
    await expect(note).toContainText(/model files loaded: 1 of 11/, { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    expect(glb.map((p) => p.split('/').pop())).toEqual(['skin.glb']);
    glb.length = 0;
    const peelButton = page.getByRole('button', { name: /^peel a layer/ });
    await peelButton.press('Enter');
    await expect(note).toContainText(/model files loaded: [2-9] of 11/, { timeout: 20_000 });
    expect(glb.length).toBeGreaterThan(0);
    expect(glb.length).toBeLessThan(10);
    expect(glb.some((p) => p.endsWith('skin.glb'))).toBe(false);
  });

  test('show me reveals a loaded heart target without fetching the rest of its organ layer', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-model quiz reveal check per browser engine');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    const whole = page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body' });
    test.skip((await whole.count()) === 0, 'whole-body draft model is absent from this build');
    await whole.click();
    const files = page.getByTestId('anatomy-files');
    await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

    const layerControls = page.getByRole('group', { name: 'layers, skin to bone' });
    await layerControls.getByRole('button', { name: /^vessels \(/ }).press('Enter');
    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });

    // heart.glb is already loaded through the vessels layer, even though
    // other files that supply the organs layer are still absent.
    await page.getByLabel('find a structure').fill('heart');
    await expect(list(page).getByRole('button', { name: 'heart (hidden)', exact: true })).toBeEnabled();
    await list(page).getByRole('button', { name: 'heart (hidden)', exact: true }).click();
    await list(page).getByRole('button', { name: 'show heart', exact: true }).click();
    await page.getByRole('region', { name: 'heart' }).getByRole('button', { name: 'show only this' }).click();

    const quiz = page.getByRole('region', { name: 'find it' });
    await quiz.getByRole('button', { name: 'start the quiz' }).click();
    await expect(quiz.getByText('find: heart')).toBeVisible();
    await list(page).getByRole('button', { name: 'hide heart', exact: true }).click();
    await expect(list(page).getByRole('button', { name: 'heart (hidden)', exact: true })).toBeVisible();

    const extraRequests: string[] = [];
    page.on('request', (request) => {
      if (/\\.glb(?:\\?|$)/.test(request.url())) extraRequests.push(request.url());
    });
    await quiz.getByRole('button', { name: 'show me' }).click();
    await expect(quiz.locator('[data-feedback="shown"]')).toContainText('heart');
    await expect(list(page).getByRole('button', { name: 'heart', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(files).toContainText('model files loaded: 3 of 11');
    expect(extraRequests).toEqual([]);
  });

  test('the organs button loads missing files when only the heart is visible from the vessels layer', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-model download test per browser engine');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    const wholeBody = page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body' });
    test.skip((await wholeBody.count()) === 0, 'real whole-body draft models are not included in this build');
    await wholeBody.click();

    const files = page.getByTestId('anatomy-files');
    await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
    // The heart is a valid structure whose model has not yet been requested.
    // Its disabled list button must say this in its accessible name.
    await expect(list(page).getByRole('button', { name: 'heart (not loaded yet)', exact: true })).toBeDisabled();
    const layers = page.getByRole('group', { name: 'layers, skin to bone' });
    await layers.getByRole('button', { name: /^vessels \(/ }).press('Enter');
    // The vessels layer needs heart.glb as well as vessels.glb.
    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
    // Once heart.glb arrived via vessels, the name is present and its list
    // button is enabled (though it stays hidden until chosen).
    await expect(list(page).getByRole('button', { name: 'heart (hidden)', exact: true })).toBeEnabled();

    const showHeart = list(page).getByRole('button', { name: 'show heart', exact: true });
    await expect(showHeart).toBeVisible();
    await showHeart.press('Enter');
    const organs = layers.getByRole('button', { name: /^organs \(/ });
    await expect(organs).toHaveAttribute('aria-pressed', 'true');

    // Heart being visible does NOT mean the lungs, kidneys and digestive
    // models are loaded. The organs button must fetch them, not hide heart.
    await organs.press('Enter');
    await expect(files).toContainText('model files loaded: 6 of 11', { timeout: 20_000 });
    await expect(organs).toHaveAttribute('aria-pressed', 'true');
    await expect(list(page).getByRole('button', { name: 'hide heart', exact: true })).toBeVisible();
  });

});

test.describe('anatomy lab system switch', () => {
  test('the old model is not shown after switching, and a late layer from the old system changes nothing', async ({ page }) => {
    const release: Array<() => void> = [];
    // Hold every model file until the test lets it go, so the order of arrival is ours.
    await page.route(/\.glb(\?|$)/, async (route) => {
      await new Promise<void>((resolve) => release.push(resolve));
      await route.continue();
    });
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    const picker = page.getByRole('group', { name: 'body system' });
    const buttons = picker.getByRole('button');
    test.skip((await buttons.count()) < 2, 'no real models in this build');
    await expect.poll(() => release.length).toBeGreaterThan(0);
    release.splice(0).forEach((r) => r());
    await expect(page.getByText(/^loading /)).toHaveCount(0, { timeout: 20_000 });
    await buttons.nth(1).click();
    // Held download of the new system: the old model must already be gone, and the loading state shown.
    await expect(page.getByText(/^loading /).first()).toBeVisible();
    await expect(list(page).getByRole('button').first()).toBeDisabled();
    release.splice(0).forEach((r) => r());
    await expect(page.getByText(/^loading /)).toHaveCount(0, { timeout: 20_000 });
  });
});

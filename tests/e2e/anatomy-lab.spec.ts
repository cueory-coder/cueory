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

  test('keeps camera controls disabled until the fixture GLB finishes loading', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one readiness regression per browser engine');
    const releases: Array<() => void> = [];
    await page.route('**/preview/anatomy-fixture/fixture.glb', async (route) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      await route.continue();
    });
    await page.goto(URL);
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect.poll(() => releases.length, { timeout: 20_000 }).toBe(1);
    const view = page.getByRole('group', { name: 'view' });
    const controls = ['turn left', 'turn right', 'tilt up', 'tilt down', 'zoom in', 'zoom out', 'reset view'];
    try {
      for (const name of controls) await expect(view.getByRole('button', { name, exact: true })).toBeDisabled();
      const consumed = await page.locator('canvas').evaluate((canvas) => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
        canvas.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(consumed).toBe(false);
    } finally {
      // Always release the held request, even if a readiness assertion fails.
      releases.splice(0).forEach((release) => release());
    }
    await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
      .toBeEnabled({ timeout: 20_000 });
    for (const name of controls) await expect(view.getByRole('button', { name, exact: true })).toBeEnabled();
    const consumedWhenReady = await page.locator('canvas').evaluate((canvas) => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(consumedWhenReady).toBe(true);
  });

  test('keeps camera controls disabled after a fixture model download fails', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one failure regression per browser engine');
    await page.route('**/preview/anatomy-fixture/fixture.glb', (route) => route.abort('failed'));
    await page.goto(URL);
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'could not load test shapes (fixture).' }))
      .toBeVisible({ timeout: 20_000 });
    const view = page.getByRole('group', { name: 'view' });
    for (const name of ['turn left', 'turn right', 'tilt up', 'tilt down', 'zoom in', 'zoom out', 'reset view']) {
      await expect(view.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    const consumed = await page.locator('canvas').evaluate((canvas) => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(consumed).toBe(false);
  });

  test('keeps a searchable, keyboard-accessible text catalog if WebGL is unavailable', async ({ page }) => {
    // Simulate a device whose canvas can render text but cannot create a 3D context.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: function (this: HTMLCanvasElement, ...args: unknown[]) {
          if (typeof args[0] === 'string' && args[0].startsWith('webgl')) return null;
          return Reflect.apply(original, this, args);
        },
      });
    });
    const glb: string[] = [];
    page.on('request', (request) => {
      if (new globalThis.URL(request.url()).pathname.endsWith('.glb')) glb.push(request.url());
    });

    await page.goto(URL);
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    const error = page.getByRole('alert');
    await expect(error).toContainText('the 3D anatomy lab could not open.');
    await expect(page.getByRole('heading', { name: 'the 3D anatomy lab could not open.' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'try 3D again' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'browse the lessons' })).toHaveAttribute('href', '/learn');
    const catalog = page.getByRole('region', { name: 'structure names: test shapes (fixture)' });
    await expect(catalog).toBeVisible();
    await expect(catalog.getByText('draft · labels waiting for review')).toBeVisible();
    await expect(catalog.getByText('name from the test fixture')).toBeVisible();
    const fixtureCredit = catalog.getByTestId('anatomy-fallback-attribution');
    await expect(fixtureCredit).toContainText('test shapes made in code for automated tests: not anatomy, not from BodyParts3D');
    await expect(fixtureCredit).toContainText('model release: fixture 1 (made in code)');
    await expect(catalog.getByRole('status')).toHaveText('showing 5 of 5 matching structures');

    const search = catalog.getByLabel('find a structure');
    await search.fill('cube b');
    await expect(catalog.getByRole('status')).toHaveText('showing 1 of 1 matching structures');
    await expect(catalog.getByRole('listitem')).toHaveCount(1);
    await expect(catalog.getByRole('listitem').first()).toContainText('fixture cube B');
    await expect(catalog.getByText('fixture cube A')).toHaveCount(0);
    // Source IDs work in the text-only fallback even when copied with separators.
    await search.fill('FIX 002');
    await expect(catalog.getByRole('listitem')).toHaveCount(1);
    await expect(catalog.getByRole('listitem').first()).toContainText('fixture cube B');
    await search.fill('not a structure');
    await expect(catalog.getByText('no structure names or source IDs match this search.')).toBeVisible();

    // A failed 3D startup must not take away the combined text catalog or its required attribution.
    const wholeBody = page.getByRole('button', { name: 'whole body', exact: true });
    await expect(wholeBody).toBeVisible();
    await wholeBody.click();
    await expect(wholeBody).toHaveAttribute('aria-pressed', 'true');
    const wholeCatalog = page.getByRole('region', { name: 'structure names: whole body' });
    await expect(wholeCatalog.getByRole('status')).toContainText('matching structures');
    const bodyCredit = wholeCatalog.getByTestId('anatomy-fallback-attribution');
    await expect(bodyCredit).toContainText('3D model: Cueory, adapted from BodyParts3D');
    await expect(bodyCredit).toContainText('draft model, built from BodyParts3D 4.0');
    await expect(bodyCredit).toContainText('BodyParts3D reference model: adult human male');
    await expect(bodyCredit.getByRole('link', { name: 'source details' })).toHaveAttribute(
      'href', 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html',
    );
    await expect(bodyCredit.getByRole('link', { name: 'CC Attribution 4.0 International' }))
      .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    await expect(bodyCredit.getByRole('link', { name: 'CC Attribution 4.0 International' }))
      .toHaveAttribute('rel', 'license noopener');
    expect(glb).toEqual([]);
  });

  test('retains searchable structure names after WebGL context loss and can reopen 3D', async ({ page }) => {
    await openLab(page);
    // A phone may lose its GPU context while a pointer remains down on the canvas.
    await page.locator('canvas').dispatchEvent('pointerdown', { pointerId: 71, clientX: 12, clientY: 12 });
    const prevented = await page.locator('canvas').evaluate((canvas) => {
      const event = new Event('webglcontextlost', { cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);

    await expect(page.getByRole('alert')).toContainText('the 3D anatomy lab could not open.');
    const catalog = page.getByRole('region', { name: 'structure names: test shapes (fixture)' });
    await expect(catalog).toBeVisible();
    await expect(catalog.getByRole('status')).toHaveText('showing 5 of 5 matching structures');
    await catalog.getByLabel('find a structure').fill('cube a');
    await expect(catalog.getByRole('listitem')).toHaveCount(1);
    await expect(catalog.getByRole('listitem').first()).toContainText('fixture cube A');
    // This must remain identified as a synthetic test model, not reviewed clinical anatomy.
    await expect(page.getByText('test shapes made in code for automated tests: not anatomy, not from BodyParts3D')).toBeVisible();

    await page.getByRole('button', { name: 'try 3D again' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    const cubeA = list(page).getByRole('button', { name: 'fixture cube A', exact: true });
    await expect(cubeA).toBeEnabled({ timeout: 20_000 });
    await cubeA.click();
    await expect(cubeA).toHaveAttribute('aria-pressed', 'true');
  });

  test('clears stale readiness before the WebGL retry model-load effect runs', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one retry-state check per browser engine');
    await openLab(page);
    const cube = page.getByRole('region', { name: 'structures' })
      .getByRole('button', { name: 'fixture cube A', exact: true });
    await cube.click();
    await expect(page.getByRole('region', { name: 'fixture cube A' })).toBeVisible();
    const prevented = await page.locator('canvas').evaluate((canvas) => {
      const lost = new Event('webglcontextlost', { cancelable: true });
      canvas.dispatchEvent(lost);
      return lost.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await expect(page.getByRole('button', { name: 'try 3D again' })).toBeVisible();

    // Freeze only the retry's scheduled open-frame callback and its 250 ms
    // background-tab fallback. The new model-load effect cannot run until we
    // explicitly release that frame, so the following assertions fail on the
    // old implementation even though its later effect also resets the state.
    await page.evaluate(() => {
      type RetryWindow = Window & {
        __anatomyOpeningFrameHeld?: boolean;
        __anatomyResumeOpening?: () => void;
      };
      const realRaf = window.requestAnimationFrame.bind(window);
      const realTimeout = window.setTimeout.bind(window);
      let heldFrame: FrameRequestCallback | null = null;
      let heldFallback: (() => void) | null = null;
      window.requestAnimationFrame = (callback) => {
        if (!heldFrame) {
          heldFrame = callback;
          (window as RetryWindow).__anatomyOpeningFrameHeld = true;
          return 1_000_000;
        }
        return realRaf(callback);
      };
      window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (ms === 250 && !heldFallback) {
          heldFallback = () => {
            if (typeof handler === 'function') handler(...args);
          };
          return 1_000_001;
        }
        return realTimeout(handler, ms, ...args);
      }) as typeof window.setTimeout;
      (window as RetryWindow).__anatomyResumeOpening = () => {
        window.requestAnimationFrame = realRaf;
        window.setTimeout = realTimeout;
        if (heldFrame) realRaf(heldFrame);
        else heldFallback?.();
      };
      const retry = [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'try 3D again');
      if (!retry) throw new Error('No 3D retry button is available');
      // Native click avoids Playwright actionability waits needing the held RAF.
      retry.click();
    });
    try {
      await expect.poll(
        () => page.evaluate(() => (window as Window & { __anatomyOpeningFrameHeld?: boolean }).__anatomyOpeningFrameHeld),
      ).toBe(true);
      await expect(page.locator('canvas')).toBeVisible();
      await expect(page.getByRole('region', { name: 'fixture cube A' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'start the quiz' })).toBeDisabled();
      await expect(page.getByRole('region', { name: 'structures' })
        .getByRole('button', { name: 'fixture cube A', exact: true })).toBeDisabled();
    } finally {
      // Do not leave a frozen requestAnimationFrame even if an assertion fails.
      await page.evaluate(() => {
        (window as Window & { __anatomyResumeOpening?: () => void }).__anatomyResumeOpening?.();
      });
    }
    await expect(page.getByRole('button', { name: 'start the quiz' }))
      .toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole('region', { name: 'structures' })
      .getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled();
  });


  test('never saves a delayed picture after WebGL context loss', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one context-loss export race per browser engine');
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        if (this.width === 1080 && this.height === 1080 && type === 'image/png') {
          (window as Window & { __finishLostContextPicture?: () => void }).__finishLostContextPicture =
            () => callback(new Blob(['synthetic image bytes'], { type: 'image/png' }));
          return;
        }
        return original.call(this, callback, type, quality);
      };
    });
    await openLab(page);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole('button', { name: 'square 1080×1080' }).click();
    await expect.poll(() => page.evaluate(
      () => typeof (window as Window & { __finishLostContextPicture?: () => void }).__finishLostContextPicture,
    )).toBe('function');

    // Lose the GPU and finish the held PNG within one browser task.
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const finish = (window as Window & { __finishLostContextPicture?: () => void }).__finishLostContextPicture;
      if (!canvas || !finish) throw new Error('Missing the active 3D view or held export.');
      const event = new Event('webglcontextlost', { cancelable: true });
      canvas.dispatchEvent(event);
      if (!event.defaultPrevented) throw new Error('WebGL context loss was not handled.');
      finish();
    });
    await expect(page.getByRole('alert')).toContainText('the 3D anatomy lab could not open.');
    await page.waitForTimeout(100);
    expect(downloads).toEqual([]);
    await expect(page.getByText(/^saved cueory-fixture-square/)).toHaveCount(0);
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
    const structureSearch = page.getByLabel('find a structure');
    await structureSearch.fill('FIX-002');
    await expect(list(page).getByRole('button', { name: 'fixture cube B', exact: true })).toBeVisible();
    await expect(page.getByText('1 structure', { exact: true })).toBeVisible();
    await structureSearch.fill('');
    await structureSearch.focus();
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

  test('switching body systems clears a stale search but reselecting the same system does not', async ({ page }) => {
    await openLab(page);
    // The picker is composed after the canvas finishes opening, not when it first appears.
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const search = page.getByLabel('find a structure');
    const picker = page.getByRole('group', { name: 'body system' });
    const whole = picker.getByRole('button', { name: 'whole body', exact: true });
    await expect(whole).toBeVisible({ timeout: 15_000 });

    await search.fill('fixture cube B');
    await expect(list(page).getByRole('button', { name: 'fixture cube B', exact: true })).toBeVisible();
    await expect(list(page).getByText('1 structure', { exact: true })).toBeVisible();

    // A fixture-only search must not follow the student into the whole-body list.
    await whole.click();
    await expect(search).toHaveValue('');
    await expect(list(page).locator('li').first()).toBeVisible();

    // Clicking the already-selected system isn't a new system choice.
    await search.fill('no-such-structure');
    await expect(list(page).getByText('0 structures', { exact: true })).toBeVisible();
    await whole.click();
    await expect(search).toHaveValue('no-such-structure');

    // Changing back restores the fixture's unfiltered five-name list.
    await picker.getByRole('button', { name: 'test shapes (fixture)', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(list(page).getByRole('button', { name: 'fixture cube A', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(list(page).getByText('5 structures', { exact: true })).toBeVisible();
  });

  test('secondary and middle mouse clicks do not clear a selected structure', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one pointer-button regression per browser engine');
    await openLab(page);
    const cube = list(page).getByRole('button', { name: 'fixture cube A', exact: true });
    await cube.click();
    await expect(cube).toHaveAttribute('aria-pressed', 'true');
    const nameCard = page.getByRole('region', { name: 'fixture cube A' });
    await expect(nameCard).toBeVisible();

    // Select a real fixture first. A non-primary click near the canvas edge
    // previously raycast (often to nothing) and silently cleared selection.
    const canvas = page.locator('canvas');
    for (const button of ['right', 'middle'] as const) {
      await canvas.click({ button, position: { x: 3, y: 3 } });
      await expect(cube, `${button} click must not change the selected mesh`)
        .toHaveAttribute('aria-pressed', 'true');
      await expect(nameCard).toBeVisible();
    }
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

  test('re-measures visible labels after a larger-text setting changes without a viewport resize', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one text-size reflow check per browser engine');
    await openLab(page);
    await page.getByRole('button', { name: 'fixture cube A', exact: true }).click();
    await page.getByRole('button', { name: 'show only this' }).click();
    await page.getByRole('button', { name: 'labels' }).click();
    const label = page.getByTestId('anatomy-labels').locator(':scope > span');
    await expect(label).toHaveCount(1);
    const before = await label.evaluate((node) => ({
      fontPx: Number.parseFloat(getComputedStyle(node).fontSize),
      height: Number.parseFloat((node as HTMLElement).style.height),
    }));
    expect(before.height).toBeGreaterThan(0);

    // The viewport stays fixed; text and token-backed padding must be measured again.
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
    await expect(page.locator('html')).toHaveCSS('font-size', '32px');
    await expect.poll(() => label.evaluate((node) => Number.parseFloat((node as HTMLElement).style.height)))
      .toBeGreaterThan(before.height * 1.5);
    const enlarged = await label.evaluate((node) => {
      const element = node as HTMLElement;
      return {
        fontPx: Number.parseFloat(getComputedStyle(element).fontSize),
        height: Number.parseFloat(element.style.height),
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });
    expect(enlarged.fontPx).toBeGreaterThan(before.fontPx * 1.5);
    expect(enlarged.scrollHeight).toBeLessThanOrEqual(enlarged.clientHeight + 2);

    // Restoring the standard size must not leave oversized cached label boxes.
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await expect.poll(() => label.evaluate((node) => Number.parseFloat((node as HTMLElement).style.height)))
      .toBeLessThan(enlarged.height * 0.8);
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

  test('"find it": unscored feedback, next, and show me', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: 'start the quiz' }).click();
    const quiz = page.getByRole('region', { name: 'find it' });
    const prompt = quiz.getByText(/^find: /);
    const target = (await prompt.locator('strong').textContent())!;
    expect(NAMES).toContain(target);

    const wrong = NAMES.find((n) => n !== target)!;
    await list(page).getByRole('button', { name: wrong, exact: true }).click();
    await expect(quiz.locator('[data-feedback="wrong"]')).toContainText(`✗ not this one: you picked ${wrong}`);
    await expect(quiz.getByText(/^score:/)).toHaveCount(0);

    await list(page).getByRole('button', { name: target, exact: true }).click();
    await expect(quiz.locator('[data-feedback="right"]')).toContainText(`✓ right: ${target}`);
    await expect(quiz.getByText('guided practice — use the named list or 3D view. this is not a scored assessment.')).toBeVisible();

    await quiz.getByRole('button', { name: 'next' }).click();
    const second = (await prompt.locator('strong').textContent())!;
    expect(second).not.toBe(target);
    await list(page).getByRole('button', { name: second, exact: true }).click();
    await expect(quiz.locator('[data-feedback="right"]')).toBeVisible();
    await expect(quiz.getByText(/^score:/)).toHaveCount(0);

    await quiz.getByRole('button', { name: 'next' }).click();
    await quiz.getByRole('button', { name: 'show me' }).click();
    await expect(quiz.locator('[data-feedback="shown"]')).toContainText('here it is:');
    await expect(quiz.getByText(/^score:/)).toHaveCount(0);
  });

  test('a named-list keyboard answer is guided practice, not a scored anatomy identification', async ({ page }) => {
    await openLab(page);
    const quiz = page.getByRole('region', { name: 'find it' });
    await quiz.getByRole('button', { name: 'start the quiz' }).click();
    const target = (await quiz.getByText(/^find: /).locator('strong').textContent())!;

    // The accessible list exposes the target's name. This supports practice
    // but cannot establish an unaided 3D-identification score.
    await page.getByRole('searchbox', { name: 'find a structure' }).fill(target);
    const targetButton = list(page).getByRole('button', { name: target, exact: true });
    await expect(targetButton).toBeVisible();
    await targetButton.focus();
    await page.keyboard.press('Enter');

    await expect(quiz.locator('[data-feedback="right"]')).toContainText(`right: ${target}`);
    await expect(quiz.getByText('guided practice — use the named list or 3D view. this is not a scored assessment.')).toBeVisible();
    await expect(quiz.getByText(/^score:/)).toHaveCount(0);
    const announcements = await quiz.locator('[aria-live="polite"]').allTextContents();
    expect(announcements.join(' ')).not.toMatch(/score:|right the first time/i);

    await quiz.getByRole('button', { name: 'next' }).click();
    await expect(quiz.getByText(/^score:/)).toHaveCount(0);
    await quiz.getByRole('button', { name: 'stop the quiz' }).click();
    await expect(quiz.getByRole('button', { name: 'start the quiz' })).toBeEnabled();
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

  test('a finished quiz cannot restart with every structure hidden', async ({ page }) => {
    await openLab(page);
    const quiz = page.getByRole('region', { name: 'find it' });
    const remaining = NAMES[0]!;

    // Start a one-structure round so the result is deterministic, regardless
    // of which random target a longer round might otherwise choose.
    for (const name of NAMES.slice(1)) {
      await list(page).getByRole('button', { name: `hide ${name}`, exact: true }).click();
    }
    await quiz.getByRole('button', { name: 'start the quiz' }).click();
    await expect(quiz.getByText(/^find: /)).toContainText(remaining);

    // The learner can hide the last visible shape before completing the round.
    await list(page).getByRole('button', { name: `hide ${remaining}`, exact: true }).click();
    await quiz.getByRole('button', { name: 'next' }).click();
    await expect(quiz.getByText(/^round done:/)).toBeVisible();

    const restart = quiz.getByRole('button', { name: 'start again' });
    await expect(restart).toBeDisabled();
    await expect(quiz.getByText('show a structure to start another round.')).toBeVisible();

    // The same completed round becomes restartable as soon as a shape is shown.
    const next = NAMES[1]!;
    await list(page).getByRole('button', { name: `show ${next}`, exact: true }).click();
    await expect(restart).toBeEnabled();
    await restart.click();
    await expect(quiz.getByText(/^find: /)).toContainText(next);
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

  test('a hidden selection is not named in an exported picture', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one export run per engine is enough');
    await openLab(page);
    await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    await page.getByRole('button', { name: 'hide fixture cube A' }).click();
    await expect(list(page).getByRole('button', { name: /^fixture cube A/ })).toContainText('(hidden)');

    // The name card remains available, but the picture does not contain the hidden shape.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'square 1080×1080' }).click();
    expect((await download).suggestedFilename()).toBe('cueory-fixture-square.png');
    await expect(page.getByText('saved cueory-fixture-square.png.')).toBeVisible();
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
  test('phone show all asks before fetching the remaining models and supports cancel', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1024) >= 768, 'phone-width safety check');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    // A visible canvas can still be in the opening phase. Wait for 3D startup
    // before treating an absent whole-body picker option as missing draft data.
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const whole = page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body' });
    await expect(whole).toBeVisible({ timeout: 15_000 });
    await whole.click();
    const files = page.getByTestId('anatomy-files');
    await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

    const requests: string[] = [];
    page.on('request', (req) => {
      if (/\.glb(?:\?|$)/.test(req.url())) requests.push(req.url());
    });

    const showAll = page.getByRole('button', { name: 'show all', exact: true });
    await showAll.click();
    const prompt = page.getByTestId('anatomy-bulk-confirm');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('10 more 3D model files');
    await expect(prompt.getByRole('button', { name: 'load every layer' })).toBeFocused();
    await expect(files).toContainText('model files loaded: 1 of 11');
    expect(requests).toEqual([]);

    // The focused confirmation can also be dismissed without a mouse.
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
    await expect(showAll).toBeFocused();
    expect(requests).toEqual([]);

    await showAll.click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'keep current view' }).click();
    await expect(prompt).toHaveCount(0);
    await expect(showAll).toBeFocused();
    await expect(files).toContainText('model files loaded: 1 of 11');
    expect(requests).toEqual([]);

    // The explicit second action authorizes the requests. Abort them in this
    // browser test so CI does not render the entire 1.3m-triangle body on a phone.
    await page.route(/\/models\/anatomy\/[^/]+\.glb(?:\?|$)/, (route) => route.abort());
    await showAll.click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'load every layer' }).click();
    await expect(prompt).toHaveCount(0);
    await expect(showAll).toBeFocused();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
  });

  test('disables whole-body layer actions until the first model is ready', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one initial-layer controls check per browser engine');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    // The 3D canvas can be visible before the full system picker is assembled.
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const whole = page.getByRole('group', { name: 'body system' })
      .getByRole('button', { name: 'whole body', exact: true });
    // Draft preview is enabled here, so a missing whole-body picker is a regression.
    await expect(whole).toBeVisible({ timeout: 15_000 });

    const held: Array<() => void> = [];
    await page.route('**/models/anatomy/skin.glb', async (route) => {
      await new Promise<void>((resolve) => held.push(resolve));
      await route.continue();
    });
    await whole.click();

    const layers = page.getByRole('group', { name: 'layers, skin to bone' });
    const skin = layers.getByRole('button', { name: /^skin \(/ });
    const vessels = layers.getByRole('button', { name: /^vessels \(/ });
    const peel = layers.getByRole('button', { name: /^peel a layer/ });
    const restore = layers.getByRole('button', { name: /^put a layer back/ });

    try {
      await expect.poll(() => held.length, { timeout: 20_000 }).toBe(1);
      for (const button of [skin, vessels, peel, restore]) {
        await expect(button).toBeDisabled();
      }
    } finally {
      // Always release the held network request if an assertion fails.
      held.splice(0).forEach((release) => release());
    }
    await expect(vessels).toBeEnabled({ timeout: 20_000 });
    await expect(skin).toBeEnabled();
    await expect(peel).toBeEnabled();
    // Nothing has been peeled away yet, so there is no outer layer to restore.
    await expect(restore).toBeDisabled();

    // A second layer is allowed to load without making the other controls
    // appear usable while the peel action is still pending.
    const vesselHold: Array<() => void> = [];
    await page.route('**/models/anatomy/vessels.glb', async (route) => {
      await new Promise<void>((resolve) => vesselHold.push(resolve));
      await route.continue();
    });
    await vessels.click();
    try {
      await expect.poll(() => vesselHold.length, { timeout: 20_000 }).toBe(1);
      await expect(vessels).toBeDisabled();
      await expect(peel).toBeDisabled();
      await expect(restore).toBeDisabled();
    } finally {
      vesselHold.splice(0).forEach((release) => release());
    }
    await expect(vessels).toBeEnabled({ timeout: 20_000 });
  });


  test('a completed shared GLB becomes searchable while a sibling GLB is still loading', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one progressive-load check per browser engine');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const whole = page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body' });
    // This browser fixture has draft models enabled. If the whole-body picker
    // disappears, that is a regression, not a reason to skip the assertion.
    await expect(whole).toBeVisible({ timeout: 15_000 });
    await whole.click();
    const files = page.getByTestId('anatomy-files');
    await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
    // Block vessels.glb only. The shared heart.glb should become usable without
    // waiting for this second file from the same requested layer.
    const held: Array<() => void> = [];
    await page.route('**/models/anatomy/vessels.glb', async (route) => {
      await new Promise<void>((resolve) => { held.push(resolve); });
      await route.continue();
    });
    await page.getByLabel('find a structure').fill('heart');
    await expect(list(page).getByRole('button', { name: 'heart (not loaded yet)', exact: true })).toBeDisabled();
    const layers = page.getByRole('group', { name: 'layers, skin to bone' });
    await layers.getByRole('button', { name: /^vessels \(/ }).click();
    await expect.poll(() => held.length, { timeout: 20_000 }).toBe(1);
    try {
      await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
      await expect(list(page).getByRole('button', { name: 'heart (hidden)', exact: true }))
        .toBeEnabled({ timeout: 20_000 });
    } finally {
      // Even if a regression assertion fails, do not leave a model request
      // pending into browser teardown or hold up unrelated tests.
      held.splice(0).forEach((release) => release());
    }
    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
  });


  test('initial HTML contains each source structure once, then offers whole body after opening', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one HTML payload check per browser engine');
    const heart = JSON.parse(
      await readFile(new globalThis.URL('../../content/visuals/anatomy-heart.json', import.meta.url), 'utf8'),
    ) as { labels: Array<{ id: string }> };
    const sourceId = heart.labels[0]?.id ?? '';
    expect(sourceId).not.toBe('');

    const response = await page.goto('/preview/anatomy-lab');
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html, 'draft-enabled Playwright builds must include this source structure').toContain(sourceId);
    expect(html.split(sourceId).length - 1).toBe(1);

    await expect(page.getByRole('button', { name: 'whole body', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(
      page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('only the outer layer is requested at first; a deeper layer only when peeled to', async ({ page }) => {
    const glb: string[] = [];
    page.on('request', (req) => {
      if (/\.glb(\?|$)/.test(req.url())) glb.push(req.url().split('?')[0]!);
    });
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    // The canvas exists during "opening" too. Focus is set only after the viewer reaches "open".
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const picker = page.getByRole('group', { name: 'body system' });
    await expect(picker.getByRole('button', { name: 'whole body' })).toBeVisible({ timeout: 15_000 });
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
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const whole = page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body' });
    await expect(whole).toBeVisible({ timeout: 15_000 });
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
      if (/\.glb(?:\?|$)/.test(request.url())) extraRequests.push(request.url());
    });
    await quiz.getByRole('button', { name: 'show me' }).click();
    await expect(quiz.locator('[data-feedback="shown"]')).toContainText('heart');
    await expect(list(page).getByRole('button', { name: 'heart', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(files).toContainText('model files loaded: 3 of 11');
    expect(extraRequests).toEqual([]);
  });

  test('explains loaded triangles across files without a false per-model warning', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-model performance-note test per browser engine');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const wholeBody = page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body' });
    await expect(wholeBody).toBeVisible({ timeout: 15_000 });
    await wholeBody.click();
    const files = page.getByTestId('anatomy-files');
    await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
    await expect(page.getByTestId('anatomy-budget-note')).toHaveCount(0);

    // The skin and muscle files are individually within the 150k budget.
    // Peeling downloads muscle but retains skin in memory: their sum is not
    // a per-file budget failure.
    await page.getByRole('button', { name: /^peel a layer/ }).press('Enter');
    await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
    const note = page.getByTestId('anatomy-budget-note');
    await expect(note).toContainText('loaded triangles across 2 model files');
    await expect(note).toContainText('phone budget applies to each file, not their combined total');
    await expect(note).not.toContainText('Model has');
  });

  test('the organs button loads missing files when only the heart is visible from the vessels layer', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-model download test per browser engine');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    // Do not treat an unfinished WebGL startup as evidence that the combined system is absent.
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const wholeBody = page.getByRole('group', { name: 'body system' }).getByRole('button', { name: 'whole body' });
    await expect(wholeBody).toBeVisible({ timeout: 15_000 });
    await wholeBody.click();

    const files = page.getByTestId('anatomy-files');
    await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
    // The whole-body catalog shows only its first 40 entries until expanded.
    // Search the full catalog for heart, which is not guaranteed to be in that first page.
    await page.getByLabel('find a structure').fill('heart');
    // The heart is a valid structure whose model has not yet been requested.
    // Its disabled list button must say this in its accessible name.
    await expect(list(page).getByRole('button', { name: 'heart (not loaded yet)', exact: true })).toBeDisabled();
    const layers = page.getByRole('group', { name: 'layers, skin to bone' });
    await layers.getByRole('button', { name: /^vessels \(/ }).press('Enter');
    // The vessels layer needs heart.glb as well as vessels.glb.
    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
    // IDs present in other GLBs must not be reported missing during progressive loads.
    await expect(page.getByTestId('anatomy-missing-count')).toHaveCount(0);
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
    // The models contain all listed owner IDs, so no false missing count appears.
    await expect(page.getByTestId('anatomy-missing-count')).toHaveCount(0);
    await expect(organs).toHaveAttribute('aria-pressed', 'true');
    await expect(list(page).getByRole('button', { name: 'hide heart', exact: true })).toBeVisible();
  });

});

test.describe('anatomy whole-body initial file count', () => {
  test('does not count a pending or failed first GLB, then counts its successful retry', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one initial-file check per browser engine');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const whole = page.getByRole('group', { name: 'body system' })
      .getByRole('button', { name: 'whole body', exact: true });
    // This preview has draft models enabled. Missing whole-body is a test failure.
    await expect(whole).toBeVisible({ timeout: 15_000 });

    let attempts = 0;
    const releases: Array<() => void> = [];
    await page.route('**/models/anatomy/skin.glb', async (route) => {
      attempts++;
      if (attempts === 1) {
        await new Promise<void>((resolve) => releases.push(resolve));
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    try {
      await whole.click();
      await expect.poll(() => releases.length, { timeout: 20_000 }).toBe(1);
      const files = page.getByTestId('anatomy-files');
      await expect(files).toContainText('model files loaded: 0 of 11');
      releases.splice(0).forEach((release) => release());
      await expect(page.getByRole('alert').filter({ hasText: 'could not load whole body.' }))
        .toBeVisible({ timeout: 20_000 });
      await expect(files).toContainText('model files loaded: 0 of 11');

      await page.getByRole('button', { name: 'try loading again' }).click();
      await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
      expect(attempts).toBe(2);
    } finally {
      // An assertion failure must not leave a route pending during teardown.
      releases.splice(0).forEach((release) => release());
    }
  });
});

test.describe('anatomy lab system switch', () => {
  test('clears previous-layer progress and messages immediately on a system change', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one old-layer-state regression per browser engine');
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const picker = page.getByRole('group', { name: 'body system' });
    const whole = picker.getByRole('button', { name: 'whole body', exact: true });
    await expect(whole).toBeVisible({ timeout: 15_000 });
    await whole.click();
    await expect(page.getByTestId('anatomy-files')).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

    // Hold a request from the previous body system while switching to a new one.
    const held: Array<() => void> = [];
    await page.route('**/models/anatomy/vessels.glb', async (route) => {
      await new Promise<void>((resolve) => held.push(resolve));
      await route.continue();
    });
    try {
      const vessels = page.getByRole('group', { name: 'layers, skin to bone' })
        .getByRole('button', { name: /^vessels \(/ });
      await vessels.click();
      await expect.poll(() => held.length, { timeout: 20_000 }).toBeGreaterThan(0);
      await expect(page.getByTestId('anatomy-layer-loading')).toBeVisible();

      const nextSystem = picker.getByRole('button').first();
      await nextSystem.click();
      await expect(nextSystem).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('anatomy-layer-loading')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'try vessels again' })).toHaveCount(0);
      await expect(page.getByTestId('anatomy-label-note')).toHaveCount(0);
    } finally {
      // Always unblock network requests, including when an assertion fails.
      held.splice(0).forEach((release) => release());
    }
  });


  test('the old model is not shown after switching, and a late layer from the old system changes nothing', async ({ page }) => {
    const release: Array<() => void> = [];
    let holdRequests = true;
    // Hold models only for the current phase. Once a batch has been released,
    // late sibling GLBs must not remain blocked by an obsolete release list.
    await page.route(/\.glb(\?|$)/, async (route) => {
      if (holdRequests) await new Promise<void>((resolve) => release.push(resolve));
      await route.continue();
    });
    try {
      await page.goto('/preview/anatomy-lab');
      await page.getByRole('button', { name: 'open the anatomy lab' }).click();
      // The picker includes the client-composed whole-body option only after
      // the viewer reaches its open phase, not merely when canvas is visible.
      await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
      const picker = page.getByRole('group', { name: 'body system' });
      const buttons = picker.getByRole('button');
      // Drafts are enabled for this test build: absence is a real regression,
      // not a reason to silently skip the system-switch safety test.
      await expect.poll(() => buttons.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
      await expect.poll(() => release.length).toBeGreaterThan(0);

      holdRequests = false;
      release.splice(0).forEach((resume) => resume());
      await expect(page.getByText(/^loading /)).toHaveCount(0, { timeout: 20_000 });

      // Re-arm exactly before the next system selection, so its GLB stays
      // pending while the old model's controls are checked.
      holdRequests = true;
      await buttons.nth(1).click();
      await expect(page.getByText(/^loading /).first()).toBeVisible();
      const cameraControls = page.getByRole('group', { name: 'view' });
      for (const name of ['turn left', 'turn right', 'tilt up', 'tilt down', 'zoom in', 'zoom out', 'reset view']) {
        await expect(cameraControls.getByRole('button', { name, exact: true })).toBeDisabled();
      }
      await expect(page.getByRole('button', { name: 'square 1080×1080' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'start the quiz' })).toBeDisabled();
      await expect(list(page).getByRole('button').first()).toBeDisabled();

      // The loading overlay may render before the actual GLB request reaches
      // Playwright. Wait for a held route before releasing it, and allow any
      // later sibling files through without another manual release.
      await expect.poll(() => release.length, { timeout: 20_000 }).toBeGreaterThan(0);
      holdRequests = false;
      release.splice(0).forEach((resume) => resume());
      await expect(page.getByText(/^loading /)).toHaveCount(0, { timeout: 20_000 });
    } finally {
      // Never strand intercepted requests when an assertion fails.
      holdRequests = false;
      release.splice(0).forEach((resume) => resume());
    }

  });
});


test('recovers from a failed first anatomy model request without refreshing', async ({ page }) => {
  let requests = 0;
  await page.route('**/preview/anatomy-fixture/fixture.glb', async (route) => {
    requests++;
    if (requests === 1) {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporarily unavailable' });
    } else {
      await route.continue();
    }
  });
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('alert')).toContainText('could not load');
  const retry = page.getByRole('button', { name: 'try loading again' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(list(page).getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });
  expect(requests).toBe(2);
});

test.describe('anatomy lab without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('keeps a readable alternative next to the interactive viewer', async ({ page }) => {
    await page.goto(URL);
    const fallback = page.locator('main astro-island[client="only"] + noscript');
    await expect(fallback).toHaveCount(1);
    const paragraph = fallback.locator(':scope > p');
    await expect(paragraph).toBeVisible();
    expect(await paragraph.textContent()).toContain('the 3D anatomy lab needs javascript');
    await expect(paragraph.getByRole('link', { name: 'browse lessons' })).toHaveAttribute('href', '/learn');
  });
});

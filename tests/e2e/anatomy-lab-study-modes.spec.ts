import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/**
 * The anatomy lab's preset views, keys panel, "name it" practice, worksheet, download notes and lesson links, against
 * the test fixture (?fixture): five shapes made in code, named "fixture cube A" and so on, so nothing here depends on
 * real anatomy. Every action is done with buttons or keys; nothing is dragged.
 */

const URL = '/preview/anatomy-lab?fixture';
const NAMES = ['fixture cube A', 'fixture cube B', 'fixture block C', 'fixture point D', 'fixture slab E'];
const FIXTURE_CREDIT = 'test shapes made in code for automated tests: not anatomy, not from BodyParts3D';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /content security policy|refused to/i.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

async function openLab(page: Page, url = URL) {
  await page.goto(url);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'reset view' })).toBeEnabled({ timeout: 20_000 });
}

const list = (page: Page) => page.getByRole('region', { name: 'structures' });
const recall = (page: Page) => page.getByRole('region', { name: 'name it' });
const sheet = (page: Page) => page.getByRole('region', { name: /^worksheet: / });
const overlay = (page: Page) => page.getByTestId('anatomy-labels');

/** Where every label sits on screen, by name: it changes when the camera really moves. */
async function labelSpots(page: Page): Promise<Record<string, string>> {
  // Measured from the 3D view's own corner, so scrolling the page changes nothing.
  return overlay(page).locator(':scope > span').evaluateAll((spans) =>
    Object.fromEntries(spans.map((span) => {
      const box = span.getBoundingClientRect();
      const frame = span.parentElement!.getBoundingClientRect();
      return [span.textContent ?? '', `${Math.round(box.x - frame.x)},${Math.round(box.y - frame.y)}`];
    })),
  );
}

async function noSidewaysScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.describe('anatomy lab: preset views and keys', () => {
  test('each preset view is a button that moves the camera and says so, and reset brings the start back', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: 'labels' }).click();
    await expect(overlay(page).locator(':scope > span').first()).toBeVisible();
    const start = await labelSpots(page);

    const presets = page.getByRole('group', { name: 'preset views' });
    for (const name of ['front view', 'back view', 'left side view', 'right side view', 'top view']) {
      const button = presets.getByRole('button', { name, exact: true });
      await expect(button).toBeEnabled();
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await presets.getByRole('button', { name: 'back view', exact: true }).click();
    await expect(page.locator('p[aria-live="polite"].sr-only').filter({ hasText: 'back view' })).toHaveCount(1);
    await expect.poll(() => labelSpots(page)).not.toEqual(start);
    const back = await labelSpots(page);

    await presets.getByRole('button', { name: 'top view', exact: true }).click();
    await expect.poll(() => labelSpots(page)).not.toEqual(back);

    await page.getByRole('button', { name: 'reset view' }).click();
    await expect.poll(() => labelSpots(page)).toEqual(start);
    await noSidewaysScroll(page);
  });

  test('number keys on the 3D view do the same as the buttons, and other keys are left alone', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'a hardware keyboard: once per engine');
    await openLab(page);
    await page.getByRole('button', { name: 'labels' }).click();
    await expect(overlay(page).locator(':scope > span').first()).toBeVisible();
    const start = await labelSpots(page);

    const canvas = page.locator('canvas');
    await canvas.focus();
    await page.keyboard.press('3');
    await expect(page.locator('p[aria-live="polite"].sr-only').filter({ hasText: 'left side view' })).toHaveCount(1);
    await expect.poll(() => labelSpots(page)).not.toEqual(start);
    await page.keyboard.press('0');
    await expect.poll(() => labelSpots(page)).toEqual(start);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => labelSpots(page)).not.toEqual(start);
    await page.keyboard.press('Home');
    await expect.poll(() => labelSpots(page)).toEqual(start);

    // A browser shortcut (Ctrl+1) and an unmapped key are not swallowed.
    const swallowed = await canvas.evaluate((el) => {
      const fire = (init: KeyboardEventInit) => {
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return [fire({ key: '1', ctrlKey: true }), fire({ key: '1', metaKey: true }), fire({ key: '7' }), fire({ key: 'Tab' })];
    });
    expect(swallowed).toEqual([false, false, false, false]);
    expect(await labelSpots(page)).toEqual(start);
  });

  test('the keys panel lists the keyboard map, opens and closes by keyboard and gives focus back', async ({ page }) => {
    await openLab(page);
    const keys = page.getByRole('button', { name: 'keys', exact: true });
    await expect(keys).toHaveAttribute('aria-expanded', 'false');
    await keys.focus();
    await page.keyboard.press('Enter');
    await expect(keys).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByRole('region', { name: 'keys for the 3D view' });
    await expect(panel).toBeVisible();
    for (const line of ['turn the model left or right', 'zoom in or out', 'front view', 'top view', 'reset the view']) {
      await expect(panel.getByText(line, { exact: true })).toBeVisible();
    }
    await noSidewaysScroll(page);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);

    await panel.getByRole('button', { name: 'close keys' }).focus();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(keys).toBeFocused();
    await expect(keys).toHaveAttribute('aria-expanded', 'false');
  });

  test('with reduced motion on, preset views still land at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLab(page);
    await page.getByRole('button', { name: 'labels' }).click();
    await expect(overlay(page).locator(':scope > span').first()).toBeVisible();
    const start = await labelSpots(page);
    await page.getByRole('button', { name: 'right side view', exact: true }).click();
    await expect.poll(() => labelSpots(page)).not.toEqual(start);
    // Labels are laid out a moment after the camera lands (the "behind" check runs on the next frames). Once two
    // readings agree, nothing keeps drifting afterwards: the view stays where the button put it.
    let landed = await labelSpots(page);
    await expect.poll(async () => {
      const before = landed;
      await page.waitForTimeout(150);
      landed = await labelSpots(page);
      return JSON.stringify(landed) === JSON.stringify(before);
    }).toBe(true);
    await page.waitForTimeout(600);
    expect(await labelSpots(page)).toEqual(landed);
    // Turning the setting off and on while the lab is open is harmless.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'reset view' }).click();
    await expect.poll(() => labelSpots(page)).toEqual(start);
  });
});

test.describe('anatomy lab: name it', () => {
  test('pick a name: wrong and right are said in words and marked with a symbol, and there is no score', async ({ page }) => {
    const errors = watchErrors(page);
    await openLab(page);
    await recall(page).getByRole('button', { name: 'start name it' }).click();
    await expect(recall(page).getByText('which structure is highlighted?', { exact: false })).toBeVisible();

    // The list is put away and labels are off, so the answer is not on screen.
    await expect(page.getByTestId('anatomy-list-paused')).toBeVisible();
    await expect(list(page).getByRole('button', { name: NAMES[0]!, exact: true })).toHaveCount(0);
    await expect(overlay(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'labels' })).toBeDisabled();
    await expect(page.locator('#anatomy-name-card')).toHaveCount(0);

    const choices = recall(page).getByRole('group', { name: 'pick its name' }).getByRole('button');
    await expect(choices).toHaveCount(4);
    const offered = await choices.allTextContents();
    expect(new Set(offered).size).toBe(4);
    for (const name of offered) expect(NAMES).toContain(name);
    for (const box of await choices.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }

    // Find the answer with "show me" on a first question, then answer the next one both ways.
    await recall(page).getByRole('button', { name: 'show me' }).click();
    const shown = recall(page).locator('[data-feedback="shown"]');
    await expect(shown).toContainText('it is: fixture');
    await expect(choices.filter({ hasText: '✓' })).toHaveCount(1);
    for (const choice of await choices.all()) await expect(choice).toBeDisabled();

    await recall(page).getByRole('button', { name: 'next' }).click();
    await expect(recall(page).locator('[data-feedback]')).toHaveCount(0);
    const second = await choices.allTextContents();
    // Pick names until the lab says "right": every earlier pick is called wrong, by name.
    let wrongSeen = 0;
    for (const name of second) {
      await choices.filter({ hasText: name }).click();
      // Either answer names the pick, so wait for that before reading which one it is.
      await expect(recall(page).locator('[data-feedback]')).toContainText(name);
      if (await recall(page).locator('[data-feedback="right"]').count()) {
        await expect(recall(page).locator('[data-feedback="right"]')).toContainText(`✓ right: ${name}.`);
        break;
      }
      wrongSeen++;
      await expect(recall(page).locator('[data-feedback="wrong"]')).toContainText(`✗ not this one: you picked ${name}.`);
      await expect(choices.filter({ hasText: name })).toContainText('(not this one)');
    }
    expect(wrongSeen).toBeLessThan(4);
    await expect(recall(page).locator('[data-feedback="right"]')).toBeVisible();
    await expect(recall(page).getByText(/^score:/)).toHaveCount(0);
    await expect(recall(page).getByText(/\d+ (of|out of|\/) \d+/)).toHaveCount(0);
    await expect(recall(page).getByText('not a scored assessment', { exact: false })).toBeVisible();

    await noSidewaysScroll(page);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('type a name by keyboard: a wrong answer is echoed, the official name in any capitals is right', async ({ page }) => {
    await openLab(page);
    await recall(page).getByRole('button', { name: 'start name it' }).click();
    const input = recall(page).getByLabel('or type its name');
    const check = recall(page).getByRole('button', { name: 'check' });
    await expect(check).toBeDisabled();

    await input.fill('not a fixture name');
    await input.press('Enter');
    await expect(recall(page).locator('[data-feedback="wrong"]')).toContainText('✗ not this one: you typed not a fixture name.');

    // Learn the answer from "show me" on this question, then type the next one from what is left.
    await recall(page).getByRole('button', { name: 'show me' }).click();
    const first = ((await recall(page).locator('[data-feedback="shown"]').textContent()) ?? '').replace(/^it is: /, '').replace(/\.$/, '');
    expect(NAMES).toContain(first);
    await expect(input).toBeDisabled();

    const asked = [first];
    for (let round = 0; round < NAMES.length - 1; round++) {
      await recall(page).getByRole('button', { name: 'next' }).click();
      await expect(input).toBeEnabled();
      await expect(input).toHaveValue('');
      // Try each name not yet asked, in capitals, until one is right.
      let found = '';
      for (const name of NAMES.filter((n) => !asked.includes(n))) {
        await input.fill(`  ${name.toUpperCase()} `);
        await check.click();
        // Either answer repeats the name (as typed, or as the official name), so wait for that before reading it.
        await expect(recall(page).locator('[data-feedback]')).toContainText(name, { ignoreCase: true });
        if (await recall(page).locator('[data-feedback="right"]').count()) {
          found = name;
          break;
        }
        await expect(recall(page).locator('[data-feedback="wrong"]')).toBeVisible();
      }
      expect(found).not.toBe('');
      await expect(recall(page).locator('[data-feedback="right"]')).toContainText(`✓ right: ${found}.`);
      asked.push(found);
    }

    // Every structure has been asked once: the round ends and can start again.
    await recall(page).getByRole('button', { name: 'next' }).click();
    await expect(recall(page).getByText('round done: every structure in this round has been asked.')).toBeVisible();
    await recall(page).getByRole('button', { name: 'start again' }).click();
    await expect(recall(page).getByText('which structure is highlighted?', { exact: false })).toBeVisible();
  });

  test('"see it alone" hides the rest and stopping puts back exactly what was showing', async ({ page }) => {
    await openLab(page);
    // Hide one shape first: it must still be hidden after the round.
    await list(page).getByRole('button', { name: 'fixture slab E', exact: true }).click();
    await page.getByRole('button', { name: 'hide fixture slab E' }).click();
    await expect(list(page).getByRole('button', { name: /^fixture slab E/ })).toContainText('(hidden)');

    await recall(page).getByRole('button', { name: 'start name it' }).click();
    // Four shapes are showing, so the hidden one is never asked: its name can still be a wrong choice.
    const alone = recall(page).getByRole('button', { name: 'see it alone' });
    await expect(alone).toHaveAttribute('aria-pressed', 'false');
    await alone.click();
    await expect(alone).toHaveAttribute('aria-pressed', 'true');
    await recall(page).getByRole('button', { name: 'next' }).click();
    await expect(alone).toHaveAttribute('aria-pressed', 'true');

    await recall(page).getByRole('button', { name: 'stop name it' }).click();
    await expect(page.getByTestId('anatomy-list-paused')).toHaveCount(0);
    for (const name of NAMES.slice(0, 4)) {
      await expect(list(page).getByRole('button', { name, exact: true })).toBeVisible();
      await expect(list(page).getByRole('button', { name: new RegExp(`^${name}`) })).not.toContainText('(hidden)');
    }
    await expect(list(page).getByRole('button', { name: /^fixture slab E/ })).toContainText('(hidden)');
    await expect(page.getByRole('button', { name: 'labels' })).toBeEnabled();
  });

  test('starting "find it" ends "name it", and a tap on the 3D view never moves the highlight', async ({ page }) => {
    await openLab(page);
    await recall(page).getByRole('button', { name: 'start name it' }).click();
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // No name is announced or shown by the tap.
    await expect(page.locator('p[aria-live="polite"].sr-only').filter({ hasText: /^selected / })).toHaveCount(0);
    await expect(page.locator('#anatomy-name-card')).toHaveCount(0);

    await page.getByRole('button', { name: 'start the quiz' }).click();
    await expect(recall(page).getByRole('button', { name: 'start name it' })).toBeVisible();
    await expect(page.getByTestId('anatomy-list-paused')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'find it' }).getByText(/^find: /)).toBeVisible();
  });
});

test.describe('anatomy lab: worksheet', () => {
  test('makes a numbered picture with blanks, answers on request, the credit, and prints only the worksheet', async ({ page }) => {
    const errors = watchErrors(page);
    await openLab(page);
    await page.getByRole('button', { name: 'make a worksheet' }).click();
    await expect(sheet(page)).toBeVisible({ timeout: 20_000 });
    await expect(sheet(page).getByRole('heading', { name: 'worksheet: test shapes (fixture)' })).toBeFocused();

    // The picture is a real 1080 × 1080 PNG, shown from a data: address the content security policy allows.
    const picture = sheet(page).getByRole('img');
    await expect(picture).toHaveAttribute('alt', /numbered picture of test shapes \(fixture\)/);
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1080);
    expect(await picture.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(1080);
    expect(await picture.getAttribute('src')).toMatch(/^data:image\/png;base64,/);

    // One blank per shape, numbered from 1, with no name on the page until the student asks.
    const rows = sheet(page).getByRole('list', { name: 'names to fill in' }).getByRole('listitem');
    await expect(rows).toHaveCount(NAMES.length);
    const numbers = await rows.locator(':scope > span:first-child').allTextContents();
    expect(numbers).toEqual(NAMES.map((_, i) => `${i + 1}.`));
    for (const name of NAMES) await expect(sheet(page).getByText(name, { exact: true })).toHaveCount(0);

    // The credit is in words under the picture, and the draft note is there on a build that shows drafts.
    await expect(page.getByTestId('anatomy-worksheet-credit')).toContainText(FIXTURE_CREDIT);
    await expect(sheet(page).getByText('draft · labels waiting for review')).toBeVisible();
    await noSidewaysScroll(page);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);

    const answers = sheet(page).getByRole('button', { name: 'show answers' });
    await answers.click();
    await expect(answers).toHaveAttribute('aria-pressed', 'true');
    const filled = await rows.allTextContents();
    expect(filled.map((row) => row.replace(/^\d+\./, '')).sort()).toEqual([...NAMES].sort());
    await answers.click();
    for (const name of NAMES) await expect(sheet(page).getByText(name, { exact: true })).toHaveCount(0);

    const save = sheet(page).getByRole('link', { name: 'save the picture' });
    await expect(save).toHaveAttribute('download', 'cueory-fixture-worksheet.png');

    // Printing marks the page, and with the mark only the worksheet is printed, without its buttons.
    await page.evaluate(() => { window.print = () => {}; });
    await sheet(page).getByRole('button', { name: 'print worksheet' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-game', 'anatomy-worksheet');
    await page.emulateMedia({ media: 'print' });
    await expect(picture).toBeVisible();
    await expect(rows.first()).toBeVisible();
    await expect(page.getByTestId('anatomy-worksheet-credit')).toBeVisible();
    await expect(sheet(page).getByText('draft · labels waiting for review')).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'print worksheet' })).toBeHidden();
    await expect(page.locator('canvas')).toBeHidden();
    await expect(page.locator('#anatomy-search')).toBeHidden();
    await expect(page.locator('body > header')).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('html')).not.toHaveAttribute('data-print-game', /.+/);
    await page.emulateMedia({ media: 'screen' });

    await sheet(page).getByRole('button', { name: 'close worksheet' }).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('numbers only what is showing, and says why when nothing is', async ({ page }) => {
    await openLab(page);
    await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    await page.getByRole('button', { name: 'show only this' }).click();
    await page.getByRole('button', { name: 'make a worksheet' }).click();
    await expect(sheet(page)).toBeVisible({ timeout: 20_000 });
    const rows = sheet(page).getByRole('list', { name: 'names to fill in' }).getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await sheet(page).getByRole('button', { name: 'show answers' }).click();
    await expect(rows).toHaveText(['1.fixture cube A']);
    await sheet(page).getByRole('button', { name: 'close worksheet' }).click();

    await page.getByRole('button', { name: 'hide fixture cube A' }).click();
    await page.getByRole('button', { name: 'make a worksheet' }).click();
    await expect(page.getByTestId('anatomy-worksheet-status')).toHaveText('show at least one structure to make a worksheet.');
    await expect(sheet(page)).toHaveCount(0);
  });
});

test.describe('anatomy lab: download notes and lesson links', () => {
  test('the cover says what the first tap downloads, and promises no size for the test shapes', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('anatomy-cover-note')).toHaveText('loads the 3D viewer, then one body system at a time.');
    // Without the fixture the first real system is named with its measured size (a draft: this build shows drafts).
    await page.goto('/preview/anatomy-lab');
    await expect(page.getByTestId('anatomy-cover-note')).toHaveText(
      /^loads the 3D viewer, then one body system at a time\. the first, .+, is a \d+(\.\d)? (KB|MB) download\.$/,
    );
    await noSidewaysScroll(page);
  });

  test('a link can open the lab on one structure, and a bad link falls back to the normal first view', async ({ page }) => {
    await openLab(page, `${URL}&structure=FIX003`);
    await expect(page.getByRole('heading', { name: 'fixture block C' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('p[aria-live="polite"].sr-only').filter({ hasText: 'selected fixture block C' })).toHaveCount(1);

    for (const bad of ['structure=NOPE999', `structure=${encodeURIComponent('<img src=x onerror=alert(1)>')}`, 'system=no-such-system', `system=${encodeURIComponent('../x')}`]) {
      await openLab(page, `${URL}&${bad}`);
      await expect(page.locator('#anatomy-name-card')).toHaveCount(0);
      await expect(list(page).getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled();
    }
  });
});

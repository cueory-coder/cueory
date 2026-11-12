import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TIMEOUT_KEEPS_PICK } from '../../src/islands/stat';
import sample from '../../content/games/stat/sample.json' with { type: 'json' };

// stat (Task 640). The page's clock is Playwright's fake clock, so 20 seconds pass in an instant and nothing is flaky.
const key = sample.questions.map((question) => question.sampleKey);
const said = (page: Page) => page.getByTestId('stat-said');
const progress = (page: Page) => page.getByTestId('stat-progress');
const choice = (page: Page, letter: string) => page.getByTestId(`stat-choice-${letter}`);
const next = (page: Page) => page.getByTestId('stat-next');
const seconds = (page: Page) => page.getByTestId('stat-seconds');

test.beforeEach(async ({ page }) => {
  // The once-only promo panel would take keyboard focus mid-test (as in play.spec.ts).
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage blocked */ }
  });
  await page.clock.install({ time: new Date('2026-11-11T09:00:00') });
  await page.goto('/play/stat');
  await expect(page.getByTestId('stat-start')).toBeVisible();
  // From here on the page's time moves only when a test moves it, so a slow machine can't eat into the 20 seconds.
  await page.clock.pauseAt(new Date('2026-11-11T09:05:00'));
});

async function start(page: Page) {
  await page.getByTestId('stat-start').click();
  await expect(progress(page)).toHaveText('question 1 of 15');
}

/** Answers questions from the current one to the last by clicking `pick(index)` and next. */
async function finish(page: Page, from: number, pick: (index: number) => string | null) {
  for (let index = from; index < 15; index++) {
    await expect(progress(page)).toHaveText(`question ${index + 1} of 15`);
    const letter = pick(index);
    if (letter) await choice(page, letter).click();
    await page.clock.runFor(2_000);
    await next(page).click();
  }
  await expect(page.getByTestId('stat-result')).toBeVisible();
}

test('the games page links to stat, which says its questions are samples and stays out of search', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'stat' })).toBeVisible();
  await expect(page.getByTestId('stat-sample-note')).toHaveText('sample questions · awaiting content');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.goto('/play');
  await page.getByTestId('stat-link').click();
  await expect(page).toHaveURL(/\/play\/stat\/?$/);
});

test('keyboard: a to d pick and change the answer, Enter goes on, nothing is graded until the end', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('stat-stem')).toBeFocused();
  await expect(page.getByTestId('stat-stem')).toHaveText('[sample question 1]');
  await page.keyboard.press('b');
  await expect(choice(page, 'b')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'b')).toContainText('selected');
  await page.keyboard.press('C');
  await expect(choice(page, 'c')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'b')).toHaveAttribute('aria-pressed', 'false');
  await expect(said(page)).toHaveText('C selected.');
  // No answer, mark or score while playing.
  await expect(page.getByTestId('stat')).not.toContainText(/answer:|not right|✓|✕|\/ 15/);
  await page.keyboard.press('Enter');
  await expect(progress(page)).toHaveText('question 2 of 15');
  await expect(choice(page, 'c')).toHaveAttribute('aria-pressed', 'false');
  await expect(seconds(page)).toContainText('20');
  // Tab reaches the choices with a visible focus ring; Enter there picks, it does not skip.
  await page.keyboard.press('Tab');
  await expect(choice(page, 'a')).toBeFocused();
  expect(await choice(page, 'a').evaluate((el) => el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) > 0)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(choice(page, 'a')).toHaveAttribute('aria-pressed', 'true');
  await expect(progress(page)).toHaveText('question 2 of 15');
});

test('other open dialogs and an expanded account menu never pick a background answer', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'open account menu' }).click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await page.keyboard.press('a');
  await expect(choice(page, 'a')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'close account menu' }).click();

  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('data-testid', 'other-stat-dialog');
    dialog.setAttribute('aria-label', 'sample dialog');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'close sample dialog';
    dialog.append(close);
    document.body.append(dialog);
    dialog.showModal();
    close.focus();
  });
  await expect(page.getByTestId('other-stat-dialog')).toHaveJSProperty('open', true);
  await page.keyboard.press('b');
  // Even if focus escapes a modal, an open dialog must block a window-level shortcut.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })));
  await expect(choice(page, 'b')).toHaveAttribute('aria-pressed', 'false');
  await expect(choice(page, 'c')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>('[data-testid="other-stat-dialog"]');
    dialog?.close();
    dialog?.remove();
  });
  await page.getByTestId('stat-stem').focus();
  await page.keyboard.press('d');
  await expect(choice(page, 'd')).toHaveAttribute('aria-pressed', 'true');
});

test('unrelated expanded controls and hidden overlays cannot disable stat shortcuts', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const toggle = document.createElement('button');
    toggle.textContent = 'sample accordion';
    toggle.setAttribute('data-testid', 'sample-accordion');
    toggle.setAttribute('aria-controls', 'sample-accordion-details');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.append(toggle);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-testid', 'sample-hidden-dialog');
    dialog.hidden = true;
    document.body.append(dialog);

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');
    menu.setAttribute('data-testid', 'sample-hidden-menu');
    document.body.append(menu);
  });
  await page.getByTestId('stat-stem').focus();
  await page.keyboard.press('a');
  await expect(choice(page, 'a')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  await expect(choice(page, 'b')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(page, 'a')).toHaveAttribute('aria-pressed', 'false');
});

test('CSS-hidden, transparent, and off-screen overlays do not disable Stat shortcuts', async ({ page }) => {
  await start(page);
  const cases = [
    { mode: 'visibility', letter: 'a' },
    { mode: 'ancestor-opacity', letter: 'b' },
    { mode: 'offscreen', letter: 'c' },
  ] as const;

  for (const { mode, letter } of cases) {
    await test.step(mode, async () => {
      const fixture = await page.evaluate((hiddenBy) => {
        const host = document.createElement('div');
        host.id = 'stat-css-overlay-fixture';
        if (hiddenBy === 'ancestor-opacity') host.style.opacity = '0';

        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.textContent = '[sample inactive dialog]';
        dialog.style.position = 'fixed';
        dialog.style.left = '0px';
        dialog.style.top = '100px';
        dialog.style.width = '100px';
        dialog.style.height = '48px';
        dialog.style.pointerEvents = 'none';
        if (hiddenBy === 'visibility') dialog.style.visibility = 'hidden';
        if (hiddenBy === 'offscreen') dialog.style.transform = 'translateX(-200vw)';
        host.append(dialog);
        document.body.append(host);

        const rect = dialog.getBoundingClientRect();
        return {
          width: rect.width,
          visibility: getComputedStyle(dialog).visibility,
          ancestorOpacity: getComputedStyle(host).opacity,
          offscreenRight: rect.right,
        };
      }, mode);

      // Ensure the fixture really tests the relevant visibility condition.
      expect(fixture.width).toBeGreaterThan(0);
      if (mode === 'visibility') expect(fixture.visibility).toBe('hidden');
      if (mode === 'ancestor-opacity') expect(fixture.ancestorOpacity).toBe('0');
      if (mode === 'offscreen') expect(fixture.offscreenRight).toBeLessThan(0);

      await page.getByTestId('stat-stem').focus();
      await page.keyboard.press(letter);
      await expect(choice(page, letter)).toHaveAttribute('aria-pressed', 'true');
      await page.evaluate(() => document.querySelector('#stat-css-overlay-fixture')?.remove());
    });
  }
});

test('visible role-based overlays block letters and Enter, even if focus stays on the game', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'sample options');
    menu.setAttribute('data-testid', 'sample-visible-menu');
    menu.textContent = 'sample option';
    // Only an on-screen overlay should block a background game shortcut.
    const article = document.querySelector('article');
    if (!article) throw new Error('stat article is missing');
    article.prepend(menu);
  });
  await expect(page.getByTestId('sample-visible-menu')).toBeInViewport();
  await page.getByTestId('stat-stem').focus();
  await page.keyboard.press('c');
  await expect(choice(page, 'c')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(progress(page)).toHaveText('question 1 of 15');
  await page.getByTestId('sample-visible-menu').evaluate((menu) => menu.remove());

  await page.evaluate(() => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'sample dialog');
    dialog.setAttribute('data-testid', 'sample-role-dialog');
    dialog.textContent = 'sample dialog';
    const article = document.querySelector('article');
    if (!article) throw new Error('stat article is missing');
    article.prepend(dialog);
  });
  await expect(page.getByTestId('sample-role-dialog')).toBeInViewport();
  await page.keyboard.press('d');
  await expect(choice(page, 'd')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('sample-role-dialog').evaluate((dialog) => dialog.remove());

  await page.keyboard.press('c');
  await expect(choice(page, 'c')).toHaveAttribute('aria-pressed', 'true');
});

test('typing into an editable region never selects a game answer', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const field = document.createElement('div');
    field.contentEditable = 'true';
    field.setAttribute('data-testid', 'sample-editable');
    field.setAttribute('aria-label', 'sample notes');
    field.textContent = 'sample';
    document.body.append(field);
  });
  await page.getByTestId('sample-editable').focus();
  await page.keyboard.press('d');
  await expect(choice(page, 'd')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('sample-editable').evaluate((field) => field.remove());
  await page.getByTestId('stat-stem').focus();
  await page.keyboard.press('d');
  await expect(choice(page, 'd')).toHaveAttribute('aria-pressed', 'true');
});

for (const size of [
  { label: 'phone', width: 390, height: 844 },
  { label: 'tablet', width: 820, height: 1180 },
  { label: 'desktop', width: 1440, height: 900 },
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`site menu and search block stat keys at ${size.label} in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await start(page);

      const open = page.getByRole('button', { name: 'open site menu' });
      await expect(open).toBeVisible();
      await open.click();
      const dialog = page.getByTestId('site-menu');
      await expect(dialog).toHaveJSProperty('open', true);
      await page.keyboard.press('a');
      await expect(choice(page, 'a')).toHaveAttribute('aria-pressed', 'false');

      const resultLink = dialog.getByRole('navigation', { name: 'site' }).getByRole('link').first();
      await resultLink.focus();
      await page.keyboard.press('d');
      await expect(choice(page, 'd')).toHaveAttribute('aria-pressed', 'false');

      const search = dialog.getByRole('searchbox', { name: 'search the site' });
      await search.focus();
      await page.keyboard.press('b');
      await expect(search).toHaveValue('b');
      await expect(choice(page, 'b')).toHaveAttribute('aria-pressed', 'false');
      await page.getByRole('button', { name: 'close site menu' }).click();
      await expect(dialog).toHaveJSProperty('open', false);

      await page.getByTestId('stat-stem').focus();
      await page.keyboard.press('a');
      await expect(choice(page, 'a')).toHaveAttribute('aria-pressed', 'true');

      // The existing stat test checks playing/result accessibility. Repeat axe at each requested width/theme.
      await page.clock.resume();
      const checked = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(checked.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

test('the clock runs out and moves on, the timer is read out at 10 and 5 seconds, and the results show at the end', async ({ page }) => {
  await start(page);
  await expect(seconds(page)).toContainText('20');
  await page.clock.runFor(10_000);
  await expect(said(page)).toHaveText('10 seconds left.');
  await expect(seconds(page)).toContainText('10');
  await page.clock.runFor(5_000);
  await expect(said(page)).toHaveText('5 seconds left.');
  await expect(seconds(page)).toHaveAttribute('data-low', 'true');
  await page.clock.runFor(5_500);
  await expect(progress(page)).toHaveText('question 2 of 15');
  await expect(said(page)).toHaveText('time ran out. question 2 of 15. 20 seconds.');
  await expect(seconds(page)).toContainText('20');

  // Question 2 onward: right on 2 to 11, wrong after (a wrong letter is any letter that isn't the key).
  await finish(page, 1, (index) => (index <= 10 ? key[index]! : key[index] === 'a' ? 'b' : 'a'));
  const result = page.getByTestId('stat-result');
  await expect(result).toBeFocused();
  await expect(page.getByTestId('stat-score')).toHaveText('10 / 15');
  await expect(page.getByTestId('stat-verdict')).toHaveText('solid shift.');
  await expect(page.getByTestId('stat-share')).toHaveText('stat · wed 11 nov · 10/15 · cueory.app');
  // 20 s for the timed-out question, 2 s for each of the other fourteen: 47 / 15, about 3.
  await expect(page.getByTestId('stat-average')).toHaveText('3 s');
  const rows = page.getByTestId('stat-review-row');
  await expect(rows).toHaveCount(15);
  await expect(rows.nth(0)).toContainText('out of time');
  await expect(rows.nth(0)).toContainText('no answer (time ran out)');
  await expect(rows.nth(0)).toContainText(`answer: ${key[0]!.toUpperCase()}`);
  await expect(rows.nth(1)).toContainText('right');
  await expect(rows.nth(1)).not.toContainText('wrong');
  await expect(rows.nth(14)).toContainText('wrong');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.getByTestId('stat-copy').click();
  await expect(page.getByTestId('stat-copied')).toHaveText(/copied\.|copying is blocked/);

  await page.getByTestId('stat-again').click();
  await expect(progress(page)).toHaveText('question 1 of 15');
  await expect(choice(page, 'a')).toHaveAttribute('aria-pressed', 'false');
});

test('review rows name timeouts with and without a pick, show times and rationale slots, and work with Tab', async ({ page }) => {
  await start(page);
  await choice(page, key[0]!).click();
  await page.clock.runFor(20_100);
  await expect(progress(page)).toHaveText('question 2 of 15');
  await page.clock.runFor(20_100);
  await expect(progress(page)).toHaveText('question 3 of 15');
  await finish(page, 2, () => null);

  const rows = page.getByTestId('stat-review-row');
  await expect(rows).toHaveCount(15);
  await expect(rows.first().getByRole('heading', { name: 'question 1', level: 4 })).toBeVisible();
  // The row must not be named only by its heading: screen readers need its result, pick and answer.
  await expect(rows.first()).not.toHaveAttribute('aria-labelledby', /.+/);
  await expect(rows.first()).toContainText('out of time');
  await expect(rows.first()).toContainText('time used: 20 s');
  // The rule determines the expected result, not the rendered page. Never make an incorrect timeout pass.
  if (TIMEOUT_KEEPS_PICK) {
    await expect(rows.first()).toContainText('your answer: ' + key[0]!.toUpperCase());
    await expect(rows.first()).toContainText('picked answer counted as right');
    await expect(rows.first()).not.toHaveClass(/border-dashed/);
  } else {
    await expect(rows.first()).toContainText('no answer (time ran out)');
    await expect(rows.first()).toHaveClass(/border-dashed/);
  }
  await expect(rows.nth(1)).toHaveClass(/border-dashed/);
  await expect(rows.nth(1)).toContainText('out of time');
  await expect(rows.nth(1)).toContainText('no answer (time ran out)');
  await expect(rows.nth(1)).toContainText('time used: 20 s');
  await expect(rows.nth(2)).toContainText('no answer (skipped)');
  await expect(page.getByTestId('stat-review-rationale')).toHaveCount(15);
  await expect(page.getByTestId('stat-review-rationale').first()).toHaveText('reason: [sample rationale pending review]');
  await expect(page.getByTestId('stat-tomorrow')).toContainText('play again tomorrow');

  await page.getByTestId('stat-again').focus();
  await page.keyboard.press('Tab');
  await expect(rows.first()).toBeFocused();
  expect(await rows.first().evaluate((el) => el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) > 0)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(rows.nth(1)).toBeFocused();
});

test('it sends nothing off the site and saves nothing', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://localhost') && !request.url().startsWith('data:')) external.push(request.url()); });
  await start(page);
  await finish(page, 0, (index) => key[index]!);
  await expect(page.getByTestId('stat-score')).toHaveText('15 / 15');
  await expect(page.getByTestId('stat-verdict')).toHaveText('top of the unit today.');
  expect(external).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((name) => /stat/i.test(name)))).toEqual([]);
});

test('with reduced motion the ring does not animate and the seconds still show as text', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  const duration = await page.getByTestId('stat-ring').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(duration).toBeLessThan(0.001);
  await expect(seconds(page)).toBeVisible();
  await expect(seconds(page)).toHaveText('20 seconds left');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`passes axe, fits the screen and has 44px targets in ${scheme}, playing and on the results`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // axe needs the page's timers, so the clock runs for the scan and is paused again after it.
    const check = async () => {
      await page.clock.resume();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
    };
    const big = async (testIds: string[]) => {
      for (const id of testIds) {
        const box = (await page.getByTestId(id).boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    };
    await check();
    await start(page);
    await choice(page, 'b').click();
    await check();
    await big(['stat-choice-a', 'stat-choice-b', 'stat-choice-c', 'stat-choice-d', 'stat-next']);
    const shown = Number((await progress(page).textContent())!.match(/\d+/)![0]);
    await finish(page, shown - 1, () => null);
    await expect(page.getByTestId('stat-verdict')).toHaveText('a hard set today. a new one comes tomorrow.');
    await check();
    await big(['stat-copy', 'stat-again']);
  });
}

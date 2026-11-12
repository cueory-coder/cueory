import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const supportedProjects = new Set(['phone', 'desktop']);

test.describe('label it page', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!supportedProjects.has(test.info().project.name), 'Task 408 covers phone and desktop only');
    await page.goto('/learn/study-skills/label-it');
  });

  test('shows the page heading, sample state, drawing credit, and lesson link', async ({ page }) => {
    await expect(page).toHaveTitle('label it: lesson 1 · cueory');
    await expect(page.locator('main h1')).toHaveText('label it');
    await expect(page.locator('main')).toContainText(
      'the labels on the drawing are covered. uncover them one at a time, or all at once, and mark each one.',
    );
    await expect(page.getByTestId('label-it-sample-note')).toHaveText(
      "this is a sample with an everyday drawing. the lesson's own diagrams come later.",
    );
    await expect(page.getByRole('img', { name: 'a simple drawing of a house with four labels' })).toBeVisible();
    await expect(page.getByText('drawing: cueory, an everyday sample made for this page')).toBeVisible();
    await expect(page.getByRole('link', { name: 'back to the lesson' })).toHaveAttribute(
      'href',
      '/learn/study-skills',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('supports keyboard and tap state changes with spoken status text', async ({ page }) => {
    const board = page.getByTestId('labelit');
    const status = page.getByTestId('labelit-status');
    const live = page.getByTestId('labelit-live');

    await expect(board).toBeVisible();
    await expect(status).toHaveText('4 covered · know it: 0 · still learning: 0');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
    await expect(page.getByTestId('cover-2')).toHaveAccessibleName('label 2, covered');
    await expect(board).not.toContainText(/roof|chimney|window|door/);

    await page.getByTestId('cover-1').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1: roof');
    await expect(live).toHaveText('label 1: roof.');

    await board.getByRole('button', { name: 'uncover label 2' }).click();
    await expect(board.getByRole('group', { name: 'mark label 2' }).getByRole('button', { name: 'know it' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(live).toHaveText('chimney: know it. 3 left to mark.');
    await expect(status).toHaveText('2 covered · know it: 1 · still learning: 0');

    await board.getByRole('button', { name: 'reveal all' }).click();
    await expect(status).toHaveText('0 covered · know it: 1 · still learning: 0');
    await expect(board.getByRole('button', { name: 'still learning' }).first()).toBeVisible();
    expect(await board.getByRole('button', { name: 'know it' }).count()).toBe(4);
  });
});

test.describe('label it without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps the lesson fallback available', async ({ page }) => {
    test.skip(!supportedProjects.has(test.info().project.name), 'Task 408 covers phone and desktop only');
    const response = await page.goto('/learn/study-skills/label-it');
    expect(response?.status()).toBe(200);
    // Keep the server-rendered no-script explanation covered even when browser
    // text locators exclude its text. The visible lesson link is checked below.
    const html = await response!.text();
    expect(html).toContain('<noscript>');
    expect(html).toContain('label it needs JavaScript.');
    expect(html).toContain('<a href="/learn/study-skills">lesson page</a>');
    await expect(page.locator('main h1')).toHaveText('label it');
    // The no-JavaScript fallback must remain a usable route back to the lesson.
    // Check the visible link instead of relying on how browsers expose <noscript> text.
    await expect(page.getByTestId('labelit')).toHaveCount(0);
    const lessonLink = page.getByRole('link', { name: 'back to the lesson', exact: true });
    await expect(lessonLink).toBeVisible();
    await expect(lessonLink).toHaveAttribute('href', '/learn/study-skills');
  });
});

const samplePage = '/learn/study-skills/label-it';

test.describe('complete label-it rounds', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage may be blocked */ }
    });
    await page.goto(samplePage);
    await expect(page.getByTestId('labelit')).toBeVisible();
  });

  test('all know-it marks finish, announce completion, and start over cleanly by keyboard', async ({ page }) => {
    const board = page.getByTestId('labelit');
    const status = page.getByTestId('labelit-status');
    const live = page.getByTestId('labelit-live');
    await board.getByRole('button', { name: 'reveal all' }).focus();
    await page.keyboard.press('Enter');
    await expect(board.getByRole('group', { name: 'mark label 1' }).getByRole('button', { name: 'know it' })).toBeFocused();
    for (let number = 1; number <= 4; number++) {
      const button = board.getByRole('group', { name: `mark label ${number}` })
        .getByRole('button', { name: 'know it', exact: true });
      await button.focus();
      await page.keyboard.press('Enter');
    }
    await expect(status).toHaveText('0 covered · know it: 4 · still learning: 0');
    await expect(live).toHaveText('door: know it. round 1 done. all 4 labels known.');
    await expect(board.getByText("that's every label for now.")).toBeVisible();
    await expect(board.getByRole('button', { name: /study the .* still learning/ })).toHaveCount(0);
    const restart = board.getByRole('button', { name: 'start over', exact: true });
    await restart.focus();
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('4 covered · know it: 0 · still learning: 0');
    await expect(live).toHaveText('every label covered. starting over.');
    await expect(board.getByText("that's every label for now.")).toHaveCount(0);
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
  });

  test('all still-learning marks offer another round and finish only after know-it marks', async ({ page }) => {
    const board = page.getByTestId('labelit');
    const status = page.getByTestId('labelit-status');
    const live = page.getByTestId('labelit-live');
    await board.getByRole('button', { name: 'reveal all' }).click();
    for (let number = 1; number <= 4; number++) {
      await board.getByRole('group', { name: `mark label ${number}` })
        .getByRole('button', { name: 'still learning', exact: true }).click();
    }
    await expect(live).toHaveText('door: still learning. round 1 done. 4 still learning.');
    await expect(board.getByText("that's every label for now.")).toHaveCount(0);
    await board.getByRole('button', { name: 'study the 4 still learning' }).click();
    await expect(status).toHaveText('round 2 · 4 covered · know it: 0 · still learning: 0');
    await expect(live).toHaveText('round 2: 4 covered again.');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
    await board.getByRole('button', { name: 'reveal all' }).click();
    for (let number = 1; number <= 4; number++) {
      await board.getByRole('group', { name: `mark label ${number}` })
        .getByRole('button', { name: 'know it', exact: true }).click();
    }
    await expect(status).toHaveText('round 2 · 0 covered · know it: 4 · still learning: 0');
    await expect(live).toHaveText('door: know it. round 2 done. all 4 labels known.');
    await expect(board.getByText("that's every label for now.")).toBeVisible();
  });

  test('reveal-all preserves marks, and start over works mid-round', async ({ page }) => {
    const board = page.getByTestId('labelit');
    const status = page.getByTestId('labelit-status');
    const live = page.getByTestId('labelit-live');
    await board.getByRole('button', { name: 'uncover label 1' }).click();
    await board.getByRole('group', { name: 'mark label 1' }).getByRole('button', { name: 'know it' }).click();
    await board.getByRole('button', { name: 'reveal all' }).click();
    await expect(status).toHaveText('0 covered · know it: 1 · still learning: 0');
    await expect(board.getByRole('group', { name: 'mark label 2' }).getByRole('button', { name: 'know it' })).toBeFocused();
    await expect(board.getByRole('group', { name: 'mark label 1' }).getByRole('button', { name: 'know it' })).toHaveAttribute('aria-pressed', 'true');

    const restart = board.getByRole('button', { name: 'start over', exact: true });
    await expect(restart).toBeVisible();
    await restart.click();
    await expect(status).toHaveText('4 covered · know it: 0 · still learning: 0');
    await expect(live).toHaveText('every label covered. starting over.');
    await expect(board.getByRole('group', { name: 'mark label 1' })).toHaveCount(0);
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
  });

  test('cover-all clears earlier marks and places focus on the status', async ({ page }) => {
    const board = page.getByTestId('labelit');
    await board.getByRole('button', { name: 'uncover label 1' }).click();
    await board.getByRole('group', { name: 'mark label 1' }).getByRole('button', { name: 'still learning' }).click();
    await board.getByRole('button', { name: 'cover all' }).click();
    await expect(page.getByTestId('labelit-status')).toHaveText('4 covered · know it: 0 · still learning: 0');
    await expect(page.getByTestId('labelit-live')).toHaveText('every label covered again.');
    await expect(board.locator('[tabindex="-1"]').first()).toBeFocused();
  });

  test('failed resume clears a stale diagram save and lifecycle cannot put it back', async ({ page }) => {
    const board = page.getByTestId('labelit');
    await board.getByRole('button', { name: 'uncover label 1', exact: true }).click();
    await board.getByRole('group', { name: 'mark label 1', exact: true }).getByRole('button', { name: 'know it', exact: true }).click();
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null'));
    expect(snapshot).not.toBeNull();
    snapshot.module = 'old-sample';
    // Seed the next document after this document's pagehide flush.
    await page.addInitScript(snapshot => localStorage.setItem('cueory-resume', JSON.stringify(snapshot)), snapshot);
    await page.reload();
    await page.getByRole('button', { name: 'continue question 2', exact: true }).click();
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
    expect(await page.evaluate(() => localStorage.getItem('cueory-resume'))).toBeNull();
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    expect(await page.evaluate(() => localStorage.getItem('cueory-resume'))).toBeNull();
  });

  test('mid-round start over keeps a different study mode saved through reload', async ({ page }) => {
    await page.goto('/learn/study-skills/cards');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Know it', exact: true }).click();
    await expect(page.getByTestId('card-status')).toContainText('Card 2 of 3');

    await page.goto(samplePage);
    const saved = await page.evaluate(() => localStorage.getItem('cueory-resume'));
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!)).toMatchObject({ tool: 'cards', itemIndex: 1 });
    const board = page.getByTestId('labelit');
    await board.getByRole('button', { name: 'reveal all' }).click();
    await board.getByRole('button', { name: 'start over', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('cueory-resume'))).toBe(saved);

    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem('cueory-resume'))).toBe(saved);
    await page.goto('/learn/study-skills/cards');
    await page.getByRole('button', { name: 'continue question 2' }).click();
    await expect(page.getByTestId('card-status')).toContainText('Card 2 of 3 · Know it: 1 · Still learning: 0');
  });
});

for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`label-it controls are accessible at ${width}px in ${scheme} mode`, async ({ page }) => {
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* ignore */ }
      });
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(samplePage);
      const board = page.getByTestId('labelit');
      await expect(board).toBeVisible();
      const cover = page.getByTestId('cover-1');
      const size = await cover.boundingBox();
      expect(size!.width).toBeGreaterThanOrEqual(44);
      expect(size!.height).toBeGreaterThanOrEqual(44);
      await board.getByRole('button', { name: 'reveal all' }).click();
      const firstMark = board.getByRole('group', { name: 'mark label 1' }).getByRole('button', { name: 'know it' });
      await expect(firstMark).toBeFocused();
      const markSize = await firstMark.boundingBox();
      expect(markSize!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await board.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)).toBe(0);
    });
  }
}

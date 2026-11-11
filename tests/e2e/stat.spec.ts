import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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
  await expect(rows.nth(0)).toContainText('not right');
  await expect(rows.nth(0)).toContainText('no answer (time ran out)');
  await expect(rows.nth(0)).toContainText(`answer: ${key[0]!.toUpperCase()}`);
  await expect(rows.nth(1)).toContainText('right');
  await expect(rows.nth(1)).not.toContainText('not right');
  await expect(rows.nth(14)).toContainText('not right');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.getByTestId('stat-copy').click();
  await expect(page.getByTestId('stat-copied')).toHaveText(/copied\.|copying is blocked/);

  await page.getByTestId('stat-again').click();
  await expect(progress(page)).toHaveText('question 1 of 15');
  await expect(choice(page, 'a')).toHaveAttribute('aria-pressed', 'false');
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

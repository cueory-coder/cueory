import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Guest progress and onboarding (D-69). Everything here is saved in the browser only.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

const axe = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
};

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('cueory-progress') ?? 'null'));

const noSideScroll = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};

test('onboarding answers are saved on this device and shown on the progress page', async ({ page }) => {
  test.slow(); // several accessibility scans in one flow
  await page.goto('/start');
  await expect(page.locator('h1')).toHaveText('get started');
  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await axe(page);

  await page.getByRole('radio', { name: 'med-surg i' }).check();
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
  await page.getByLabel('when is your exam?').fill('2027-05-12');
  await page.getByRole('button', { name: 'save my answers' }).click();
  await expect(page.locator(':focus')).toContainText('saved on this device.');
  await expect(page.getByText('course: med-surg i. exam: may 12, 2027.')).toBeVisible();
  expect((await saved(page)).onboarding).toEqual({ course: 'med-surg-1', examDate: '2027-05-12', done: true });

  await page.getByRole('link', { name: 'see what’s saved on this device' }).click();
  await expect(page.getByText('course: med-surg i')).toBeVisible();
  await expect(page.getByText('exam: may 12, 2027')).toBeVisible();
  await axe(page);

  // The answers come back pre-filled on their own screens.
  await page.getByRole('link', { name: 'change your answers' }).click();
  await expect(page.getByRole('radio', { name: 'med-surg i' })).toBeChecked();
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  await expect(page.getByLabel('when is your exam?')).toHaveValue('2027-05-12');
});

test('onboarding can be skipped, and skipping keeps earlier answers', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('button', { name: 'skip for now' }).click();
  await expect(page.locator(':focus')).toContainText('all set.');
  expect((await saved(page)).onboarding).toEqual({ course: null, examDate: null, done: true });

  await page.goto('/start');
  await page.getByRole('radio', { name: 'fundamentals' }).check();
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  await page.getByRole('button', { name: 'save my answers' }).click();
  await page.goto('/start');
  await page.getByRole('button', { name: 'skip for now' }).click();
  expect((await saved(page)).onboarding.course).toBe('fundamentals');
});

test('skipping after another tab forgets does not restore the stale answers (Codex on #74)', async ({ page, context }) => {
  // Set up: save a course in this tab, then come back to the first question.
  await page.goto('/start');
  await page.getByRole('radio', { name: 'fundamentals' }).check();
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  await page.getByRole('button', { name: 'save my answers' }).click();
  await page.goto('/start');

  // Another tab forgets all progress.
  const other = await context.newPage();
  await other.goto('/progress');
  await other.getByRole('button', { name: 'forget my progress on this device' }).click();
  await other.getByRole('button', { name: 'yes, forget it' }).click();
  await expect(other.getByText('done. your progress is no longer saved on this device.')).toBeVisible();
  await other.close();

  // Skip must use the current storage, not the old mounted course answer.
  await page.getByRole('button', { name: 'skip for now' }).click();
  expect((await saved(page)).onboarding).toEqual({ course: null, examDate: null, done: true });
});

test('"clear the date" empties the date and puts focus back on it (Codex on #74)', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  const date = page.getByLabel('when is your exam?');
  await date.fill('2027-05-12');
  const clear = page.getByRole('button', { name: 'clear the date' });
  await clear.focus();
  await page.keyboard.press('Enter');
  await expect(date).toHaveValue('');
  await expect(date).toBeFocused();
  await expect(clear).toHaveCount(0);
});

test('onboarding works with the keyboard alone', async ({ page }) => {
  await page.goto('/start');
  const first = page.getByRole('radio', { name: 'fundamentals' });
  await first.focus();
  await page.keyboard.press('ArrowDown'); // med-surg i
  await expect(page.getByRole('radio', { name: 'med-surg i' })).toBeChecked();
  await page.keyboard.press('Enter'); // continue to the next question
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
  await page.getByRole('button', { name: 'save my answers' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(':focus')).toContainText('saved on this device.');
});

test('card piles and stars show on the progress page; download and forget work', async ({ page }) => {
  test.slow(); // several accessibility scans in one flow
  await page.goto('/progress');
  await expect(page.getByText('nothing saved yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'download my progress' })).toBeDisabled();

  await page.goto('/learn/study-skills/cards');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Still learning' }).click();
  await page.getByRole('button', { name: 'Star', exact: true }).click();
  expect((await saved(page)).decks['study-skills-01']).toEqual({ know: ['ss01-c01'], learning: ['ss01-c02'], starred: ['ss01-c03'] });

  // "Back" undoes the last sort on the device too.
  await page.getByRole('button', { name: 'Back' }).click();
  expect((await saved(page)).decks['study-skills-01'].learning).toEqual([]);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Still learning' }).click();

  await page.getByRole('link', { name: 'See or clear them' }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(page.getByText('1 know it · 1 still learning · 1 star')).toBeVisible();
  await noSideScroll(page);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download my progress' }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^cueory-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const content = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(content.decks['study-skills-01'].know).toEqual(['ss01-c01']);
  expect(content.about).toMatch(/nothing here was sent to cueory/);

  await page.getByRole('button', { name: 'forget my progress on this device' }).click();
  const keep = page.getByRole('button', { name: 'keep it' });
  await expect(page.getByRole('button', { name: 'yes, forget it' })).toBeFocused();
  await axe(page);
  await keep.click();
  expect(await saved(page)).not.toBeNull();

  await page.getByRole('button', { name: 'forget my progress on this device' }).click();
  // Focus moves to "yes, forget it" one frame after the question appears; wait for it before pressing Enter.
  await expect(page.getByRole('button', { name: 'yes, forget it' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('done. your progress is no longer saved on this device.')).toBeFocused();
  expect(await saved(page)).toBeNull();
  await expect(page.getByText('nothing saved yet.', { exact: false })).toBeVisible();
  // The theme pick and promo date aren't progress, so they stay.
  expect(await page.evaluate(() => localStorage.getItem('cueory-promo-seen'))).not.toBeNull();
});

test('stars saved before D-69 still show, and move into the record when they change', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cueory-stars-study-skills-01', '["ss01-c01"]'));
  await page.goto('/learn/study-skills/cards');
  const star = page.getByRole('button', { name: 'Star', exact: true });
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await star.click();
  expect(await page.evaluate(() => localStorage.getItem('cueory-stars-study-skills-01'))).toBeNull();
});

test('stars kept only under old keys show on the progress page, and forget removes them all', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('cueory-stars-study-skills-01', '["ss01-c01"]');
    localStorage.setItem('cueory-stars-retired-deck', '["x9"]');
  });
  await page.goto('/progress');
  await expect(page.getByText('0 know it · 0 still learning · 1 star')).toHaveCount(2);
  await expect(page.getByText('a deck no longer on the site (retired-deck)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'download my progress' })).toBeEnabled();

  await page.getByRole('button', { name: 'forget my progress on this device' }).click();
  await page.getByRole('button', { name: 'yes, forget it' }).click();
  const left = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('cueory-') && key !== 'cueory-promo-seen'));
  expect(left).toEqual([]);
});

test('the progress page picks up what another tab saves, and the download includes it (Codex on #74)', async ({ page, context }) => {
  await page.goto('/progress');
  await expect(page.getByText('nothing saved yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'download my progress' })).toBeDisabled();

  const other = await context.newPage();
  await other.goto('/learn/study-skills/cards');
  await other.getByRole('button', { name: 'Show answer' }).click();
  await other.getByRole('button', { name: 'Know it' }).click();
  await other.close();

  // The other tab's save reaches this page through the browser's storage event.
  await expect(page.getByText('1 know it · 0 still learning · 0 stars')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download my progress' }).click();
  const content = JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
  expect(content.decks['study-skills-01'].know).toEqual(['ss01-c01']);
});

test('an open card deck does not bring back stars or piles forgotten in another tab (Codex on #74)', async ({ page, context }) => {
  await page.goto('/learn/study-skills/cards');
  await page.getByRole('button', { name: 'Star', exact: true }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  expect((await saved(page)).decks['study-skills-01'].starred).toEqual(['ss01-c01']);

  const other = await context.newPage();
  await other.goto('/progress');
  await other.getByRole('button', { name: 'forget my progress on this device' }).click();
  await other.getByRole('button', { name: 'yes, forget it' }).click();
  await expect(other.getByText('done. your progress is no longer saved on this device.')).toBeVisible();
  await other.close();

  // Back must not restore the forgotten pile, and a new star must not bring the old one back.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Still learning' }).click();
  await page.getByRole('button', { name: 'Star', exact: true }).click();
  const after = (await saved(page)).decks['study-skills-01'];
  expect(after.starred).toEqual(['ss01-c02']);
  expect(after.know).toEqual([]);
});

test('the pages fit a 320 px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/start', '/progress']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await noSideScroll(page);
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('both pages explain that they need JavaScript', async ({ page }) => {
    // Playwright's text matching skips <noscript>, so this reads the paragraph's text directly.
    const noscriptText = (page: Page) => page.locator('main noscript p').evaluate((el) => el.textContent ?? '');
    await page.goto('/start');
    expect(await noscriptText(page)).toContain('these questions need javascript turned on.');
    await expect(page.locator('main button')).toHaveCount(0);
    await page.goto('/progress');
    expect(await noscriptText(page)).toContain('this page needs javascript turned on');
  });
});

test('new students see two accessible routes to begin and a polite state announcement', async ({ page }) => {
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'your progress starts here' })).toBeVisible();
  await expect(page.getByTestId('progress-state')).toHaveText('no saved progress yet. choose where to start.');
  await expect(page.getByTestId('progress-state')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByRole('link', { name: 'study skills' })).toHaveAttribute('href', '/learn/study-skills');
  await expect(page.getByRole('link', { name: 'daily games' })).toHaveAttribute('href', '/play');
  await expect(page.getByRole('button', { name: 'download my progress' })).toBeDisabled();
});

test('bad saved data remains untouched and the retry state is keyboard-operable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cueory-progress', '{not json'));
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'we couldn’t read your progress' })).toBeVisible();
  await expect(page.getByTestId('progress-state')).toHaveText('we couldn’t read your saved progress on this device.');
  await expect(page.getByText('{not json')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'download my progress' })).toHaveCount(0);
  const retry = page.getByRole('button', { name: 'try again' });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'we couldn’t read your progress' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cueory-progress'))).toBe('{not json');
});

test('retry recovers when previously unreadable data becomes readable', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded-corruption')) return;
    sessionStorage.setItem('seeded-corruption', '1');
    localStorage.setItem('cueory-progress', '{not json');
  });
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'we couldn’t read your progress' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('cueory-progress', JSON.stringify({
    version: 1, onboarding: { course: 'fundamentals', done: true },
  })));
  await page.getByRole('button', { name: 'try again' }).click();
  await expect(page.getByTestId('progress-state')).toHaveText('your saved progress is ready.');
  await expect(page.getByText('course: fundamentals')).toBeVisible();
  await expect(page.getByRole('button', { name: 'download my progress' })).toBeEnabled();
});

test('blocked progress reads show a helpful message without raw browser errors', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'cueory-progress') throw new Error('internal storage error');
      return original.call(this, key);
    };
  });
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'we couldn’t read your progress' })).toBeVisible();
  await expect(page.getByText('internal storage error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'try again' })).toBeEnabled();
});

test('mixed old stars and current saved data show together as ready', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-progress', JSON.stringify({
      version: 1, onboarding: { done: true }, decks: { 'study-skills-01': { know: ['ss01-c01'] } },
    }));
    localStorage.setItem('cueory-stars-study-skills-01', '["ss01-c03"]');
  });
  await page.goto('/progress');
  await expect(page.getByTestId('progress-state')).toHaveText('your saved progress is ready.');
  await expect(page.getByText('1 know it · 0 still learning · 1 star')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'your progress starts here' })).toHaveCount(0);
});

for (const width of [390, 820, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`progress states at ${width}px in ${colorScheme}: axe, touch targets and no sideways scroll`, async ({ page }) => {
      test.slow(); // two full axe scans, one for each visible state
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 820 ? 1180 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/progress');
      await expect(page.getByRole('heading', { name: 'your progress starts here' })).toBeVisible();
      await noSideScroll(page);
      for (const name of ['study skills', 'daily games']) {
        const target = await page.getByRole('link', { name }).boundingBox();
        expect(target?.width).toBeGreaterThanOrEqual(44);
        expect(target?.height).toBeGreaterThanOrEqual(44);
      }
      await axe(page);
      await page.evaluate(() => localStorage.setItem('cueory-progress', 'not-json'));
      await page.reload();
      await expect(page.getByRole('heading', { name: 'we couldn’t read your progress' })).toBeVisible();
      const retry = await page.getByRole('button', { name: 'try again' }).boundingBox();
      expect(retry?.width).toBeGreaterThanOrEqual(44);
      expect(retry?.height).toBeGreaterThanOrEqual(44);
      await noSideScroll(page);
      await axe(page);
    });
  }
}

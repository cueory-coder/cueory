import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Task 78: the flashcard deck as a real card. The older card tests in pages.spec.ts and progress.spec.ts still hold.
const DECK_URL = '/learn/study-skills/cards';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

// Suppress the promo panel (same pattern as pages.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      /* blocked storage: panel never shows */
    }
  });
});

const card = (page: Page) => page.getByTestId('flashcard');
const status = (page: Page) => page.getByTestId('card-status');

async function expectAnswerSide(page: Page) {
  await expect(page.getByRole('region', { name: 'Answer' })).toBeVisible();
  await expect(card(page)).toHaveClass(/\bis-flipped\b/);
  await expect(page.getByRole('button', { name: 'Know it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Still learning' })).toBeVisible();
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

// ── Three screen sizes: flip by click, tap and Space; axe in both palettes ─────────────────────────────────────────

const sizes = [
  { label: 'phone', viewport: { width: 390, height: 844 } },
  { label: 'tablet', viewport: { width: 820, height: 1180 } },
  { label: 'desktop', viewport: { width: 1440, height: 900 } },
];

for (const size of sizes) {
  test.describe(`at ${size.label} size`, () => {
    test.use({ viewport: size.viewport, hasTouch: true });

    test('clicking the card flips it, and clicking again flips it back', async ({ page }) => {
      await page.goto(DECK_URL);
      await expect(page.getByRole('region', { name: 'Question' })).toBeVisible();
      await card(page).click();
      await expectAnswerSide(page);
      await card(page).click();
      await expect(page.getByRole('region', { name: 'Question' })).toBeVisible();
      await expect(card(page)).not.toHaveClass(/\bis-flipped\b/);
    });

    test('tapping the card flips it', async ({ page }) => {
      await page.goto(DECK_URL);
      await card(page).tap();
      await expectAnswerSide(page);
    });

    test('Space flips the card', async ({ page }) => {
      await page.goto(DECK_URL);
      await card(page).focus();
      await page.keyboard.press('Space');
      await expectAnswerSide(page);
      await expect(card(page)).toBeFocused();
    });

    test('daytime and evening palettes pass the accessibility checks', async ({ page }) => {
      await page.goto(DECK_URL);
      await expect(card(page)).toBeVisible();
      await axeClean(page);
      await page.getByRole('button', { name: 'Show answer' }).click();
      await axeClean(page);
      await page.emulateMedia({ colorScheme: 'dark' });
      await axeClean(page);
    });

    test('nothing scrolls sideways', async ({ page }) => {
      await page.goto(DECK_URL);
      await card(page).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────────────────────────────────────────

test('Enter on the focused card flips it', async ({ page }) => {
  await page.goto(DECK_URL);
  await card(page).focus();
  await page.keyboard.press('Enter');
  await expectAnswerSide(page);
});

test('1 sorts into "Know it" and 2 into "Still learning", only once the answer shows', async ({ page }) => {
  await page.goto(DECK_URL);
  await card(page).focus();
  await page.keyboard.press('1'); // question side: nothing happens
  await expect(status(page)).toContainText('Card 1 of 3 · Know it: 0 · Still learning: 0');

  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  await expect(status(page)).toContainText('Card 2 of 3 · Know it: 1 · Still learning: 0');
  await expect(card(page)).toBeFocused();

  await page.keyboard.press('Space');
  await page.keyboard.press('2');
  await expect(status(page)).toContainText('Card 3 of 3 · Know it: 1 · Still learning: 1');
});

test('← goes back a card and → shows the answer', async ({ page }) => {
  await page.goto(DECK_URL);
  await card(page).focus();
  await page.keyboard.press('ArrowRight');
  await expectAnswerSide(page);
  await page.keyboard.press('1');
  await expect(status(page)).toContainText('Card 2 of 3');
  await page.keyboard.press('ArrowLeft');
  await expect(status(page)).toContainText('Card 1 of 3 · Know it: 0 · Still learning: 0');
});

test('S stars the card; Space on a focused button still presses that button', async ({ page }) => {
  await page.goto(DECK_URL);
  const star = page.getByRole('button', { name: 'Star', exact: true });
  await card(page).focus();
  await page.keyboard.press('s');
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: 'Only starred cards (1)' })).toBeEnabled();

  // Space on the Star button toggles the star; the card stays on its question.
  await star.focus();
  await page.keyboard.press('Space');
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('region', { name: 'Question' })).toBeVisible();

  // Space on "Show answer" presses it once (no double flip).
  await page.getByRole('button', { name: 'Show answer' }).focus();
  await page.keyboard.press('Space');
  await expectAnswerSide(page);
});

test('shortcuts are ignored while typing in a field inside the deck', async ({ page }) => {
  await page.goto(DECK_URL);
  await expect(page.getByTestId('card-keys')).toBeVisible();
  await page.evaluate(() => {
    const field = document.createElement('input');
    field.setAttribute('aria-label', 'test field');
    document.querySelector('[data-testid="card-keys"]')?.append(field);
  });
  await page.getByRole('textbox', { name: 'test field' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('s');
  await expect(page.getByRole('region', { name: 'Question' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Star', exact: true })).toHaveAttribute('aria-pressed', 'false');

  // Keys pressed on the footer's controls belong to the footer, not the deck.
  await page.getByRole('contentinfo').locator('[data-footer-toggle]').focus();
  await page.keyboard.press('s');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('region', { name: 'Question' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Star', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

// ── Progress ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('the progress bar and text follow the card number', async ({ page }) => {
  await page.goto(DECK_URL);
  const bar = page.getByRole('progressbar', { name: 'Cards in this round' });
  await expect(bar).toHaveAttribute('aria-valuenow', '1');
  await expect(bar).toHaveAttribute('aria-valuemax', '3');
  await expect(bar).toHaveAttribute('aria-valuetext', 'Card 1 of 3');
  const fill = bar.locator('.progress-fill');
  await expect.poll(() => fill.evaluate((el) => getComputedStyle(el).getPropertyValue('--progress').trim())).toBe(
    String(1 / 3),
  );

  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await expect(bar).toHaveAttribute('aria-valuenow', '2');
  await expect(bar).toHaveAttribute('aria-valuetext', 'Card 2 of 3');
  await expect(status(page)).toContainText('Card 2 of 3 · Know it: 1 · Still learning: 0');
  await expect.poll(() => fill.evaluate((el) => getComputedStyle(el).getPropertyValue('--progress').trim())).toBe(
    String(2 / 3),
  );

  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Know it' }).click();
  }
  await expect(page.getByText("That's every card for now.")).toBeVisible();
  const doneFill = page.getByRole('progressbar').locator('.progress-fill');
  await expect.poll(() => doneFill.evaluate((el) => getComputedStyle(el).getPropertyValue('--progress').trim())).toBe(
    '1',
  );
});

test('flipping and sorting raise no CSP or console errors, and the card has no style="" attributes', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && violations.push(msg.text()));
  await page.goto(DECK_URL);
  await card(page).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  expect(await page.locator('[data-testid="flashcard"] [style], [data-testid="flashcard"][style]').count()).toBe(0);
  expect(violations).toEqual([]);
});

// ── Reduced motion ─────────────────────────────────────────────────────────────────────────────────────────────────

test('with reduced motion the card never turns: no transform transition and no rotation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(DECK_URL);
  const inner = card(page).locator('.flip-inner');
  // The shared reduced-motion rule leaves at most 0.01 ms (computed "1e-05s"), so allow anything up to 0.01 s.
  const transformTransition = () =>
    inner.evaluate((el) => {
      const style = getComputedStyle(el);
      const props = style.transitionProperty.split(',').map((p) => p.trim());
      const durations = style.transitionDuration.split(',').map((d) => parseFloat(d) * (d.trim().endsWith('ms') ? 0.001 : 1));
      return props.some((p, i) => (p === 'transform' || p === 'all') && (durations[i % durations.length] ?? 0) > 0.01);
    });
  expect(await transformTransition()).toBe(false);

  await card(page).click();
  await expectAnswerSide(page);
  expect(await transformTransition()).toBe(false);
  expect(await inner.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  // The question side fades out instead, so only the answer shows.
  await expect(card(page).locator('.flip-face')).toHaveCSS('opacity', '0');
  await expect(card(page).locator('.flip-back')).toHaveCSS('opacity', '1');
});

test('without reduced motion the card turns with a short transform transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(DECK_URL);
  const inner = card(page).locator('.flip-inner');
  const style = await inner.evaluate((el) => ({
    property: getComputedStyle(el).transitionProperty,
    duration: getComputedStyle(el).transitionDuration,
  }));
  expect(style.property).toContain('transform');
  expect(parseFloat(style.duration)).toBeGreaterThan(0.1);
  expect(parseFloat(style.duration)).toBeLessThanOrEqual(0.4);
});

// ── Keys hint ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('the keys hint shows and can be hidden', async ({ page }) => {
  await page.goto(DECK_URL);
  const hint = page.getByTestId('card-keys');
  await expect(hint).toContainText('Space flip');
  await page.getByRole('button', { name: 'Hide the keys hint' }).click();
  await expect(hint).toHaveCount(0);
  await expect(card(page)).toBeFocused();
});

// ── Study options ──────────────────────────────────────────────────────────────────────────────────────────────────

test('Shuffle and "Only starred cards" are real checkboxes in one tidy control', async ({ page }) => {
  await page.goto(DECK_URL);
  const group = page.getByRole('group', { name: 'Study options' });
  const shuffle = group.getByRole('checkbox', { name: 'Shuffle' });
  const onlyStarred = group.getByRole('checkbox', { name: 'Only starred cards (0)' });
  await expect(onlyStarred).toBeDisabled();
  await expect(shuffle).not.toBeChecked();
  // The invisible box covers its whole segment, so tapping anywhere on the segment toggles it.
  await group.locator('label').filter({ hasText: 'Shuffle' }).click();
  await expect(shuffle).toBeChecked();
  // An "on" option shows a check mark, not only a fill color.
  await expect(group.locator('label').filter({ hasText: 'Shuffle' }).locator('svg')).toHaveCount(1);
  await shuffle.focus();
  await page.keyboard.press('Space');
  await expect(shuffle).not.toBeChecked();
});

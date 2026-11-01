import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const DECK_URL = '/learn/study-skills/cards';

// Suppress the promo panel (same pattern as pages.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch { /* blocked storage: panel never shows */ }
  });
});

// ── Card flip ──────────────────────────────────────────────────────────────

test('clicking the card flips it to show the answer', async ({ page }) => {
  await page.goto(DECK_URL);
  const card = page.getByRole('region', { name: /Question/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole('region', { name: /Answer/ })).toBeVisible();
});

test('"Show answer" button flips the card', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('region', { name: /Answer/ })).toBeVisible();
});

test('"Show question" button flips back', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Show question' }).click();
  await expect(page.getByRole('region', { name: /Question/ })).toBeVisible();
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────

test('Space flips the card', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.locator('[aria-live]').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: /Answer/ })).toBeVisible();
});

test('1 sorts as "know it" when answer is showing', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.locator('[aria-live]').focus();
  await page.keyboard.press('Space'); // flip to answer
  const before = await page.getByText(/Know: \d+/).textContent();
  await page.keyboard.press('1');
  await expect(page.getByText(/Know: \d+/)).not.toHaveText(before ?? '');
});

test('2 sorts as "still learning" when answer is showing', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.locator('[aria-live]').focus();
  await page.keyboard.press('Space');
  const before = await page.getByText(/Learning: \d+/).textContent();
  await page.keyboard.press('2');
  await expect(page.getByText(/Learning: \d+/)).not.toHaveText(before ?? '');
});

test('S toggles the star', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.locator('[aria-live]').focus();
  const btn = page.getByRole('button', { name: /Star/ });
  const before = await btn.getAttribute('aria-pressed');
  await page.keyboard.press('s');
  const after = await btn.getAttribute('aria-pressed');
  expect(after).not.toBe(before);
});

test('← key goes back when pos > 0', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.locator('[aria-live]').focus();
  // Advance once: flip then sort as "know it"
  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  // Now go back
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('Card 1 of')).toBeVisible();
});

test('→ key flips the card when on question side', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.locator('[aria-live]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('region', { name: /Answer/ })).toBeVisible();
});

// ── Progress bar ───────────────────────────────────────────────────────────

test('progress text updates after sorting a card', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByText('Card 1 of')).toBeVisible();
  await page.getByRole('button', { name: 'Know it' }).click();
  await expect(page.getByText('Card 2 of')).toBeVisible();
});

test('progress bar has correct aria attributes', async ({ page }) => {
  await page.goto(DECK_URL);
  const bar = page.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await expect(bar).toHaveAttribute('aria-valuenow', '2');
});

// ── Reduced motion ─────────────────────────────────────────────────────────

test('no transform transition on .flip-inner under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(DECK_URL);
  const transitionDuration = await page.locator('.flip-inner').evaluate(
    (el) => getComputedStyle(el).transitionDuration,
  );
  // "0s" means no duration — transition is suppressed
  expect(transitionDuration).toBe('0s');
});

// ── Keyboard hint ──────────────────────────────────────────────────────────

test('keyboard hint is visible by default', async ({ page }) => {
  await page.goto(DECK_URL);
  await expect(page.getByText('Space flip')).toBeVisible();
});

test('dismiss button hides the keyboard hint', async ({ page }) => {
  await page.goto(DECK_URL);
  await page.getByRole('button', { name: 'Dismiss keyboard hint' }).click();
  await expect(page.getByText('Space flip')).not.toBeVisible();
});

// ── Segmented study options ────────────────────────────────────────────────

test('Shuffle checkbox toggles shuffle mode', async ({ page }) => {
  await page.goto(DECK_URL);
  const cb = page.getByRole('checkbox', { name: 'Shuffle' });
  await expect(cb).not.toBeChecked();
  await cb.check();
  await expect(cb).toBeChecked();
});

test('Starred checkbox is disabled when there are no starred cards', async ({ page }) => {
  await page.goto(DECK_URL);
  await expect(page.getByRole('checkbox', { name: /Starred/ })).toBeDisabled();
});

// ── Accessibility ──────────────────────────────────────────────────────────

test.describe('axe', () => {
  const viewports = [
    { width: 390, height: 844, label: 'phone' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 800, label: 'desktop' },
  ];

  for (const vp of viewports) {
    test(`daytime at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(DECK_URL);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test(`evening at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(DECK_URL);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

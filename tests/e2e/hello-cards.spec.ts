import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import data from '../../content/games/hello-cards/starters.json' with { type: 'json' };

const card = (page: Page) => page.getByTestId('hello-card');
const text = (page: Page) => page.getByTestId('hello-card-text');
const category = (page: Page, name: string) => page.getByRole('group', { name: 'who is it for' }).getByRole('button', { name, exact: true });
const depth = (page: Page, name: string) => page.getByRole('group', { name: 'how deep' }).getByRole('button', { name, exact: true });
const next = (page: Page) => page.getByRole('button', { name: 'next card', exact: true });
const textsFor = (name: string, level?: string) => data.starters.filter((s) => s.category === name && (!level || s.depth === level)).map((s) => s.text);

test.beforeEach(async ({ page }) => {
  // The once-only promo panel would take keyboard focus mid-test (as in play.spec.ts).
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage blocked */ }
  });
  await page.goto('/play/hello-cards');
  await expect(card(page)).toBeEnabled();
});

test('the games page links to hello cards and the page says its cards are samples', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'hello cards' })).toBeVisible();
  await expect(page.getByText('sample cards · awaiting content approval')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.goto('/play');
  await page.getByTestId('hello-cards-link').click();
  await expect(page).toHaveURL(/\/play\/hello-cards\/?$/);
});

test('the card flips by click and by keyboard and shows a starter from the chosen category', async ({ page }) => {
  await expect(card(page)).toHaveAttribute('aria-pressed', 'false');
  await card(page).click();
  await expect(card(page)).toHaveAttribute('aria-pressed', 'true');
  expect(textsFor('patients', 'small')).toContain((await text(page).textContent())!.trim());
  await card(page).focus();
  await page.keyboard.press('Space');
  await expect(card(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(card(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await card(page).evaluate((el) => el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) > 0)).toBe(true);
});

test('categories filter the cards and next card never repeats the card on screen', async ({ page }) => {
  await expect(category(page, 'patients')).toHaveAttribute('aria-pressed', 'true');
  for (const [button, key] of [['co-workers', 'coworkers'], ['classmates', 'classmates'], ['get to know yourself', 'yourself']] as const) {
    await category(page, button).click();
    await expect(category(page, button)).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page)).toHaveAttribute('aria-pressed', 'false');
    let previous = '';
    for (let i = 0; i < 6; i++) {
      await card(page).click();
      const shown = (await text(page).textContent())!.trim();
      expect(textsFor(key, 'small')).toContain(shown);
      expect(shown).not.toBe(previous);
      previous = shown;
      await next(page).click();
      await expect(card(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(card(page)).toBeFocused();
    }
  }
});

test('it keeps no data: no scores, no storage writes, no requests off the site', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://localhost') && !request.url().startsWith('data:')) external.push(request.url()); });
  await card(page).click();
  await next(page).click();
  expect(external).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /hello/i.test(key)))).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`passes axe, fits the screen and has 44px targets in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await expect(card(page)).toBeEnabled();
    for (const flipped of [false, true]) {
      if (flipped) await card(page).click();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const button of [depth(page, 'small talk'), depth(page, 'deep convo'), category(page, 'get to know yourself'), category(page, 'patients'), category(page, 'co-workers'), category(page, 'classmates'), next(page), card(page)]) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });
}

test('with reduced motion the card swaps without a 3D turn', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(card(page)).toBeEnabled();
  await card(page).click();
  await expect(card(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.flip-inner').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await expect(page.getByTestId('hello-card-back')).toBeVisible();
});

test('the small talk / deep convo switch filters cards, shows its state in text and is announced', async ({ page }) => {
  await expect(depth(page, 'small talk')).toHaveAttribute('aria-pressed', 'true');
  await expect(depth(page, 'small talk')).toContainText('✓');
  await expect(depth(page, 'deep convo')).not.toContainText('✓');
  await depth(page, 'deep convo').focus();
  await page.keyboard.press('Enter');
  await expect(depth(page, 'deep convo')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status', { name: 'hello cards update' })).toHaveText('deep convo chosen. a new card is face down.');
  for (let i = 0; i < 5; i++) {
    await card(page).click();
    expect(textsFor('patients', 'deep')).toContain((await text(page).textContent())!.trim());
    await next(page).click();
  }
  await expect(page.getByTestId('hello-daily')).toContainText('deep convo');
});

test('the prompt of the day shows today\'s date, is the same on reload and changes the next day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00'));
  await page.reload();
  const daily = page.getByTestId('hello-daily-text');
  await expect(page.getByTestId('hello-daily')).toContainText('sat 7 nov');
  const first = (await daily.textContent())!;
  expect(data.starters.map((s) => s.text)).toContain(first);
  await page.reload();
  await expect(daily).toHaveText(first);
  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00'));
  await page.reload();
  await expect(daily).not.toHaveText(first);
  await expect(page.getByTestId('hello-daily')).toContainText('sun 8 nov');
});

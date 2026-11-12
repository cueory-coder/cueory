import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import data from '../../content/games/hello-cards/starters.json' with { type: 'json' };

const card = (page: Page) => page.getByTestId('hello-card');
const text = (page: Page) => page.getByTestId('hello-card-text');
const depthSwitch = (page: Page) => page.getByRole('switch', { name: 'deep convo', exact: true });
const update = (page: Page) => page.getByRole('status', { name: 'hello cards update' });
const lead = (text: string) => (data.starters.find((s) => s.text === text)!.category === 'yourself' ? 'ask yourself' : 'try asking');
const next = (page: Page) => page.getByRole('button', { name: 'next card', exact: true });
const textsFor = (level: string) => data.starters.filter((s) => s.depth === level).map((s) => s.text);

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

test('the card flips by click and by keyboard and shows a starter', async ({ page }) => {
  await expect(card(page)).toHaveAttribute('aria-pressed', 'false');
  await card(page).click();
  await expect(card(page)).toHaveAttribute('aria-pressed', 'true');
  expect(textsFor('small')).toContain((await text(page).textContent())!.trim());
  await card(page).focus();
  await page.keyboard.press('Space');
  await expect(card(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(card(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await card(page).evaluate((el) => el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) > 0)).toBe(true);
});

test('there is no audience picker; next card stays in the chosen depth, never repeats and mixes categories', async ({ page }) => {
  await expect(page.getByRole('group', { name: 'who is it for' })).toHaveCount(0);
  for (const name of ['patients', 'co-workers', 'classmates', 'get to know yourself']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  let previous = '';
  const categories = new Set<string>();
  for (let i = 0; i < 8; i++) {
    await card(page).click();
    const shown = (await text(page).textContent())!.trim();
    expect(textsFor('small')).toContain(shown);
    expect(shown).not.toBe(previous);
    categories.add(data.starters.find((s) => s.text === shown)!.category);
    previous = shown;
    await next(page).click();
    await expect(card(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(card(page)).toBeFocused();
  }
  expect(categories.size).toBeGreaterThan(1);
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
    for (const button of [depthSwitch(page), next(page), card(page)]) {
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

test('the small talk / deep convo slide switch works by keyboard and tap, shows its state without colour and is announced', async ({ page }) => {
  const toggle = depthSwitch(page);
  const labels = page.getByTestId('hello-depth');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(labels).toContainText('small talk');
  await expect(labels).toContainText('deep convo');
  const weight = (name: string) => labels.getByText(name, { exact: true }).evaluate((el) => ({ bold: Number(getComputedStyle(el).fontWeight) >= 700, line: getComputedStyle(el).textDecorationLine }));
  expect(await weight('small talk')).toEqual({ bold: true, line: 'underline' });
  expect(await weight('deep convo')).toEqual({ bold: false, line: 'none' });
  const offX = (await toggle.locator('span').boundingBox())!.x;
  await toggle.focus();
  expect(await toggle.evaluate((el) => el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) > 0)).toBe(true);
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(update(page)).toHaveText('deep convo chosen. a new card is face down.');
  await expect.poll(async () => (await toggle.locator('span').boundingBox())!.x).toBeGreaterThan(offX + 10);
  expect(await weight('deep convo')).toEqual({ bold: true, line: 'underline' });
  for (let i = 0; i < 5; i++) {
    await card(page).click();
    expect(textsFor('deep')).toContain((await text(page).textContent())!.trim());
    await next(page).click();
  }
  await expect(page.getByTestId('hello-daily')).toContainText('deep convo');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(update(page)).toHaveText('small talk chosen. a new card is face down.');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('with reduced motion the switch thumb does not slide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(depthSwitch(page)).toBeEnabled();
  // The site's reduced-motion rule shortens transitions to a hair above zero (about 0.00001s), which is no slide.
  const seconds = await depthSwitch(page).locator('span').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(seconds).toBeLessThan(0.001);
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

test('sharing today\'s card uses the production hello result adapter', async ({ page }) => {
  const prompt = (await page.getByTestId('hello-daily-text').textContent())!.trim();
  const heading = (await page.getByRole('heading', { name: /prompt of the day/ }).textContent())!.trim();
  const parts = heading.split(' · ');
  expect(parts).toHaveLength(3);
  const date = parts[1]!;
  const deck = parts[2]!;
  await page.getByRole('button', { name: "share today's card", exact: true }).click();
  const dialog = page.getByTestId('game-result-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: "today's card", exact: true })).toBeVisible();
  await expect(dialog.getByText('share the prompt, then start a conversation.', { exact: true })).toBeVisible();
  await expect(dialog.locator('.result-meta')).toContainText(`hello cards · ${date}`);
  await expect(dialog.getByText('deck', { exact: true })).toBeVisible();
  await expect(dialog.getByText(deck, { exact: true })).toBeVisible();
  await expect(dialog.getByTestId('result-share-line')).toContainText(prompt);
});

test('a tab left open across local midnight moves on to the new day\'s prompt', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-07T23:59:30') });
  await page.goto('/play/hello-cards');
  await expect(card(page)).toBeEnabled();
  const daily = page.getByTestId('hello-daily-text');
  await expect(page.getByTestId('hello-daily')).toContainText('sat 7 nov');
  const before = (await daily.textContent())!;
  await page.clock.fastForward(60_000);
  await expect(page.getByTestId('hello-daily')).toContainText('sun 8 nov');
  await expect(daily).not.toHaveText(before);
});

test('the card keeps one name; its description gives the hint and, face up, the question', async ({ page }) => {
  const named = page.getByRole('button', { name: 'conversation card', exact: true });
  const turnOver = 'press the card to turn it over.';
  const turnBack = 'press the card again to turn it face down.';
  await expect(named).toHaveAttribute('aria-pressed', 'false');
  await expect(named).toHaveAccessibleDescription(turnOver);
  const seenQuestions: string[] = [];
  for (let i = 0; i < 3; i++) {
    await card(page).click();
    const shown = (await text(page).textContent())!.trim();
    seenQuestions.push(shown);
    await expect(named).toHaveAttribute('aria-pressed', 'true');
    await expect(named).toHaveAccessibleDescription(`${turnBack} ${lead(shown)}: ${shown}`);
    await next(page).click();
    await expect(named).toHaveAttribute('aria-pressed', 'false');
    await expect(named).toHaveAccessibleDescription(turnOver);
  }
  // Keyboard revisit: Tab back to the card, flip with Space, hear the question, flip back with Enter.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await card(page).focus();
  await page.keyboard.press('Space');
  const again = (await text(page).textContent())!.trim();
  expect(seenQuestions[seenQuestions.length - 1]).not.toBe(again);
  await expect(named).toHaveAccessibleDescription(`${turnBack} ${lead(again)}: ${again}`);
  await page.keyboard.press('Enter');
  await expect(named).toHaveAccessibleDescription(turnOver);
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const card = {
  game: 'pulse',
  name: 'pillo',
  date: 'nov 11, 2026',
  level: 'easy',
  result: '4 / 6',
  summary: 'you found today\'s word.',
  stats: [
    { label: 'time', value: '1:24' },
    { label: 'guesses', value: '4' },
    { label: 'streak', value: '3' },
    { label: 'hidden', value: 'not shown' },
  ],
  path: '/play/pillo',
};

async function openResult(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent('cueory:game-result-card', { detail }));
  }, card);
  return page.getByTestId('game-result-dialog');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-promo-seen', String(Date.now()));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } },
    });
  });
  await page.goto('/play');
});

test('finished-game result announces the exact card and traps focus', async ({ page }) => {
  const returnTo = page.getByRole('heading', { level: 1, name: 'daily games' });
  await returnTo.focus();
  const dialog = await openResult(page);
  const close = dialog.getByRole('button', { name: 'close results' });
  await expect(close).toBeFocused();
  await expect(dialog).toContainText('pillo · easy · nov 11, 2026');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('4 / 6');
  await expect(dialog.getByTestId('result-share-line')).toHaveText('pillo · nov 11, 2026 · 4 / 6 · cueory.app');
  await expect(dialog.locator('dt')).toHaveCount(3);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: /whatsapp/ })).toBeFocused();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(returnTo).toBeFocused();
});

test('copy fallback and every platform link stay plain and tracker-free', async ({ page }) => {
  const dialog = await openResult(page);
  const line = 'pillo · nov 11, 2026 · 4 / 6 · cueory.app';
  await dialog.getByRole('button', { name: 'copy', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('result copied.');
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(line);

  const expected = {
    facebook: ['facebook.com', 'u'],
    x: ['x.com', 'url'],
    threads: ['threads.net', 'text'],
    reddit: ['reddit.com', 'url'],
    whatsapp: ['wa.me', 'text'],
  } as const;
  for (const [name, [host, parameter]] of Object.entries(expected)) {
    const href = await dialog.getByRole('link', { name: new RegExp('^' + name) }).getAttribute('href');
    const url = new URL(href!);
    expect(url.hostname).toContain(host);
    expect(url.searchParams.get(parameter)).toBeTruthy();
    expect([...url.searchParams.keys()].some((key) => key.startsWith('utm_'))).toBe(false);
  }
});

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

test.beforeEach(async ({ page }, testInfo) => {
  const suppressPromo = !testInfo.title.startsWith('first-visit promo');
  if (!suppressPromo) await page.clock.install();
  await page.addInitScript((suppressPromo) => {
    if (suppressPromo) localStorage.setItem('cueory-promo-seen', String(Date.now()));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } },
    });
  }, suppressPromo);
  await page.goto('/play');
});

test('finished-game result announces the exact card and traps focus', async ({ page }) => {
  const returnTo = page.getByTestId('pulse').getByRole('button', { name: 'a', exact: true });
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

test('first-visit promo waits while the result dialog owns focus', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('cueory-promo-seen'));
  await page.reload();

  const dialog = await openResult(page);
  const close = dialog.getByRole('button', { name: 'close results' });
  await expect(close).toBeFocused();

  await page.clock.runFor(5_500);

  await expect(page.getByTestId('promo')).toBeHidden();
  await expect(close).toBeFocused();
  await close.click();
  await page.clock.runFor(500);
  await expect(page.getByTestId('promo')).toBeVisible();
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


test('share copies immediately without requesting a story image when native file sharing is unavailable', async ({ page }) => {
  let storyLogoRequests = 0;
  await page.route('**/brand/v1/logo-full-*.png', async () => {
    storyLogoRequests++;
    await new Promise(() => {});
  });
  const dialog = await openResult(page);
  await dialog.getByRole('button', { name: 'share', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('result copied.');
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied))
    .toBe('pillo · nov 11, 2026 · 4 / 6 · cueory.app');
  expect(storyLogoRequests).toBe(0);
});

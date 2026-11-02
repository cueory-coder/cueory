import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gameName } from '../../src/config/games';

/**
 * Task 103: the share sheet on its noindex preview page. Two sheets: a game (pulse's visible name) and study skills.
 * navigator.share, canShare and the clipboard are replaced with recorders, so these tests never open a real sheet.
 */

const ROUTE = '/preview/share';
const SITE = 'https://cueory.app';
const gameSheetName = `pick a card for ${gameName('pulse')}`;

interface Recorded {
  title?: string;
  text?: string;
  url?: string;
  files: { name: string; type: string; size: number }[];
}

declare global {
  interface Window {
    __shares: Recorded[];
    __copied: string[];
    __scrolls: (string | undefined)[];
  }
}

/** Gives the page a Web Share API that records each call. `files` sets what canShare answers for files. */
async function stubShare(page: Page, options: { files: boolean; rejectWith?: string }) {
  await page.addInitScript(({ files, rejectWith }) => {
    window.__shares = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        window.__shares.push({
          title: data.title,
          text: data.text,
          url: data.url,
          files: (data.files ?? []).map((file) => ({ name: file.name, type: file.type, size: file.size })),
        });
        if (rejectWith) throw new DOMException('the sheet was closed', rejectWith);
      },
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data?: ShareData) => files && Array.isArray(data?.files) && data.files.length > 0,
    });
  }, options);
}

/** Removes the Web Share API, as on most desktop browsers. */
async function noShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // blocked: fine
    }
    window.__copied = [];
    window.__scrolls = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void window.__copied.push(text) },
    });
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) {
      const first = args[0];
      window.__scrolls.push(typeof first === 'object' && first ? (first as ScrollToOptions).behavior : undefined);
      return (scrollTo as (...a: unknown[]) => void).apply(this, args);
    } as typeof Element.prototype.scrollTo;
  });
});

const gameSheet = (page: Page) => page.getByRole('radiogroup', { name: gameSheetName }).locator('xpath=..');
const recorded = (page: Page) => page.evaluate(() => window.__shares);

test('the preview is noindex and loads', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page).toHaveTitle(/share preview/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('each sheet is one labelled radio group of three styles that share one name', async ({ page }) => {
  await page.goto(ROUTE);
  for (const name of [gameSheetName, 'pick a card for study skills']) {
    const group = page.getByRole('radiogroup', { name });
    const radios = group.getByRole('radio');
    await expect(radios).toHaveCount(3);
    const names = await radios.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).name));
    const ids = await radios.evaluateAll((els) => els.map((el) => el.id));
    expect(new Set(names).size).toBe(1);
    expect(new Set(ids).size).toBe(3);
    await expect(radios.nth(0)).toBeChecked();
    await expect(group.getByRole('radio', { name: 'editorial' })).toBeVisible();
    await expect(group.getByRole('radio', { name: 'coin' })).toBeVisible();
  }
  // Two sheets, two separate groups.
  const groupNames = await page.locator('main input[type="radio"]').evaluateAll((els) => [
    ...new Set(els.map((el) => (el as HTMLInputElement).name)),
  ]);
  expect(groupNames).toHaveLength(2);
});

test('arrow keys move the selection and bring the card into view', async ({ page }) => {
  await page.goto(ROUTE);
  const group = page.getByRole('radiogroup', { name: gameSheetName });
  await group.getByRole('radio', { name: 'scene' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'editorial' })).toBeChecked();
  await expect(group.getByRole('radio', { name: 'editorial' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'coin' })).toBeChecked();
  await expect.poll(() => group.evaluate((row) => row.scrollLeft)).toBeGreaterThan(0);
});

test('the focused card draws its own visible focus ring', async ({ page }) => {
  await page.goto(ROUTE);
  const group = page.getByRole('radiogroup', { name: gameSheetName });
  const radio = group.getByRole('radio', { name: 'scene' });
  // Reach it by keyboard so :focus-visible applies: the "previous style" arrow comes right after the group.
  await page.getByRole('button', { name: 'previous style' }).first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(radio).toBeFocused();
  const ring = await radio.evaluate((el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const card = el.parentElement!.getBoundingClientRect();
    return {
      focusVisible: el.matches(':focus-visible'),
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      opacity: style.opacity,
      coversCard: Math.abs(box.width - card.width) < 1 && Math.abs(box.height - card.height) < 1,
    };
  });
  expect(ring).toEqual({ focusVisible: true, style: 'solid', width: 3, opacity: '1', coversCard: true });
});

test('the arrow buttons step through the styles and wrap around', async ({ page }) => {
  await page.goto(ROUTE);
  const sheet = gameSheet(page);
  await sheet.getByRole('button', { name: 'next style' }).click();
  await expect(sheet.getByRole('radio', { name: 'editorial' })).toBeChecked();
  await sheet.getByRole('button', { name: 'previous style' }).click();
  await sheet.getByRole('button', { name: 'previous style' }).click();
  await expect(sheet.getByRole('radio', { name: 'coin' })).toBeChecked();
});

test('share… sends the selected card image with the text and the link to the exact tool', async ({ page }) => {
  await stubShare(page, { files: true });
  await page.goto(ROUTE);
  const sheet = gameSheet(page);
  await sheet.getByRole('button', { name: 'share…' }).click();
  await expect.poll(() => recorded(page)).toHaveLength(1);
  await sheet.getByRole('radio', { name: 'editorial' }).check();
  await sheet.getByRole('button', { name: 'share…' }).click();
  await expect.poll(() => recorded(page)).toHaveLength(2);
  const [first, second] = await recorded(page);
  for (const share of [first!, second!]) {
    expect(share.url).toBe(`${SITE}/play#pulse-heading`);
    expect(share.text).toContain(gameName('pulse'));
    expect(share.files).toHaveLength(1);
    expect(share.files[0]!.type).toBe('image/png');
    expect(share.files[0]!.size).toBeGreaterThan(1000);
  }
  expect(first!.files[0]!.name).toBe('cueory-games-scene.png');
  expect(second!.files[0]!.name).toBe('cueory-games-ivory.png');
});

test('Instagram hands only the selected card image to the share sheet', async ({ page }) => {
  await stubShare(page, { files: true });
  await page.goto(ROUTE);
  const sheet = gameSheet(page);
  await sheet.getByRole('radio', { name: 'coin' }).check();
  await sheet.getByRole('button', { name: 'Instagram' }).click();
  await expect.poll(() => recorded(page)).toHaveLength(1);
  const [share] = await recorded(page);
  expect(share!.files.map((file) => file.name)).toEqual(['cueory-games-bronze-coin.png']);
  expect(share!.url).toBeUndefined();
});

test('without file sharing, share… sends the text and link only, and Instagram is not offered', async ({ page }) => {
  await stubShare(page, { files: false });
  await page.goto(ROUTE);
  const sheet = gameSheet(page);
  await expect(sheet.getByRole('button', { name: 'Instagram' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'share…' }).click();
  await expect.poll(() => recorded(page)).toHaveLength(1);
  const [share] = await recorded(page);
  expect(share!.files).toEqual([]);
  expect(share!.url).toBe(`${SITE}/play#pulse-heading`);
  expect(share!.text).toContain(gameName('pulse'));
});

test('closing the share sheet is quiet and never throws', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await stubShare(page, { files: true, rejectWith: 'AbortError' });
  await page.goto(ROUTE);
  const sheet = gameSheet(page);
  await sheet.getByRole('button', { name: 'share…' }).click();
  await expect.poll(() => recorded(page)).toHaveLength(1);
  await expect(sheet.getByRole('status')).toHaveText('');
  expect(errors).toEqual([]);
});

test('a share that fails says so in words', async ({ page }) => {
  await stubShare(page, { files: true, rejectWith: 'NotAllowedError' });
  await page.goto(ROUTE);
  const sheet = gameSheet(page);
  await sheet.getByRole('button', { name: 'share…' }).click();
  await expect(sheet.getByRole('status')).toHaveText('sharing did not open. copy the link instead.');
});

test('without the Web Share API, copy link still works', async ({ page }) => {
  await noShare(page);
  await page.goto(ROUTE);
  const sheet = gameSheet(page);
  await expect(sheet.getByRole('button', { name: 'share…' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'copy link' }).click();
  await expect(sheet.getByRole('status')).toHaveText('link copied.');
  expect(await page.evaluate(() => window.__copied)).toEqual([`${SITE}/play#pulse-heading`]);
});

test('post on X is a plain link with the text and the tool link, and no tracking', async ({ page }) => {
  await page.goto(ROUTE);
  const href = await gameSheet(page).getByRole('link', { name: /post on X/ }).getAttribute('href');
  const url = new URL(href!);
  expect(url.origin + url.pathname).toBe('https://x.com/intent/post');
  expect([...url.searchParams.keys()].sort()).toEqual(['text', 'url']);
  expect(url.searchParams.get('url')).toBe(`${SITE}/play#pulse-heading`);
  expect(url.searchParams.get('text')).toContain(gameName('pulse'));
});

test('choosing a card scrolls instantly under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ROUTE);
  await gameSheet(page).getByRole('button', { name: 'next style' }).click();
  await expect.poll(() => page.evaluate(() => window.__scrolls)).toEqual(['auto']);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gameSheet(page).getByRole('button', { name: 'next style' }).click();
  await expect.poll(() => page.evaluate(() => window.__scrolls)).toEqual(['auto', 'smooth']);
});

test('the page makes no third-party requests and every card image is served', async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) outside.push(request.url());
  });
  await stubShare(page, { files: true });
  await page.goto(ROUTE);
  await gameSheet(page).getByRole('button', { name: 'share…' }).click();
  await expect.poll(() => recorded(page)).toHaveLength(1);
  expect(outside).toEqual([]);
  for (const group of ['games', 'study']) {
    for (const style of ['scene', 'ivory', 'bronze-coin']) {
      const response = await page.request.get(`/share/${group}-${style}.png`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  }
});

test('axe finds nothing in the Daytime or Evening palette', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(page.getByRole('radiogroup')).toHaveCount(2);
  const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  // The theme switch lives in the footer's links panel, behind its chevron (Task 85).
  const footer = page.getByRole('contentinfo');
  await footer.locator('[data-footer-toggle]').click();
  await footer.getByRole('radio', { name: 'dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

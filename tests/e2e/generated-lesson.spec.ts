import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GENERATED_MODES } from '../../src/lessons/catalog';
import { contentCatalog } from '../lessonroutes';

/*
 * Task 300: lesson pages generated from /content. The first lesson in the catalog (today the study-skills sample) is
 * checked end to end: its hub links only to its own pages, every generated page works by keyboard, fits 320 px, passes
 * axe in both palettes, keeps "flag or comment", and saves a resumed place under its own address.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const lesson = contentCatalog().lessons[0]!;
const generated = lesson.modes.filter((mode) => GENERATED_MODES.some((candidate) => candidate.id === mode.id));
const routes = [lesson.href, ...generated.map((mode) => mode.href)];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage blocked */ }
  });
});

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return result.violations.map((violation) => violation.id + ': ' + violation.help);
}

test('the hub links to exactly this lesson\'s pages, in the hub order', async ({ page }) => {
  expect(generated.length).toBeGreaterThan(0);
  await page.goto(lesson.href);
  await expect(page.locator('main header p').first()).toHaveText(lesson.context);
  const links = page.getByTestId('mode-grid').getByRole('link');
  await expect(links).toHaveCount(lesson.modes.length);
  expect(await links.evaluateAll((items) => items.map((item) => item.getAttribute('href')))).toEqual(lesson.modes.map((mode) => mode.href));

  // Generated lesson tiles must preserve the accessible explanation control
  // from the existing study-mode hub while using lesson-specific links.
  const firstTile = page.getByTestId('mode-grid').locator('[data-mode-tile]').first();
  const help = firstTile.getByRole('button', { name: /^more about / });
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await help.click();
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await help.press('Escape');
  await expect(help).toHaveAttribute('aria-expanded', 'false');

  for (const mode of lesson.modes) expect((await page.request.get(mode.href)).status(), mode.href).toBe(200);
});

test('keyboard: from the hub into each generated page and back to the lesson', async ({ page }) => {
  for (const mode of generated) {
    await page.goto(lesson.href);
    const link = page.getByTestId('mode-grid').locator(`a[href="${mode.href}"]`);
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${mode.href}$`));
    await expect(page.locator('main h1')).toHaveCount(1);
    const back = page.locator('main').getByRole('link', { name: 'back to the lesson' });
    await back.focus();
    await expect(back).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${lesson.href}$`));
  }
});

test('generated learn mode preserves its accessible explanation control', async ({ page }) => {
  const learn = generated.find((mode) => mode.id === 'learn');
  test.skip(!learn, 'lesson has no learn mode');
  await page.goto(learn!.href);
  const help = page.getByRole('button', { name: 'more about learn mode' });
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await help.click();
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('see each card, choose its answer, then type it. anything you miss comes back until you know every card.')).toBeVisible();
  await help.press('Escape');
  await expect(help).toHaveAttribute('aria-expanded', 'false');
});

test('generated lesson retains its printable reader and mode help controls', async ({ page }) => {
  await page.goto(lesson.href);
  await page.emulateMedia({ media: 'print' });
  const printReader = page.getByTestId('print-lesson-reader');
  await expect(printReader).toBeVisible();
  await expect(printReader.locator('li').first()).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  for (const modeId of ['fill-in', 'organizer'] as const) {
    const mode = generated.find((candidate) => candidate.id === modeId);
    if (!mode) continue;
    await page.goto(mode.href);
    const help = page.getByRole('button', { name: `more about ${modeId}` });
    await expect(help).toBeVisible();
    await help.click();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
  }
});

test('every generated page fits 320 px with no sideways scroll and passes axe', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true);
    expect(await axe(page), route).toEqual([]);
  }
});

test('every generated page passes axe in the Evening palette', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    const color = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim().toLowerCase());
    expect(color, route).toBe('#1c1917');
    expect(await axe(page), route).toEqual([]);
  }
});

test('every generated page keeps a working "flag or comment" (D-34)', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    const flag = page.getByRole('button', { name: 'flag or comment', exact: true });
    await expect(flag, route).toHaveCount(1);
    await flag.click();
    await expect(flag).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('flag-form')).toBeVisible();
  }
});

test('placeholder and sample files keep their labels (D-92)', async ({ page }) => {
  if (lesson.cards?.labeled) {
    for (const page_ of ['cards', 'learn-mode', 'matching']) {
      await page.goto(`${lesson.href}/${page_}`);
      await expect(page.getByText('these cards are placeholders.')).toBeVisible();
    }
  }
  if (lesson.fillIn?.labeled) {
    await page.goto(`${lesson.href}/fill-in`);
    await expect(page.getByTestId('fill-in-sample-note')).toBeVisible();
  }
  if (lesson.organizer?.labeled) {
    await page.goto(`${lesson.href}/organizer`);
    await expect(page.getByTestId('organizer-sample-note')).toBeVisible();
  }
});

test('a saved place names the lesson\'s own cards page', async ({ page }) => {
  test.skip(!lesson.cards, 'this lesson has no cards');
  await page.goto(`${lesson.href}/cards`);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null')?.page))
    .toBe(`${lesson.href}/cards`);
});

test('the library lists every open lesson with a link to it', async ({ page }) => {
  await page.goto('/learn');
  const open = page.getByTestId('open-lessons').locator('[data-open-lesson]');
  await expect(open).toHaveCount(contentCatalog().lessons.length);
  for (const entry of contentCatalog().lessons) {
    await expect(page.locator(`[data-open-lesson="${entry.id}"] a[href="${entry.href}"]`)).toHaveCount(1);
  }
});

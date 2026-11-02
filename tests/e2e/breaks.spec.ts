import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import data from '../../content/breaks/ideas.json' with { type: 'json' };

const list = (page: Page) => page.getByRole('list', { name: 'all the ideas' });
const showOne = (page: Page) => page.getByRole('button', { name: 'show me one', exact: true });
const shuffle = (page: Page) => page.getByRole('button', { name: 'shuffle the ideas', exact: true });
const expectedIdeas = data.ideas.map(idea => idea.text);

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeEnabled();
  for (let step = 0; step < 40; step++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('sample page stays out of search and lists all ideas on plain cards', async ({ page }) => {
  await page.goto('/breaks');
  await expect(page).toHaveTitle('break ideas · cueory');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('main')).not.toHaveAttribute('data-pagefind-body');
  await expect(page.getByText('sample ideas · awaiting content approval')).toBeVisible();
  await expect(list(page).getByRole('listitem')).toHaveText(expectedIdeas);
  await expect(page.locator('body')).not.toHaveClass(/silk/);
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.getByText('sharing your own idea is coming with free accounts. for now, you can browse these samples.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'back to study skills' })).toHaveAttribute('href', '/learn/study-skills');
});

test('shuffle works from the keyboard, keeps focus and preserves every idea', async ({ page }) => {
  // This random draw would keep Fisher–Yates in the original order: exercise the fresh-list fallback too.
  await page.addInitScript(() => { Math.random = () => 0.999999; });
  await page.goto('/breaks');
  await tabTo(page, shuffle(page));
  expect(await shuffle(page).evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(list(page).getByRole('listitem').first()).not.toHaveText(expectedIdeas[0]!);
  expect((await list(page).getByRole('listitem').allTextContents()).sort()).toEqual([...expectedIdeas].sort());
  await expect(shuffle(page)).toBeFocused();
  await expect(page.getByRole('status', { name: 'break idea update' })).toHaveText('the list is shuffled. all the same ideas are here in a new order.');
});

test('tap choices do not repeat immediately, change storage or submit data', async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/breaks');
  await expect(showOne(page)).toBeEnabled();
  const stored = () => page.evaluate(() => ({
    local: { ...localStorage }, session: { ...sessionStorage },
  }));
  const before = await stored();
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method()); });
  await showOne(page).click();
  const first = await page.getByTestId('picked-break-idea').innerText();
  expect(expectedIdeas).toContain(first);
  await showOne(page).click();
  await expect(page.getByTestId('picked-break-idea')).not.toHaveText(first);
  const second = await page.getByTestId('picked-break-idea').innerText();
  expect(expectedIdeas).toContain(second);
  await expect(page.getByRole('status', { name: 'break idea update' })).toHaveText(`one idea: ${second}`);
  await shuffle(page).click();
  expect((await list(page).getByRole('listitem').allTextContents()).sort()).toEqual([...expectedIdeas].sort());
  expect(await stored()).toEqual(before);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 820, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${width}px ${colorScheme}: readable cards, touch targets and axe after choosing`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/breaks');
      await showOne(page).click();
      await expect(list(page).getByRole('listitem')).toHaveCount(20);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const control of [showOne(page), shuffle(page)]) {
        const box = await control.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(await control.evaluate(element => getComputedStyle(element).transitionDuration.split(',')
          .every(value => parseFloat(value) <= 0.01))).toBe(true);
      }
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test('all sample ideas remain readable with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.goto('/breaks');
    await expect(list(page).getByRole('listitem')).toHaveText(expectedIdeas);
    await expect(showOne(page)).toBeDisabled();
    await expect(shuffle(page)).toBeDisabled();
    // Playwright skips NOSCRIPT in text matching; inspect the actual rendered paragraph.
    const instructions = page.locator('noscript p');
    await expect(instructions).toHaveText('all the ideas are listed here. turn on javascript to shuffle them or choose one at random.');
    await expect(instructions).toBeVisible();
  } finally {
    await context.close();
  }
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = ['/', '/learn/study-skills', '/learn/study-skills/cards', '/privacy', '/terms', '/disclaimer', '/support', '/subscribed'];

for (const path of pages) {
  test(`${path} loads, shows the notice, and passes accessibility checks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId('building-notice')).toHaveText("We're still building. More coming soon.");
    await expect(page.locator('h1')).toHaveCount(1);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('lesson can be stepped through with the keyboard', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await expect(page.getByText('Sentence 1 of')).toBeVisible();

  const nextButton = page.getByRole('button', { name: 'Next sentence' });
  await nextButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Sentence 2 of')).toBeVisible();

  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByText("That's the whole lesson for now.")).toBeVisible();
});

test('cards can be studied with the keyboard, and "See again" brings a card back', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await page.getByRole('link', { name: 'Practice this lesson with cards' }).click();
  await expect(page).toHaveURL(/\/learn\/study-skills\/cards$/);
  await expect(page.getByText('Card 1 · 3 left')).toBeVisible();
  await expect(page.getByText('Question', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Show answer' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Answer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'See again' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Card 2 · 3 left')).toBeVisible();

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Got it' }).click();
  }
  await expect(page.getByText("That's every card for now.")).toBeVisible();
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByText('Card 1 · 3 left')).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the lesson shows every sentence once and no stepper controls', async ({ page }) => {
    await page.goto('/learn/study-skills');
    await expect(page.getByText('Sentence 1 of')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next sentence' })).toHaveCount(0);
    const items = page.locator('ol > li');
    const texts = await items.allTextContents();
    expect(texts.length).toBeGreaterThan(1);
    expect(new Set(texts).size).toBe(texts.length);
  });

  test('the cards page lists every card with its answer and no controls', async ({ page }) => {
    await page.goto('/learn/study-skills/cards');
    await expect(page.getByRole('button')).toHaveCount(0);
    expect(await page.locator('dl dt').count()).toBe(3);
    expect(await page.locator('dl dd').count()).toBe(3);
  });
});

test('keyboard focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline).not.toBe('none');
});

test('home page has a launch-updates signup that works by keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Get launch updates' })).toBeVisible();
  const form = page.getByTestId('signup-form');
  if ((await form.count()) === 0) {
    await expect(page.getByTestId('signup-pending')).toBeVisible();
    return;
  }
  const email = page.getByLabel('Email address');
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('required', '');
  await email.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeFocused();
});

test.describe('theme switch', () => {
  const pageBackground = (page: import('@playwright/test').Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const charcoal = 'rgb(27, 23, 21)';
  const ivory = 'rgb(249, 245, 239)';

  test('Light, Dark and Follow device change the palette and are remembered', async ({ page }, testInfo) => {
    const deviceIsDark = testInfo.project.use.colorScheme === 'dark';
    await page.goto('/');
    const picker = page.getByRole('group', { name: 'Theme' });
    await expect(picker.getByRole('radio', { name: 'Follow device' })).toBeChecked();
    expect(await pageBackground(page)).toBe(deviceIsDark ? charcoal : ivory);

    await picker.getByRole('radio', { name: 'Dark' }).check();
    expect(await pageBackground(page)).toBe(charcoal);

    // The pick carries over to other pages and survives a reload.
    await page.goto('/privacy');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await pageBackground(page)).toBe(charcoal);

    await page.getByRole('radio', { name: 'Light' }).check();
    expect(await pageBackground(page)).toBe(ivory);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await page.getByRole('radio', { name: 'Follow device' }).check();
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    expect(await pageBackground(page)).toBe(deviceIsDark ? charcoal : ivory);
  });

  test('can be used with the keyboard', async ({ page }) => {
    await page.goto('/');
    const followDevice = page.getByRole('radio', { name: 'Follow device' });
    await followDevice.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

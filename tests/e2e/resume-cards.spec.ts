import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const URL = '/learn/study-skills/cards';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* private mode */ }
  });
});

async function rate(page: Page, pile: 'Know it' | 'Still learning') {
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: pile, exact: true }).click();
}

test('continue on the same card with the two prior piles intact', async ({ page }) => {
  await page.goto(URL);
  await rate(page, 'Know it');
  await rate(page, 'Still learning');
  await expect(page.getByTestId('card-status')).toContainText('Card 3 of 3 · Know it: 1 · Still learning: 1');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toBeVisible();
  await page.getByRole('button', { name: 'continue question 3' }).click();
  await expect(page.getByTestId('card-status')).toContainText('Card 3 of 3 · Know it: 1 · Still learning: 1');
  await expect(page.getByTestId('card-text')).toContainText('Placeholder card 3, front.');
  // Back still reaches a card sorted before the reload and takes it out of the tally.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('card-status')).toContainText('Card 2 of 3 · Know it: 1 · Still learning: 0');
  await rate(page, 'Still learning');
  await rate(page, 'Know it');
  await expect(page.getByText('Round 1 done.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Study the 1 still learning' })).toBeVisible();
});

test('start over clears the resume choice and starts at card one', async ({ page }) => {
  await page.goto(URL);
  await rate(page, 'Know it');
  await page.reload();
  await page.getByRole('button', { name: 'start over' }).click();
  await expect(page.getByTestId('card-status')).toContainText('Card 1 of 3 · Know it: 0 · Still learning: 0');
  expect(await page.evaluate(() => localStorage.getItem('cueory-resume'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
});

test('shuffle resumes by the same card ID, without storing the card text', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('checkbox', { name: 'Shuffle' }).check();
  await rate(page, 'Know it');
  await rate(page, 'Still learning');
  const front = await page.getByTestId('card-text').textContent();
  const saved = await page.evaluate(() => localStorage.getItem('cueory-resume'));
  expect(saved).not.toBeNull();
  const parsed = JSON.parse(saved!);
  expect(parsed).toMatchObject({ tool: 'cards', phase: 'working', itemIndex: 2, totalItems: 3 });
  expect(Object.values(parsed.answers).sort()).toEqual(['know', 'learning']);
  expect(saved).not.toContain('Placeholder');
  expect(saved).not.toContain('rationale');
  expect(saved).not.toContain('correct');
  await page.reload();
  await page.getByRole('button', { name: 'continue question 3' }).click();
  await expect(page.getByRole('checkbox', { name: 'Shuffle' })).toBeChecked();
  await expect(page.getByTestId('card-text')).toHaveText(front ?? '');
});

test('results stay on the results screen after reload', async ({ page }) => {
  await page.goto(URL);
  await rate(page, 'Know it');
  await rate(page, 'Know it');
  await rate(page, 'Know it');
  await expect(page.getByText("That's every card for now.")).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'continue with results' }).click();
  await expect(page.getByText("That's every card for now.")).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Cards in this round' })).toHaveAttribute('aria-valuenow', '3');
});

test('the deck stays usable while the offer shows, and sorting a card starts fresh', async ({ page }) => {
  await page.goto(URL);
  await rate(page, 'Know it');
  await rate(page, 'Know it');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toBeVisible();
  await expect(page.getByTestId('card-status')).toContainText('Card 1 of 3 · Know it: 0 · Still learning: 0');
  await rate(page, 'Still learning');
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
  const parsed = JSON.parse((await page.evaluate(() => localStorage.getItem('cueory-resume')))!);
  expect(parsed).toMatchObject({ itemIndex: 1, answers: { 'ss01-c01': 'learning' } });
  await page.reload();
  await expect(page.getByRole('button', { name: 'continue question 2' })).toBeVisible();
});

test('a blocked localStorage never blocks studying or opens a resume prompt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); },
    });
  });
  await page.goto(URL);
  await rate(page, 'Know it');
  await expect(page.getByTestId('card-status')).toContainText('Card 2 of 3');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
  await expect(page.getByTestId('flashcard')).toBeVisible();
});

test('the resume prompt is accessible without exposing the card answers', async ({ page }) => {
  await page.goto(URL);
  await rate(page, 'Know it');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'pick up where you left off?' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map(v => `${v.id}: ${v.help}`)).toEqual([]);
});

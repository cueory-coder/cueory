import { expect, test, type Page } from '@playwright/test';

const KEY = 'cueory-resume';

// Apply to every tab, including the progress page and the fresh study session.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cueory-promo-seen', String(Date.now()));
  });
});

const saved = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);

const modes = [
  {
    tool: 'fill-in',
    path: '/learn/study-skills/fill-in',
    answers: { 'item-0': ['n:honey'] },
    async submit(page: Page) {
      const board = page.getByTestId('fill-in');
      await board.getByRole('button', { name: 'type instead' }).click();
      const input = board.getByRole('textbox', { name: 'the missing word' });
      await input.fill('honey');
      await input.press('Enter');
      await expect(board.getByRole('button', { name: 'next' })).toBeVisible();
    },
    async expectEmpty(page: Page) {
      const board = page.getByTestId('fill-in');
      await expect(board.getByText('round 1 · item 1 of 4')).toBeVisible();
      await expect(board.getByRole('combobox', { name: 'the missing word' })).toHaveValue('');
      await expect(board.getByRole('region', { name: 'your submitted answers' })).toHaveCount(0);
    },
  },
  {
    tool: 'matching',
    path: '/learn/study-skills/matching',
    answers: { 'term-0': 'meaning-0' },
    async submit(page: Page) {
      await page.getByRole('region', { name: 'Terms' })
        .getByRole('button', { name: /^Placeholder card 1, front\./ }).click();
      await page.getByRole('region', { name: 'Meanings' })
        .getByRole('button', { name: /^Placeholder card 1, back\./ }).click();
      await expect(page.getByText('Matched 1 of 3 · Misses: 0')).toBeVisible();
    },
    async expectEmpty(page: Page) {
      await expect(page.getByRole('progressbar', { name: 'matching progress' }))
        .toHaveAttribute('aria-valuenow', '0');
    },
  },
  {
    tool: 'organizer',
    path: '/learn/study-skills/organizer',
    answers: { apple: 'fruit' },
    async submit(page: Page) {
      const board = page.getByTestId('organizer');
      await board.getByRole('button', { name: /^apple(?:\s|$)/ }).press('1');
      await board.getByRole('button', { name: 'check', exact: true }).click();
      await expect(page.getByRole('progressbar', { name: 'organizer progress' }))
        .toHaveAttribute('aria-valuenow', '1');
    },
    async expectEmpty(page: Page) {
      await expect(page.getByRole('progressbar', { name: 'organizer progress' }))
        .toHaveAttribute('aria-valuenow', '0');
      await expect(page.getByTestId('organizer').getByRole('list', { name: 'tray' }).getByRole('button'))
        .toHaveCount(8);
    },
  },
];

for (const mode of modes) {
  test(`${mode.tool}: another tab's forget action survives hiding and leaving the old session`, async ({ page, context }) => {
    await page.goto(mode.path);
    await mode.submit(page);
    await expect.poll(() => saved(page)).toMatchObject({ tool: mode.tool, page: mode.path, answers: mode.answers });

    const progress = await context.newPage();
    await progress.goto('/progress');
    await progress.getByRole('button', { name: 'forget my progress on this device' }).click();
    await progress.getByRole('button', { name: 'yes, forget it' }).click();
    await expect(progress.getByText('done. your progress is no longer saved on this device.')).toBeVisible();
    expect(await saved(progress)).toBeNull();

    // Headless engines do not consistently hide background tabs. Exercise the
    // hidden event deterministically while keeping the old mounted study state.
    await page.evaluate(() => {
      const previousVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
      const previousHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      try {
        document.dispatchEvent(new Event('visibilitychange'));
      } finally {
        if (previousVisibility) Object.defineProperty(document, 'visibilityState', previousVisibility);
        else Reflect.deleteProperty(document, 'visibilityState');
        if (previousHidden) Object.defineProperty(document, 'hidden', previousHidden);
        else Reflect.deleteProperty(document, 'hidden');
      }
    });
    expect(await saved(progress)).toBeNull();

    // A real navigation runs pagehide with the same stale in-memory draft.
    await page.goto('/learn');
    expect(await saved(progress)).toBeNull();

    // Forget removes the old save, without disabling future intentional study.
    const fresh = await context.newPage();
    await fresh.goto(mode.path);
    await mode.expectEmpty(fresh);
    await expect(fresh.getByRole('heading', { name: 'pick up where you left off?' })).toHaveCount(0);
    expect(await saved(fresh)).toBeNull();
    await mode.submit(fresh);
    await expect.poll(() => saved(fresh)).toMatchObject({ tool: mode.tool, page: mode.path, answers: mode.answers });
  });
}

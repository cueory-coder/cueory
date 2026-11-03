import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Task 79: Learn mode looks and feels modern. A slim progress bar, each prompt on a card that rises in, large answer
 * buttons with a tick or cross and words, a roomy typed field, and a calm summary card. Learn-mode logic is unchanged
 * (tests/unit and pages.spec.ts cover it); these tests drive the sample deck through the new screens.
 */

const LEARN_URL = '/learn/study-skills/learn-mode';

// The labeled placeholder deck (content/cards/study-skills-01.json), the same mapping pages.spec.ts uses.
const deck: Record<string, { back: string; blank?: string }> = {
  'Placeholder card 1, front.': { back: "Placeholder card 1, back. Christian's reviewed card text replaces this." },
  'Placeholder card 2, front.': { back: 'Placeholder card 2, back.', blank: 'card 2' },
  'Placeholder card 3, front.': { back: 'Placeholder card 3, back.' },
};

const sizes = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'tablet', width: 820, height: 1180 },
  { label: 'desktop', width: 1440, height: 900 },
];

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

// The once-only promo panel (D-59) takes focus after a few seconds, so every test starts as if it had been shown.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

/** Keyboard only: focus the control and press Enter, the way a keyboard user would after tabbing to it. */
async function pressEnter(page: Page, control: Locator) {
  await control.focus();
  await expect(control).toBeFocused();
  await page.keyboard.press('Enter');
}

const stepOf = async (page: Page) => (await page.getByTestId('learn-step').textContent()) ?? '';
const cardOnScreen = async (page: Page) => deck[(await page.getByTestId('learn-prompt').textContent()) ?? '']!;
const answers = (page: Page) => page.getByRole('list', { name: 'Answers' });

/** Shows and passes every new card by keyboard until the first "Choose the answer" step is on screen. */
async function reachChoice(page: Page) {
  for (let turn = 0; turn < 5 && (await stepOf(page)) === 'New card'; turn++) {
    await pressEnter(page, page.getByRole('button', { name: 'Show answer' }));
    await pressEnter(page, page.getByRole('button', { name: 'Next card' }));
  }
  await expect(page.getByTestId('learn-step')).toHaveText('Choose the answer');
}

for (const size of sizes) {
  test(`a whole round of the sample deck works by keyboard alone at ${size.label} size`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(LEARN_URL);
    const bar = page.getByRole('progressbar', { name: 'Cards recalled today' });
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText('recalled today 0 of 3')).toBeVisible();

    const steps: string[] = [];
    for (let turn = 0; turn < 15; turn++) {
      if (await page.getByText('You know all 3 cards.').isVisible()) break;
      const step = await stepOf(page);
      const card = await cardOnScreen(page);
      steps.push(step);
      // After the first card, which is there at once, each prompt sits on a card that rises in.
      if (turn > 0) await expect(page.getByTestId('learn-card')).toHaveClass(/\benter\b/);

      if (step === 'New card') {
        await pressEnter(page, page.getByRole('button', { name: 'Show answer' }));
        await expect(page.getByTestId('learn-card')).toContainText(card.back);
        await pressEnter(page, page.getByRole('button', { name: 'Next card' }));
      } else if (step === 'Choose the answer') {
        const right = answers(page).getByRole('button', { name: card.back, exact: true });
        await pressEnter(page, right);
        await expect(page.getByTestId('learn-feedback')).toContainText('Correct.');
        // The answer is marked with words too, not only its border and tick.
        const marked = answers(page).getByRole('button').filter({ hasText: card.back });
        await expect(marked).toContainText('The answer');
        await expect(marked).toHaveAttribute('aria-pressed', 'true');
        await pressEnter(page, page.getByRole('button', { name: 'Continue' }));
      } else {
        const field = page.getByLabel(step === 'Fill in the blank' ? 'The missing words' : 'Your answer');
        await field.focus();
        await page.keyboard.type(step === 'Fill in the blank' ? card.blank! : card.back);
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('learn-feedback')).toContainText('Correct.');
        await pressEnter(page, page.getByRole('button', { name: 'Continue' }));
      }
    }

    // Three cards, each seen, chosen and recalled once when every answer is right.
    expect(steps.filter((s) => s === 'New card')).toHaveLength(3);
    expect(steps.filter((s) => s === 'Choose the answer')).toHaveLength(3);
    expect(steps.filter((s) => s === 'Type the answer' || s === 'Fill in the blank')).toHaveLength(3);

    // The calm summary: how many are recalled today, what is still learning, go again or back to the lesson.
    await expect(page.getByText('You know all 3 cards.')).toBeVisible();
    await expect(page.getByText('recalled today: 3 · still learning: 0')).toBeVisible();
    await expect(bar).toHaveAttribute('aria-valuenow', '3');
    await expect(page.getByRole('link', { name: 'Back to the lesson' }).first()).toHaveAttribute(
      'href',
      '/learn/study-skills',
    );
    await pressEnter(page, page.getByRole('button', { name: 'Start again' }));
    await expect(page.getByText('recalled today 0 of 3')).toBeVisible();
    await expect(page.getByTestId('learn-step')).toHaveText('New card');
  });
}

test('the progress bar fills as cards are recalled today', async ({ page }) => {
  await page.goto(LEARN_URL);
  const fill = page.locator('.progress-track .progress-fill');
  const length = () => fill.evaluate((el) => getComputedStyle(el).getPropertyValue('--progress').trim());
  await expect.poll(length).toBe('0');

  await reachChoice(page);
  const card = await cardOnScreen(page);
  await answers(page).getByRole('button', { name: card.back, exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  // The next cards come first; play on until one card is recalled today.
  for (let turn = 0; turn < 6 && (await page.getByText('recalled today 0 of 3').isVisible()); turn++) {
    const now = await cardOnScreen(page);
    const step = await stepOf(page);
    if (step === 'Choose the answer') {
      await answers(page).getByRole('button', { name: now.back, exact: true }).click();
    } else {
      await page.getByRole('textbox').fill(step === 'Fill in the blank' ? now.blank! : now.back);
      await page.getByRole('button', { name: 'Check' }).click();
    }
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.getByText('recalled today 1 of 3')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Cards recalled today' })).toHaveAttribute('aria-valuenow', '1');
  await expect.poll(length).toBe(String(1 / 3));
});

test('a wrong choice says so in words, with a cross, and names the right answer', async ({ page }) => {
  await page.goto(LEARN_URL);
  await reachChoice(page);
  const card = await cardOnScreen(page);
  const wrong = (await answers(page).getByRole('button').allTextContents()).find((a) => a !== card.back)!;
  await answers(page).getByRole('button', { name: wrong, exact: true }).click();

  const feedback = page.getByTestId('learn-feedback');
  await expect(feedback).toContainText('Not quite.');
  await expect(feedback).toContainText(`The answer: ${card.back}`);
  await expect(feedback.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  // Each marked answer carries a word as well as its icon and border.
  const picked = answers(page).getByRole('button').filter({ hasText: wrong });
  const right = answers(page).getByRole('button').filter({ hasText: card.back });
  await expect(picked).toContainText('Your choice');
  await expect(picked).toHaveAttribute('aria-pressed', 'true');
  await expect(right).toContainText('The answer');
  await expect(right).toHaveAttribute('aria-pressed', 'false');
  // Keyboard focus moves to the card, so the feedback is the next thing read.
  await expect(page.getByTestId('learn-card')).toBeFocused();
});

test('a wrong typed answer shows what was written and offers "I was right"', async ({ page }) => {
  await page.goto(LEARN_URL);
  await reachChoice(page);
  const card = await cardOnScreen(page);
  await answers(page).getByRole('button', { name: card.back, exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  // Pass the other cards' choices until a recall step comes up.
  for (let turn = 0; turn < 4 && (await stepOf(page)) === 'Choose the answer'; turn++) {
    const now = await cardOnScreen(page);
    await answers(page).getByRole('button', { name: now.back, exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  const step = await stepOf(page);
  expect(['Type the answer', 'Fill in the blank']).toContain(step);
  await page.getByRole('textbox').fill('not the words');
  await page.keyboard.press('Enter');

  const feedback = page.getByTestId('learn-feedback');
  await expect(feedback).toContainText('Not quite.');
  await expect(feedback).toContainText('You wrote: not the words');
  await page.getByRole('button', { name: 'I was right' }).click();
  await expect(feedback).toContainText('Counted as right.');
});

test('under reduced motion nothing moves: no entrance animation and no transform', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(LEARN_URL);
  const motion = (el: Element) => {
    const style = getComputedStyle(el);
    return { animation: style.animationName, transform: style.transform, translate: style.translate };
  };
  const still = { animation: 'none', transform: 'none', translate: 'none' };
  await expect(page.getByTestId('learn-card')).toBeVisible();
  expect(await page.getByTestId('learn-card').evaluate(motion)).toEqual(still);

  await reachChoice(page);
  const card = await cardOnScreen(page);
  await answers(page).getByRole('button', { name: card.back, exact: true }).click();
  expect(await page.getByTestId('learn-card').evaluate(motion)).toEqual(still);
  expect(await page.getByTestId('learn-feedback').evaluate(motion)).toEqual(still);

  // A held button does not shrink either.
  const button = page.getByRole('button', { name: 'Continue' });
  await button.hover();
  await page.mouse.down();
  expect(await button.evaluate((el) => getComputedStyle(el).scale)).toBe('none');
  await page.mouse.up();
});

test('with motion allowed, the first card is there at once and each next card rises in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(LEARN_URL);
  const animation = () => page.getByTestId('learn-card').evaluate((el) => getComputedStyle(el).animationName);
  await expect(page.getByTestId('learn-card')).toBeVisible();
  expect(await animation()).toBe('none');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Next card' }).click();
  await expect(page.getByTestId('learn-prompt')).toHaveText('Placeholder card 2, front.');
  expect(await animation()).toBe('enter-rise');
});

for (const size of sizes) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds nothing on Learn mode at ${size.label} size (${scheme === 'light' ? 'daytime' : 'evening'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(LEARN_URL);
      await expect(page.getByTestId('learn-card')).toBeVisible();
      const scan = async () =>
        (await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations.map((v) => `${v.id}: ${v.help}`);
      expect(await scan()).toEqual([]);

      // With the answers and feedback on screen too.
      await reachChoice(page);
      const card = await cardOnScreen(page);
      const wrong = (await answers(page).getByRole('button').allTextContents()).find((a) => a !== card.back)!;
      expect(await scan()).toEqual([]);
      await answers(page).getByRole('button', { name: wrong, exact: true }).click();
      await expect(page.getByTestId('learn-feedback')).toBeVisible();
      expect(await scan()).toEqual([]);
    });
  }
}

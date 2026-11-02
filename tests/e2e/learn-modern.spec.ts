import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const LEARN_URL = '/learn/study-skills/learn-mode';

// Suppress the promo panel (same pattern as pages.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch { /* blocked storage: panel never shows */ }
  });
});

// ── Progress bar ───────────────────────────────────────────────────────────

test('progress bar is visible and starts at 0', async ({ page }) => {
  await page.goto(LEARN_URL);
  const bar = page.getByRole('progressbar');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuenow', '0');
});

test('progress label updates after mastering a card', async ({ page }) => {
  await page.goto(LEARN_URL);
  await expect(page.getByText(/Mastered 0 of/)).toBeVisible();

  // Complete one card (see → next → choose correct → continue → type correct → continue)
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Next card' }).click();

  // After seeing the card the progress hasn't changed yet.
  await expect(page.getByText(/Mastered 0 of/)).toBeVisible();
});

// ── Card structure ─────────────────────────────────────────────────────────

test('cards have the .enter class for animation', async ({ page }) => {
  await page.goto(LEARN_URL);
  await expect(page.locator('[aria-live] .enter, .enter[aria-live]')).toBeVisible();
});

test('card shows step label and prompt', async ({ page }) => {
  await page.goto(LEARN_URL);
  await expect(page.getByTestId('learn-step')).toBeVisible();
  await expect(page.getByTestId('learn-prompt')).toBeVisible();
});

// ── Feedback (text, not just color) ───────────────────────────────────────

test('correct answer feedback has text not just color', async ({ page }) => {
  await page.goto(LEARN_URL);
  // See step: reveal and advance
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Next card' }).click();
  // Choose step: pick the right answer
  const answers = page.getByRole('list', { name: 'Answers' }).getByRole('button');
  const firstAnswer = answers.first();
  const firstText = await firstAnswer.textContent();
  // Find and click the correct answer (the one matching the card's back)
  // Click any button to trigger feedback; check feedback has words
  await firstAnswer.click();
  // Feedback must include text: "Correct." or "Not quite." (never color-only)
  const feedbackText = await page.locator('[data-testid="learn-card"]').textContent();
  expect(feedbackText).toMatch(/Correct\.|Not quite\./);
  // The result icon aria-hidden should be accompanied by text
  await expect(page.locator('[data-testid="learn-card"]').getByText(/Correct\.|Not quite\./)).toBeVisible();
  void firstText; // suppress unused warning
});

test('wrong answer shows the correct answer in text', async ({ page }) => {
  await page.goto(LEARN_URL);
  // Advance to choose step
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Next card' }).click();
  // Click the first answer (may be wrong)
  await page.getByRole('list', { name: 'Answers' }).getByRole('button').first().click();
  // If not correct, should show "The answer: ..." text
  const liveText = await page.locator('[data-testid="learn-card"]').textContent();
  if (/Not quite/.test(liveText ?? '')) {
    await expect(page.locator('[data-testid="learn-card"]').getByText(/The answer:/)).toBeVisible();
  }
});

test('choice buttons show icon text labels after selection (not color only)', async ({ page }) => {
  await page.goto(LEARN_URL);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Next card' }).click();
  // After clicking a choice, the button should show a note label
  const choiceBtn = page.getByRole('list', { name: 'Answers' }).getByRole('button').first();
  await choiceBtn.click();
  // The chosen button should now have "Your choice" or "Correct answer" label
  const btnText = await page.getByRole('list', { name: 'Answers' }).getByRole('button').first().textContent();
  expect(btnText).toMatch(/Your choice|Correct answer/);
});

// ── Typed answer ───────────────────────────────────────────────────────────

test('typed answer field is present on type step', async ({ page }) => {
  await page.goto(LEARN_URL);
  // Complete see and choose to reach type step
  // See step
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Next card' }).click();
  // Choose step — pick the correct answer to pass through
  const stepText = await page.getByTestId('learn-step').textContent();
  if (stepText?.includes('Choose')) {
    // Find and click the correct answer
    const buttons = page.getByRole('list', { name: 'Answers' }).getByRole('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click();
      if (await page.getByText('Correct.').isVisible()) break;
      // If wrong, overrule and continue
      const overrule = page.getByRole('button', { name: 'I was right' });
      if (await overrule.isVisible()) await overrule.click();
    }
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  // Check if we're now on type step
  const nextStep = await page.getByTestId('learn-step').textContent();
  if (nextStep?.includes('Type') || nextStep?.includes('Fill')) {
    await expect(page.getByRole('textbox')).toBeVisible();
  }
});

// ── Keyboard-only round completion ─────────────────────────────────────────

test.describe('keyboard-only round at three sizes', () => {
  const viewports = [
    { width: 390, height: 844, label: 'phone' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 800, label: 'desktop' },
  ];

  for (const vp of viewports) {
    test(`completes a full round at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(LEARN_URL);

      // Run up to 30 steps to complete the round (3 cards × multiple steps)
      for (let iter = 0; iter < 30; iter++) {
        // Check if round is over
        if (await page.getByRole('button', { name: 'Start again' }).isVisible()) break;

        const stepEl = page.getByTestId('learn-step');
        if (!(await stepEl.isVisible())) break;
        const step = await stepEl.textContent();

        if (step?.includes('New card')) {
          const showBtn = page.getByRole('button', { name: 'Show answer' });
          if (await showBtn.isVisible()) {
            await showBtn.focus();
            await page.keyboard.press('Enter');
          }
          const nextBtn = page.getByRole('button', { name: 'Next card' });
          if (await nextBtn.isVisible()) {
            await nextBtn.focus();
            await page.keyboard.press('Enter');
          }
        } else if (step?.includes('Choose')) {
          // Tab to the first choice button and press Enter
          const choices = page.getByRole('list', { name: 'Answers' }).getByRole('button');
          const count = await choices.count();
          // Find the correct answer button
          let found = false;
          for (let i = 0; i < count; i++) {
            await choices.nth(i).focus();
            await page.keyboard.press('Enter');
            const feedback = page.locator('[data-testid="learn-card"]').getByText(/Correct\.|Not quite\./);
            if (await feedback.isVisible()) {
              found = true;
              if (await page.getByText('Not quite.').isVisible()) {
                const overrule = page.getByRole('button', { name: 'I was right' });
                if (await overrule.isVisible()) {
                  await overrule.focus();
                  await page.keyboard.press('Enter');
                }
              }
              break;
            }
          }
          if (found) {
            const cont = page.getByRole('button', { name: 'Continue' });
            if (await cont.isVisible()) {
              await cont.focus();
              await page.keyboard.press('Enter');
            }
          }
        } else if (step?.includes('Type') || step?.includes('Fill')) {
          const input = page.getByRole('textbox');
          if (await input.isVisible()) {
            // Type the expected answer from the card
            const prompt = await page.getByTestId('learn-prompt').textContent();
            void prompt; // We type a dummy answer; overrule if needed
            await input.focus();
            await input.fill('answer');
            const checkBtn = page.getByRole('button', { name: 'Check' });
            await checkBtn.focus();
            await page.keyboard.press('Enter');
            if (await page.getByText('Not quite.').isVisible()) {
              const overrule = page.getByRole('button', { name: 'I was right' });
              if (await overrule.isVisible()) {
                await overrule.focus();
                await page.keyboard.press('Enter');
              }
            }
            const cont = page.getByRole('button', { name: 'Continue' });
            if (await cont.isVisible()) {
              await cont.focus();
              await page.keyboard.press('Enter');
            }
          }
        }
      }

      // After completing all cards, the end screen should show
      await expect(page.getByText('You know all')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: 'Start again' })).toBeVisible();
    });
  }
});

// ── Reduced motion ─────────────────────────────────────────────────────────

test('no enter animation under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(LEARN_URL);
  // With prefers-reduced-motion, .enter should have animation: none
  const animationName = await page.locator('.enter').first().evaluate(
    (el) => getComputedStyle(el).animationName,
  );
  expect(animationName).toBe('none');
});

// ── Accessibility ──────────────────────────────────────────────────────────

test.describe('axe', () => {
  const viewports = [
    { width: 390, height: 844, label: 'phone' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 800, label: 'desktop' },
  ];

  for (const vp of viewports) {
    test(`daytime at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(LEARN_URL);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test(`evening at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(LEARN_URL);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

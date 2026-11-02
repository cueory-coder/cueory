import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const savedAnswers = (page: Page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('cueory-progress') ?? 'null')?.onboarding ?? null,
);

async function toExam(page: Page) {
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
}

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let step = 0; step < 30; step++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function visibleKeyboardFocus(target: Locator) {
  expect(await target.evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && style.outlineStyle !== 'none' &&
      Number.parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'transparent' &&
      style.outlineColor !== 'rgba(0, 0, 0, 0)';
  })).toBe(true);
}

test('two optional questions appear on separate screens, with no new stored fields', async ({ page }) => {
  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'get started', exact: true })).toBeVisible();
  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await expect(page.locator('form [aria-hidden="true"] > span')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'not sure yet' })).toBeChecked();
  await expect(page.getByLabel('when is your exam?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'save my answers' })).toHaveCount(0);
  expect(await savedAnswers(page)).toBeNull();

  await page.getByRole('radio', { name: 'both', exact: true }).check();
  await toExam(page);
  await expect(page.getByRole('radio', { name: 'both', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('when is your exam?')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'save my answers' })).toBeVisible();
  await page.getByLabel('when is your exam?').fill('2027-05-12');
  await page.getByRole('button', { name: 'save my answers' }).click();

  await expect(page.locator(':focus')).toContainText('saved on this device.');
  expect(await savedAnswers(page)).toEqual({ course: 'both', examDate: '2027-05-12', done: true });

  await page.reload();
  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await expect(page.getByRole('radio', { name: 'both', exact: true })).toBeChecked();
  await toExam(page);
  await expect(page.getByLabel('when is your exam?')).toHaveValue('2027-05-12');
});

test('back retains unsaved answers and skip clears only the current question', async ({ page }) => {
  await page.goto('/start');
  await expect(page.getByRole('link', { name: 'back', exact: true })).toHaveAttribute('href', '/');
  await page.getByRole('radio', { name: 'both', exact: true }).check();
  await toExam(page);
  const date = page.getByLabel('when is your exam?');
  await date.fill('2027-05-12');
  await page.getByRole('button', { name: 'back', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await expect(page.getByRole('radio', { name: 'both', exact: true })).toBeChecked();
  expect(await savedAnswers(page)).toBeNull();

  // Skip the course, then return to the date that was already entered.
  await page.getByRole('button', { name: 'skip', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
  await expect(date).toHaveValue('2027-05-12');
  await page.getByRole('button', { name: 'save my answers' }).click();
  expect(await savedAnswers(page)).toEqual({ course: null, examDate: '2027-05-12', done: true });

  await page.reload();
  await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
  await toExam(page);
  await page.getByRole('button', { name: 'skip', exact: true }).click();
  await expect(page.getByText('saved on this device.', { exact: true })).toBeVisible();
  expect(await savedAnswers(page)).toEqual({ course: 'fundamentals', examDate: null, done: true });
});

test('skip for now ends setup immediately without saving unsaved edits', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('radio', { name: 'fundamentals' }).check();
  await page.getByRole('button', { name: 'skip for now' }).click();
  await expect(page.locator(':focus')).toContainText('all set.');
  expect(await savedAnswers(page)).toEqual({ course: null, examDate: null, done: true });

  await page.goto('/start');
  await page.getByRole('radio', { name: 'med-surg i' }).check();
  await toExam(page);
  await page.getByLabel('when is your exam?').fill('2027-05-12');
  await page.getByRole('button', { name: 'skip for now' }).click();
  expect(await savedAnswers(page)).toEqual({ course: null, examDate: null, done: true });
});

test.describe('hardware keyboard', () => {
  // Native date controls behave differently on touch. Test editable keyboard
  // focus in non-touch mode at every configured width.
  test.use({ isMobile: false, hasTouch: false });

  test('both questions can be changed and saved with keyboard and visible focus', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cueory-progress', JSON.stringify({
      version: 1, onboarding: { course: 'fundamentals', examDate: '2027-05-12', done: true }, decks: {},
    })));
    await page.goto('/start');
    const firstCourse = page.getByRole('radio', { name: 'fundamentals', exact: true });
    await tabTo(page, firstCourse);
    await visibleKeyboardFocus(firstCourse);
    await page.keyboard.press('ArrowDown');
    const nextCourse = page.getByRole('radio', { name: 'med-surg i', exact: true });
    await expect(nextCourse).toBeChecked();
    await expect(nextCourse).toBeFocused();
    await visibleKeyboardFocus(nextCourse);

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
    const date = page.getByLabel('when is your exam?');
    await tabTo(page, date);
    await visibleKeyboardFocus(date);
    await page.keyboard.press('ArrowUp');
    const changedDate = await date.inputValue();
    expect(changedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(changedDate).not.toBe('2027-05-12');

    const save = page.getByRole('button', { name: 'save my answers' });
    await tabTo(page, save);
    await visibleKeyboardFocus(save);
    await page.keyboard.press('Enter');
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    expect(await savedAnswers(page)).toEqual({ course: 'med-surg-1', examDate: changedDate, done: true });
  });
});

test('clearing both answers is saved and survives a reload', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
  await toExam(page);
  const date = page.getByLabel('when is your exam?');
  await date.fill('2027-05-12');
  await page.getByRole('button', { name: 'save my answers' }).click();
  await expect(page.getByText('saved on this device.', { exact: true })).toBeVisible();
  await page.reload();

  await page.getByRole('radio', { name: 'not sure yet' }).check();
  await toExam(page);
  const clear = page.getByRole('button', { name: 'clear the date' });
  await clear.click();
  await expect(date).toHaveValue('');
  await expect(date).toBeFocused();
  await expect(clear).toHaveCount(0);
  await page.getByRole('button', { name: 'save my answers' }).click();
  await expect(page.getByText('saved on this device.', { exact: true })).toBeVisible();
  expect(await savedAnswers(page)).toEqual({ course: null, examDate: null, done: true });

  await page.reload();
  await expect(page.getByRole('radio', { name: 'not sure yet' })).toBeChecked();
  await toExam(page);
  await expect(date).toHaveValue('');
});

test('each question and saved confirmation pass accessibility and fit a narrow screen', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/start');
  const check = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(violation => violation.id + ': ' + violation.help)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };

  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await check();
  await toExam(page);
  await check();
  await page.getByRole('button', { name: 'save my answers' }).click();
  await expect(page.locator(':focus')).toContainText('saved on this device.');
  await check();
});

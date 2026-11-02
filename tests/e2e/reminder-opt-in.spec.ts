import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const path = '/preview/reminders';
const completed = (page: Page) => page.getByTestId('completed-review');
const openChoices = async (page: Page) => {
  await completed(page).getByRole('button', { name: 'remind me', exact: true }).click();
  await expect(completed(page).getByRole('group')).toBeVisible();
};
const stored = (page: Page) => page.evaluate(() => ({
  local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
  session: Object.fromEntries(Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)])),
}));

test('preview is unindexed and URL flags cannot offer reminders during an active review', async ({ page }) => {
  await page.goto(`${path}?reviewCompleted=true&reminders=on`);
  await expect(page).toHaveTitle('reminder choices preview · cueory');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('main')).not.toHaveAttribute('data-pagefind-body');
  await expect(page.getByTestId('active-review').getByRole('button')).toHaveCount(0);
  await expect(page.getByTestId('active-review').getByRole('radio')).toHaveCount(0);
  await expect(completed(page).getByRole('button', { name: 'remind me', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(completed(page).getByRole('radio')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/silk/);
});

test('choices need a deliberate tap, start unselected and explain the iPhone requirement', async ({ page }) => {
  await page.goto(path);
  await openChoices(page);
  await expect(completed(page).getByRole('button', { name: 'remind me', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(completed(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(completed(page).getByText('on iphone, add cueory to your home screen as a web app first.')).toBeVisible();
  await expect(completed(page).getByRole('radio', { name: 'email reminders', exact: true })).toBeVisible();
  await expect(completed(page).getByRole('button', { name: 'reminders coming soon' })).toBeDisabled();
});

test('changing channels never claims activation and not now clears the choice', async ({ page }) => {
  await page.goto(path);
  await openChoices(page);
  for (const name of ['phone notifications', 'email reminders']) {
    await completed(page).getByRole('radio', { name, exact: true }).check();
    await expect(completed(page).getByRole('status')).toHaveText(`${name} selected for this preview. nothing is enabled or saved.`);
  }
  await completed(page).getByRole('button', { name: 'not now', exact: true }).click();
  await expect(completed(page).getByRole('button', { name: 'remind me', exact: true })).toBeFocused();
  await expect(completed(page).getByRole('radio')).toHaveCount(0);
  await openChoices(page);
  await expect(completed(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(completed(page).getByRole('status')).toBeEmpty();
});

test('keyboard opens, changes channels and closes with visible focus', async ({ page }) => {
  await page.goto(path);
  const trigger = completed(page).getByRole('button', { name: 'remind me', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const phone = completed(page).getByRole('radio', { name: 'phone notifications', exact: true });
  const email = completed(page).getByRole('radio', { name: 'email reminders', exact: true });
  await expect(phone).toBeFocused();
  await page.keyboard.press('Space');
  await expect(phone).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(email).toBeChecked();
  await expect(email).toBeFocused();
  expect(await email.evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  })).toBe(true);
  await page.keyboard.press('Tab');
  await expect(completed(page).getByRole('button', { name: 'not now', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('exploring the preview never requests permission, subscribes, sends or stores a preference', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { reminderCalls: string[] }).reminderCalls = calls;
    if ('Notification' in window) Notification.requestPermission = async () => {
      calls.push('permission');
      return 'denied';
    };
    if ('PushManager' in window) PushManager.prototype.subscribe = async () => {
      calls.push('subscribe');
      throw new Error('The preview must not subscribe.');
    };
    if ('ServiceWorkerRegistration' in window) ServiceWorkerRegistration.prototype.showNotification = async () => {
      calls.push('notification');
    };
  });
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(path);
  await openChoices(page);
  const before = await stored(page);
  await completed(page).getByRole('radio', { name: 'phone notifications', exact: true }).check();
  await completed(page).getByRole('radio', { name: 'email reminders', exact: true }).check();
  await expect(completed(page).getByRole('button', { name: 'reminders coming soon' })).toBeDisabled();
  await completed(page).getByRole('button', { name: 'not now', exact: true }).click();
  expect(await stored(page)).toEqual(before);
  expect(await page.evaluate(() => (window as unknown as { reminderCalls: string[] }).reminderCalls)).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  await page.reload();
  await openChoices(page);
  await expect(completed(page).getByRole('radio', { checked: true })).toHaveCount(0);
});

for (const colorScheme of ['light', 'dark'] as const) test(`closed and open choices are accessible in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.goto(path);
  const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect((await axe()).violations).toEqual([]);
  await openChoices(page);
  expect((await axe()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await completed(page).getByRole('button').all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  for (const label of await completed(page).locator('label').all()) {
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
});

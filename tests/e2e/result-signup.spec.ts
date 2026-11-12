import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { newsletter } from '../../src/config/site';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`finish-screen signup in ${colorScheme}`, () => {
    test.use({ colorScheme, reducedMotion: 'reduce' });
    for (const path of ['/play', '/play/stat', '/play/hello-cards']) {
      test(`plain signup contract on ${path}`, async ({ page }, testInfo) => {
        const requests: string[] = [];
        page.on('request', (request) => requests.push(request.url()));
        await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const opener = page.getByRole('button', { name: 'open site menu', exact: true });
        await opener.focus();
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-result-card', { detail: {
          game: 'pulse', name: 'pillo', date: 'nov 12, 2026', result: '4 / 6', summary: '[sample result]', stats: [], path: '/play/pillo',
        } })));
        const dialog = page.getByTestId('game-result-dialog');
        const signup = dialog.getByTestId('result-signup');
        await expect(signup.getByRole('heading', { name: 'get launch updates' })).toBeVisible();
        if (!newsletter.formAction.startsWith('https://')) {
          await expect(signup.getByTestId('result-signup-pending')).toHaveText('signups open soon.');
          await expect(signup.locator('form, input, button')).toHaveCount(0);
        } else {
          const form = signup.getByTestId('result-signup-form');
          const email = form.getByRole('textbox', { name: 'email address' });
          const submit = form.getByRole('button', { name: 'sign up', exact: true });
          await expect(form).toHaveAttribute('action', newsletter.formAction);
          await expect(form).toHaveAttribute('method', 'post');
          await expect(email).toHaveAttribute('name', newsletter.emailFieldName);
          await expect(email).toHaveAttribute('maxlength', '254');
          await expect(email).toHaveAttribute('autocomplete', 'email');
          expect(requests.some((url) => new URL(url).origin === new URL(newsletter.formAction).origin)).toBe(false);
          await page.keyboard.press('Shift+Tab');
          await expect(signup.getByRole('link', { name: 'privacy page' })).toBeFocused();
          await page.keyboard.press('Shift+Tab');
          await expect(submit).toBeFocused();
          await page.keyboard.press('Shift+Tab');
          await expect(email).toBeFocused();
          await page.keyboard.press('Tab');
          await expect(submit).toBeFocused();
          for (const target of [email, submit, signup.getByRole('link', { name: 'privacy page' })]) {
            const box = await target.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.height).toBeGreaterThanOrEqual(44);
            expect(box!.width).toBeGreaterThanOrEqual(44);
          }
          let posted: string | null = null;
          await page.route(newsletter.formAction, async (route) => {
            posted = route.request().postData();
            await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>sample signup response</p>' });
          });
          await email.fill('not-an-email');
          await submit.click();
          expect(await email.evaluate((element) => (element as HTMLInputElement).validity.typeMismatch)).toBe(true);
          expect(posted).toBeNull();
          await email.fill('sample@example.test');
          const axe = await new AxeBuilder({ page }).include('[data-result-dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
          expect(axe.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
          if (testInfo.project.use.hasTouch) await submit.tap();
          else await page.keyboard.press('Enter');
          await expect.poll(() => posted).not.toBeNull();
          expect([...new URLSearchParams(posted!)]).toEqual([[newsletter.emailFieldName, 'sample@example.test']]);
          return;
        }
        const axe = await new AxeBuilder({ page }).include('[data-result-dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(axe.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
        expect(requests.some((url) => /kit\.com|convertkit\.com|newsletter\.example\.test/.test(url))).toBe(false);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
      });
    }
  });
}

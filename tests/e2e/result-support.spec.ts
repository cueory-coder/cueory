import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { newsletter, site } from '../../src/config/site';

for (const path of ['/play', '/play/stat', '/play/hello-cards']) {
 for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`finish-screen support on ${path} in ${colorScheme}`, () => {
    test.use({ colorScheme, reducedMotion: 'reduce' });

    test('appears after finishing, stays keyboard reachable and does not contact the tip service before activation', async ({ page }, testInfo) => {
      const tipRequests: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).origin === new URL(site.tipPageUrl).origin) tipRequests.push(request.url());
      });
      await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const dialog = page.getByTestId('game-result-dialog');
      await expect(dialog).toHaveCount(0);
      const opener = page.getByRole('button', { name: 'open site menu', exact: true });
      await opener.focus();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-result-card', { detail: {
        game: 'pulse', name: 'pillo', date: 'nov 12, 2026', result: '4 / 6',
        summary: '[sample result]', stats: [], path: '/play/pillo',
      } })));
      const close = dialog.getByRole('button', { name: 'close results' });
      const support = dialog.getByRole('link', { name: 'support our mission (opens in a new tab)', exact: true });
      await expect(close).toBeFocused();
      await expect(support).toHaveAttribute('href', site.tipPageUrl);
      await expect(support).toHaveAttribute('target', '_blank');
      await expect(support).toHaveAttribute('rel', 'noopener noreferrer');
      await page.keyboard.press('Shift+Tab');
      if (newsletter.formAction.startsWith('https://')) {
        await expect(dialog.getByRole('link', { name: 'privacy page' })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(close).toBeFocused();
        await support.focus();
      }
      await expect(support).toBeFocused();
      const target = await support.boundingBox();
      expect(target).not.toBeNull();
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
      expect(await support.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      })).toBe(true);
      await page.keyboard.press('Tab');
      if (newsletter.formAction.startsWith('https://')) {
        await expect(dialog.getByRole('textbox', { name: 'email address' })).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(support).toBeFocused();
        await dialog.getByRole('link', { name: 'privacy page' }).focus();
        await page.keyboard.press('Tab');
      }
      await expect(close).toBeFocused();
      const axe = await new AxeBuilder({ page }).include('[data-result-dialog]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
      expect(tipRequests).toEqual([]);
      // Fulfill locally: activation is tested without contacting the tip provider.
      await page.context().route(`${new URL(site.tipPageUrl).origin}/**`, (route) => route.fulfill({ status: 200, body: '[sample support page]' }));
      await support.focus();
      await expect(support).toBeFocused();
      const opened = page.waitForEvent('popup');
      await page.keyboard.press('Enter');
      const supportPage = await opened;
      await expect(supportPage).toHaveURL(site.tipPageUrl);
      expect(await supportPage.evaluate(() => window.opener === null)).toBe(true);
      await supportPage.close();
      const clicked = page.waitForEvent('popup');
      if (testInfo.project.use.hasTouch) await support.tap();
      else await support.click();
      const clickedPage = await clicked;
      await expect(clickedPage).toHaveURL(site.tipPageUrl);
      await clickedPage.close();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    });
  });
 }
}

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const card = {
  game: 'pulse', name: 'pillo', date: 'nov 12, 2026', result: '4 / 6',
  summary: '[sample result]', stats: [], path: '/play/pillo',
};

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`next puzzle in ${colorScheme}`, () => {
    test.use({ colorScheme, reducedMotion: 'reduce', timezoneId: 'America/New_York' });

    for (const path of ['/play', '/play/stat', '/play/hello-cards']) {
      test(`readable countdown and midnight boundary on ${path}`, async ({ page }) => {
        await page.clock.install({ time: new Date('2026-11-13T04:59:57Z') });
        await page.clock.pauseAt(new Date('2026-11-13T04:59:57Z'));
        await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('cueory:game-result-card', { detail })), card);
        const timer = page.getByTestId('next-puzzle-countdown');
        await expect(timer).toContainText('00:00:03');
        await expect(timer).toHaveAttribute('aria-live', 'off');
        await expect(timer).toHaveAccessibleName('next puzzle in 0 hours, 0 minutes, 3 seconds, at midnight in your time zone');
        await page.clock.runFor(2000);
        await expect(timer).toContainText('00:00:01');
        await page.clock.runFor(1000);
        await expect(page.getByTestId('next-puzzle-ready')).toHaveText('the next puzzle day has started. refresh to play.');
        await expect(timer).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('game-result-dialog')).toHaveCount(0);
      });
    }

    test('the text timer passes accessibility checks with reduced motion', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
      await page.goto('/play');
      await page.waitForLoadState('networkidle');
      await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('cueory:game-result-card', { detail })), card);
      await expect(page.getByRole('timer')).toContainText('next puzzle in');
      const axe = await new AxeBuilder({ page }).include('[data-result-dialog]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    });

    test('uses calendar midnight on 23-hour and 25-hour days and corrects a sleeping tab', async ({ page }) => {
      await page.clock.install({ time: new Date('2026-03-08T05:00:00Z') });
      await page.clock.pauseAt(new Date('2026-03-08T05:00:00Z'));
      await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
      await page.goto('/play');
      await page.waitForLoadState('networkidle');
      const open = () => page.evaluate((detail) => window.dispatchEvent(new CustomEvent('cueory:game-result-card', { detail })), card);
      await open();
      await expect(page.getByTestId('next-puzzle-countdown')).toContainText('23:00:00');
      await page.keyboard.press('Escape');
      await page.clock.setSystemTime(new Date('2026-11-01T04:00:00Z'));
      await open();
      await expect(page.getByTestId('next-puzzle-countdown')).toContainText('25:00:00');
      await page.clock.setSystemTime(new Date('2026-11-02T05:00:01Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByTestId('next-puzzle-ready')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.clock.setSystemTime(new Date('2026-11-03T04:00:00Z'));
      await open();
      await expect(page.getByTestId('next-puzzle-countdown')).toContainText('01:00:00');
    });

    test('does not promise a midnight release for an explicitly unavailable Stat daily set', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
      await page.goto('/play/stat');
      await page.waitForLoadState('networkidle');
      await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('cueory:game-result-card', { detail: {
        ...detail, game: 'stat', name: 'stat', nextMessage: 'reviewed daily sets will come later.',
      } })), card);
      await expect(page.getByTestId('game-result-dialog')).toContainText('reviewed daily sets will come later.');
      await expect(page.getByRole('timer')).toHaveCount(0);
    });
  });
}

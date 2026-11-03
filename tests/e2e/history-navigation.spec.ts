import { expect, test } from '@playwright/test';

const studyRoutes = [
  '/learn/study-skills',
  '/learn/study-skills/cards',
  '/learn/study-skills/fill-in',
  '/learn/study-skills/learn-mode',
  '/learn/study-skills/matching',
  '/learn/study-skills/organizer',
  '/learn/study-skills/questions',
];

async function historyState(page: Parameters<typeof test>[0] extends never ? never : any) {
  return page.evaluate(() => ({
    activeTag: document.activeElement?.tagName ?? '',
    activeId: document.activeElement?.id ?? '',
    scrollY: window.scrollY,
    maxScrollY: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight),
  }));
}

test.describe('Task 242: study-page browser history', () => {
  for (const route of studyRoutes) {
    test(`Back and Forward keep ${route} usable`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, Math.min(180, document.documentElement.scrollHeight)));

      const before = await historyState(page);
      expect(before.scrollY).toBeGreaterThanOrEqual(0);
      expect(before.scrollY).toBeLessThanOrEqual(before.maxScrollY);

      await page.goto('/learn/study-skills');
      await expect(page).toHaveURL(/\/learn\/study-skills$/);
      await expect(page.getByRole('main')).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`));
      await expect(page.getByRole('main')).toBeVisible();

      const afterBack = await historyState(page);
      expect(afterBack.activeTag).not.toBe('BODY');
      expect(afterBack.scrollY).toBeGreaterThanOrEqual(0);
      expect(afterBack.scrollY).toBeLessThanOrEqual(afterBack.maxScrollY);

      await page.goForward();
      await expect(page).toHaveURL(/\/learn\/study-skills$/);
      await expect(page.getByRole('main')).toBeVisible();

      const afterForward = await historyState(page);
      expect(afterForward.activeTag).not.toBe('BODY');
      expect(afterForward.scrollY).toBeGreaterThanOrEqual(0);
      expect(afterForward.scrollY).toBeLessThanOrEqual(afterForward.maxScrollY);
    });
  }
});

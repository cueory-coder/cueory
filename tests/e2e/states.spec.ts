import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const preview = '/preview/states';

test.describe('Task 91: loading and empty states', () => {
  test('preview is unlisted and shows all variants', async ({ page }) => {
    await page.goto(preview);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { level: 1, name: 'loading and empty states' })).toBeVisible();
    await expect(page.locator('[data-skeleton-kind="lines"]')).toHaveCount(1);
    await expect(page.locator('[data-skeleton-kind="card"]')).toHaveCount(1);
    await expect(page.locator('[data-skeleton-kind="ring"]')).toHaveCount(1);
    await expect(page.locator('[data-empty-state]')).toHaveCount(6);
  });

  test('ordinary preview load does not intentionally throw or log a sample render error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(preview);
    await expect(page.locator('[data-error-boundary-demo]').getByRole('button', { name: 'show sample error' })).toBeVisible();
    await expect(page.locator('[data-error-fallback]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('one accessible loading message per group, decorative shapes hidden', async ({ page }) => {
    await page.goto(preview);
    const groups = page.locator('[data-state-preview] [data-skeleton-kind]');
    await expect(groups).toHaveCount(3);
    for (const group of await groups.all()) {
      await expect(group).toHaveAttribute('role', 'status');
      await expect(group.locator('.sr-only')).toHaveCount(1);
      await expect(group.locator('.sr-only')).toHaveText('loading');
      await expect(group.locator('[aria-hidden="true"]')).toHaveCount(1);
    }
  });

  test('empty states have clear labels, optional icons and real navigation actions', async ({ page }) => {
    await page.goto(preview);
    const states = page.locator('[data-empty-state]');
    await expect(states.nth(0).getByRole('heading', { level: 3, name: 'nothing found.' })).toBeVisible();
    await expect(states.nth(0).locator('[data-empty-icon="search"]')).toHaveAttribute('aria-hidden', 'true');
    await expect(states.nth(1).getByRole('link')).toHaveCount(0);
    await expect(states.nth(3).locator('[data-empty-icon]')).toHaveCount(0);
    await expect(states.nth(3).getByRole('link')).toHaveCount(0);
    const action = states.nth(0).getByRole('link', { name: 'browse lessons' });
    await expect(action).toHaveAttribute('href', '/learn/study-skills');
    const size = await action.boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(44);
    expect(size!.width).toBeGreaterThanOrEqual(44);
    await action.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/learn\/study-skills$/);
  });

  test('reduced-motion mode never animates loading shapes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(preview);
    const names = await page.locator('[data-state-preview] .skeleton').evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).animationName),
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => name === 'none')).toBe(true);
  });

  test('both palettes have readable states and no accessibility violations', async ({ page }) => {
    await page.goto(preview);
    const backgrounds: string[] = [];
    // The theme switch lives in the footer's links panel (Task 85): open it first.
    const toggle = page.getByRole('contentinfo').locator('[data-footer-toggle]');
    await toggle.scrollIntoViewIfNeeded();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const choice of ['Light', 'Dark']) {
      await page.getByRole('radio', { name: choice }).check();
      const bg = await page.locator('[data-empty-state]').first().evaluate((node) => getComputedStyle(node).backgroundColor);
      backgrounds.push(bg);
      const results = await new AxeBuilder({ page })
        .include('[data-state-preview]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    }
    expect(backgrounds[0]).not.toBe(backgrounds[1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('no horizontal overflow even at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(preview);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('missing and failed puzzles show a readable message and a keyboard retry button', async ({ page }) => {
    await page.goto(preview);
    for (const state of ['none-today', 'failed']) {
      const panel = page.locator('[data-puzzle-feed-state="' + state + '"]');
      await expect(panel.getByRole('heading', { name: "today's puzzle isn't ready." })).toBeVisible();
      await expect(panel.getByText(/try again later/)).toBeVisible();
      const retry = panel.getByRole('button', { name: 'try again' });
      const box = await retry.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Tab');
      await retry.focus();
      await expect(retry).toBeFocused();
      expect(await retry.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
      await Promise.all([
        page.waitForEvent('load'),
        page.keyboard.press('Enter'),
      ]);
      await expect(page).toHaveURL(/\/preview\/states\/?(?:\?.*)?$/);
      const reloaded = page.locator('[data-puzzle-feed-state="' + state + '"]');
      await expect(reloaded).toBeVisible();
      await Promise.all([
        page.waitForEvent('load'),
        reloaded.getByRole('button', { name: 'try again' }).click(),
      ]);
      await expect(page.locator('[data-puzzle-feed-state="' + state + '"]')).toBeVisible();
    }
  });

  test('a crashed interactive part shows a private fallback without hiding the rest of the page', async ({ page }) => {
    await page.goto(preview);
    const demo = page.locator('[data-error-boundary-demo]');
    const trigger = demo.getByRole('button', { name: 'show sample error' });
    const fallback = demo.locator('[data-error-fallback]');
    await expect(trigger).toBeVisible();
    await expect(fallback).toHaveCount(0);
    const triggerSize = await trigger.boundingBox();
    expect(triggerSize?.height).toBeGreaterThanOrEqual(44);
    expect(triggerSize?.width).toBeGreaterThanOrEqual(44);
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole('heading', { name: "this part didn't load." })).toBeVisible();
    await expect(fallback).toContainText('reload the page to try again.');
    await expect(page.locator('body')).not.toContainText('[sample simulated render failure]');
    await expect(page.getByRole('heading', { level: 1, name: 'loading and empty states' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'browse lessons' })).toBeVisible();

    const reload = fallback.getByRole('button', { name: 'reload page' });
    const size = await reload.boundingBox();
    expect(size?.height).toBeGreaterThanOrEqual(44);
    expect(size?.width).toBeGreaterThanOrEqual(44);
    await reload.focus();
    await expect(reload).toBeFocused();
    await Promise.all([
      page.waitForEvent('load'),
      page.keyboard.press('Enter'),
    ]);
    await expect(page.locator('[data-error-boundary-demo] [data-error-fallback]')).toHaveCount(0);
    const triggerAgain = page.locator('[data-error-boundary-demo]').getByRole('button', { name: 'show sample error' });
    await expect(triggerAgain).toBeVisible();
    await triggerAgain.click();
    const secondFallback = page.locator('[data-error-boundary-demo] [data-error-fallback]');
    await expect(secondFallback).toBeVisible();
    await Promise.all([
      page.waitForEvent('load'),
      secondFallback.getByRole('button', { name: 'reload page' }).click(),
    ]);
    await expect(page.locator('[data-error-boundary-demo] [data-error-fallback]')).toHaveCount(0);
    await expect(page.locator('[data-error-boundary-demo]').getByRole('button', { name: 'show sample error' })).toBeVisible();
    await page.getByRole('link', { name: 'browse lessons' }).click();
    await expect(page).toHaveURL(/\/learn\/study-skills\/?$/);
  });

  test('error fallback has an accessible name and visible keyboard focus without motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(preview);
    const demo = page.locator('[data-error-boundary-demo]');
    const trigger = demo.getByRole('button', { name: 'show sample error' });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const fallback = demo.locator('[data-error-fallback]');
    await expect(fallback).toHaveAttribute('role', 'status');
    await expect(fallback).toHaveAttribute('aria-label', "this part didn't load.");
    const reload = fallback.getByRole('button', { name: 'reload page' });
    await page.keyboard.press('Tab');
    await reload.focus();
    await expect(reload).toBeFocused();
    expect(await reload.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    expect(await reload.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
  });

  for (const width of [390, 820, 1440]) {
    for (const palette of ['Light', 'Dark']) {
      test('puzzle states: axe and no overflow at ' + width + 'px in ' + palette, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(preview);
        const toggle = page.getByRole('contentinfo').locator('[data-footer-toggle]');
        await toggle.scrollIntoViewIfNeeded();
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
        await page.getByRole('radio', { name: palette }).check();

        for (const state of ['none-today', 'failed']) {
          const panel = page.locator('[data-puzzle-feed-state="' + state + '"]');
          await expect(panel).toBeVisible();
          const retry = panel.getByRole('button', { name: 'try again' });
          const box = await retry.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
          expect(box?.width).toBeGreaterThanOrEqual(44);
        }
        const demo = page.locator('[data-error-boundary-demo]');
        const trigger = demo.getByRole('button', { name: 'show sample error' });
        await expect(trigger).toBeVisible();
        await expect(demo.locator('[data-error-fallback]')).toHaveCount(0);
        await trigger.click();
        const crash = demo.locator('[data-error-fallback]');
        await expect(crash).toBeVisible();
        const retryButton = crash.getByRole('button', { name: 'reload page' });
        const retrySize = await retryButton.boundingBox();
        expect(retrySize?.height).toBeGreaterThanOrEqual(44);
        expect(retrySize?.width).toBeGreaterThanOrEqual(44);

        const results = await new AxeBuilder({ page })
          .include('[data-state-preview]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
    }
  }
  test('repeat offline events do not repeat a polite screen-reader announcement', async ({ page, context }) => {
    await page.goto(preview);
    const live = page.locator('[data-network-notice-live]');
    await live.evaluate((element) => {
      const node = element as HTMLElement;
      node.dataset.announcements = '0';
      new MutationObserver(() => {
        if (!node.textContent?.trim()) return;
        node.dataset.announcements = String(Number(node.dataset.announcements ?? '0') + 1);
      }).observe(node, { childList: true, subtree: true, characterData: true });
    });
    await context.setOffline(true);
    await expect(live).toHaveText("you're offline. saved lessons and games already loaded may still work.");
    await expect(live).toHaveAttribute('data-announcements', '1');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));
    });
    await expect(live).toHaveAttribute('data-announcements', '1');
    await context.setOffline(false);
    await expect(live).toBeEmpty();
    await expect(live).toHaveAttribute('data-announcements', '1');
  });

  test('offline notice appears politely once and hides when the connection returns', async ({ page, context }) => {
    await page.goto(preview);
    const panel = page.locator('[data-network-notice-panel]');
    const live = page.locator('[data-network-notice-live]');
    await expect(panel).toBeHidden();
    await expect(live).toBeEmpty();
    await expect(live).toHaveAttribute('role', 'status');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveAttribute('aria-atomic', 'true');

    await context.setOffline(true);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("you're offline.");
    await expect(panel).toContainText('saved lessons');
    await expect(panel).toContainText('games already loaded');
    await expect(live).toHaveText("you're offline. saved lessons and games already loaded may still work.");
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(live).toHaveText("you're offline. saved lessons and games already loaded may still work.");

    await context.setOffline(false);
    await expect(panel).toBeHidden();
    await expect(live).toBeEmpty();
  });

  for (const width of [390, 820, 1440]) {
    for (const palette of ['Light', 'Dark']) {
      test('offline notice: axe and no overflow at ' + width + 'px in ' + palette, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(preview);
        const toggle = page.getByRole('contentinfo').locator('[data-footer-toggle]');
        await toggle.scrollIntoViewIfNeeded();
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
        await page.getByRole('radio', { name: palette }).check();

        await context.setOffline(true);
        await expect(page.locator('[data-network-notice-panel]')).toBeVisible();
        const results = await new AxeBuilder({ page })
          .include('[data-state-preview]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

        await context.setOffline(false);
        await expect(page.locator('[data-network-notice-panel]')).toBeHidden();
      });
    }
  }

});

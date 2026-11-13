import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const games = [
  ['/play', 'pulse'], ['/play', 'cueword'], ['/play', 'sudoku'], ['/play', 'suture'],
  ['/play/stat', 'stat'], ['/play/hello-cards', 'hello-cards'],
] as const;
for (const [path, id] of games) {
  test(`${path} ${id}: keyboard and tap help, focus, targets and accessible rules`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
    await page.goto(path);
    const game = page.getByTestId(id);
    const trigger = game.getByRole('button', { name: /^how to play / });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await expect(trigger).toBeFocused();
    expect(await trigger.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    const dialog = game.locator('dialog.how-to-play-dialog');
    const close = dialog.getByRole('button', { name: 'close help', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(/^how to play /);
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();
    // A document-level game shortcut must not receive keys typed in help.
    const before = await game.locator('input, [role=grid]').evaluateAll(els => els.map(el => el instanceof HTMLInputElement ? el.value : el.textContent));
    await page.keyboard.press('1');
    await page.keyboard.press('a');
    expect(await game.locator('input, [role=grid]').evaluateAll(els => els.map(el => el instanceof HTMLInputElement ? el.value : el.textContent))).toEqual(before);
    for (const control of [trigger, close]) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).include('dialog.how-to-play-dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    expect(await dialog.evaluate(el => {
      const card = el.querySelector('.how-to-play-card')!;
      return card.scrollWidth <= card.clientWidth && el.getBoundingClientRect().width <= innerWidth;
    })).toBe(true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    if (test.info().project.use.hasTouch) await trigger.tap(); else await trigger.click();
    await expect(close).toBeFocused();
    if (test.info().project.use.hasTouch) await close.tap(); else await close.click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

test('stat help blocks answer shortcuts while the round clock keeps running', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T09:00:00') });
  await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
  await page.goto('/play/stat');
  await expect(page.getByTestId('stat-start')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-11T09:05:00'));
  await page.getByTestId('stat-start').click();
  const game = page.getByTestId('stat');
  await game.getByRole('button', { name: 'how to play stat', exact: true }).click();
  const dialog = game.locator('dialog.how-to-play-dialog');
  await expect(dialog).toContainText('there is no pause, including while help is open');
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await expect(game.getByTestId('stat-progress')).toContainText('question 1 of');
  await expect(game.locator('[data-testid^="stat-choice-"][aria-pressed="true"]')).toHaveCount(0);
  await expect(dialog).not.toBeVisible();
  await game.getByRole('button', { name: 'how to play stat', exact: true }).click();
  await page.clock.fastForward(21_000);
  await expect(game.getByTestId('stat-progress')).toContainText('question 2 of');
  await expect(dialog).toBeVisible();
});

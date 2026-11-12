import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const names: Record<string, string> = {
  FIX001: 'fixture cube A', FIX002: 'fixture cube B', FIX003: 'fixture block C',
  FIX004: 'fixture point D', FIX005: 'fixture slab E',
};

async function tabTo(page: Page, target: Locator) {
  for (let count = 0; count < 60; count++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  await expect(target).toBeFocused();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`text recall works by keyboard without opening 3D (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const downloads: string[] = [];
    page.on('request', (request) => { if (/\.glb(?:\?|$)/.test(request.url())) downloads.push(request.url()); });
    await page.goto('/preview/anatomy-lab?fixture');
    const region = page.getByRole('region', { name: 'source ID practice', exact: true });
    const start = region.getByRole('button', { name: 'start text name it', exact: true });
    await tabTo(page, start);
    await expect(start).toBeFocused();
    const size = await start.boundingBox();
    expect(size?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await start.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    const input = region.getByLabel('type the official name', { exact: true });
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-describedby', 'anatomy-text-question');
    const seen: string[] = [];
    for (let index = 0; index < 5; index++) {
      const id = (await region.locator('[data-text-recall-id]').textContent())!;
      expect(names[id]).toBeDefined();
      expect(seen).not.toContain(id);
      seen.push(id);
      if (index === 0) {
        await page.keyboard.type('not the name');
        await page.keyboard.press('Enter');
        await expect(region.locator('[data-text-feedback="wrong"]')).toContainText('✗ not this one');
        await expect(input).toBeFocused();
        await page.keyboard.press('ControlOrMeta+A');
      }
      await page.keyboard.type(names[id]!.toUpperCase());
      await page.keyboard.press('Enter');
      await expect(region.locator('[data-text-feedback="right"]')).toContainText(`✓ right: ${names[id]}.`);
      await expect(input).toBeFocused();
      await tabTo(page, region.getByRole('button', { name: 'next source ID', exact: true }));
      await page.keyboard.press('Enter');
      if (index < 4) await expect(input).toBeFocused();
    }
    await expect(region.getByText('round done: every source ID in this round has been asked.')).toBeFocused();
    await tabTo(page, region.getByRole('button', { name: 'start text round again' }));
    await page.keyboard.press('Enter');
    await expect(input).toBeFocused();
    await tabTo(page, region.getByRole('button', { name: 'stop text practice' }));
    await page.keyboard.press('Enter');
    await expect(start).toBeFocused();
    expect(downloads).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  });

  test(`text recall survives unavailable WebGL and supports choices and system reset (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type.startsWith('webgl')) return null;
        return original.call(this, type as '2d', ...args as []) as never;
      } as typeof original;
    });
    await page.goto('/preview/anatomy-lab?fixture');
    await page.getByRole('button', { name: 'open the anatomy lab', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'the 3D anatomy lab could not open.' })).toBeVisible();
    const region = page.getByRole('region', { name: 'source ID practice', exact: true });
    const start = region.getByRole('button', { name: 'start text name it', exact: true });
    await start.click();
    const id = (await region.locator('[data-text-recall-id]').textContent())!;
    await region.getByRole('button', { name: names[id]!, exact: true }).click();
    await expect(region.locator('[data-text-feedback="right"]')).toContainText(names[id]!);
    const picker = region.getByLabel('body system for text practice');
    const other = await picker.locator('option').evaluateAll((options) => (options as HTMLOptionElement[]).find((option) => option.value !== 'fixture')!.value);
    await picker.selectOption(other);
    await expect(start).toBeVisible();
    await expect(region.locator('[data-text-recall-id]')).toHaveCount(0);
    await picker.selectOption('fixture');
    await start.click();
    await region.getByRole('button', { name: 'show the name', exact: true }).click();
    await expect(region.locator('[data-text-feedback="shown"]')).toContainText('the name is: fixture');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  });
}

import { expect, test } from '@playwright/test';

// Exercise the native system palette rather than comparing brand hex colors.
test.use({ forcedColors: 'active' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* unavailable */ }
  });
});

test('forced colors preserves button text and keyboard focus', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  const controls = page.locator('main button:visible, main a:visible');
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    const visible = await control.evaluate(element => {
      const style = getComputedStyle(element);
      return style.visibility === 'visible' && style.opacity !== '0' && style.color !== style.backgroundColor;
    });
    expect(visible, await control.innerText()).toBe(true);
  }
  await page.keyboard.press('Tab');
  await expect(page.locator('a[href="#main"]')).toBeFocused();
  const indicator = await page.locator('a[href="#main"]').evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 &&
      style.outlineColor !== style.backgroundColor;
  });
  expect(indicator, 'keyboard focus must retain a visible system-color outline').toBe(true);
});

test('forced colors exposes native selected radio and its focus ring', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-footer-toggle]').click();
  const picker = page.locator('[data-theme-picker]');
  await expect(picker).toBeVisible();
  const light = picker.locator('input[value="light"]');
  await light.check();
  await expect(light).toBeChecked();
  expect(await light.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  const dark = picker.locator('input[value="dark"]');
  await page.keyboard.press('ArrowRight');
  await expect(dark).toBeChecked();
  await expect(dark).toBeFocused();
  const ring = await dark.evaluate(element => {
    const label = element.closest('label')!;
    const style = getComputedStyle(label);
    return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 &&
      style.outlineColor !== style.backgroundColor;
  });
  expect(ring, 'selected native radio retains its parent focus ring').toBe(true);
});

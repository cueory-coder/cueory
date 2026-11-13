import { expect, test, type Locator, type Page } from '@playwright/test';

// Synthetic shapes only. Every action uses actual keyboard events; DOM reads only inspect focus.
async function focusByTab(page: Page, target: Locator) {
  for (let step = 0; step < 180; step++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard could not reach ${await target.textContent()}`);
}
async function activate(page: Page, target: Locator) {
  await focusByTab(page, target);
  await expect(target).toBeFocused();
  await page.keyboard.press('Enter');
}
async function sweep(page: Page) {
  const controls = page.locator('main button:enabled, main a[href], main input:enabled, main select:enabled, main canvas[tabindex="0"], main summary');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    await focusByTab(page, control);
    await expect(control).toBeFocused();
    const visible = await control.evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return el.matches(':focus-visible') && style.outlineStyle !== 'none'
        && parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'rgba(0, 0, 0, 0)'
        && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    });
    expect(visible, `Visible keyboard focus: ${await control.getAttribute('aria-label') ?? await control.textContent()}`).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`whole lab keyboard walkthrough (${colorScheme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/preview/anatomy-lab?fixture');
    await activate(page, page.getByRole('button', { name: 'open the anatomy lab' }));
    const canvas = page.locator('canvas');
    await expect(canvas).toBeFocused();
    await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });
    await sweep(page);
    await focusByTab(page, canvas);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '1', '2', '3', 'Home']) {
      await page.keyboard.press(key);
      await expect(canvas).toBeFocused();
    }
    const keys = page.getByRole('button', { name: 'keys', exact: true });
    await activate(page, keys);
    await sweep(page);
    await focusByTab(page, page.getByRole('button', { name: 'close keys' }));
    await page.keyboard.press('Escape');
    await expect(keys).toBeFocused();
    await expect(page.getByRole('region', { name: 'keys for the 3D view' })).toHaveCount(0);

    await activate(page, page.getByRole('button', { name: 'fixture cube A', exact: true }));
    await sweep(page);
    await activate(page, page.getByRole('button', { name: 'clear selection', exact: true }));
    // Removing the card must leave focus on the structure that opened it.
    await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeFocused();

    await activate(page, page.getByRole('button', { name: 'start the quiz' }));
    await sweep(page);
    await activate(page, page.getByRole('button', { name: 'stop the quiz' }));
    await activate(page, page.getByRole('button', { name: 'start name it' }));
    await sweep(page);
    await activate(page, page.getByRole('button', { name: 'stop name it' }));

    const make = page.getByRole('button', { name: 'make a worksheet' });
    await activate(page, make);
    await expect(page.getByRole('heading', { name: 'worksheet: test shapes (fixture)' })).toBeFocused({ timeout: 20_000 });
    await sweep(page);
    await activate(page, page.getByRole('button', { name: 'show answers', exact: true }));
    await expect(page.getByRole('button', { name: 'show answers', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await activate(page, page.getByRole('button', { name: 'close worksheet' }));
    await expect(make).toBeFocused();
    await sweep(page);
  });
}

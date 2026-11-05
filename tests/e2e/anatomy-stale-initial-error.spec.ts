import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * Synthetic fixture: cause a rejected initial GLB to settle in the same
 * browser task as a body-system click. The previous load must not put its
 * error into the newly selected system before passive effect cleanup.
 */
test('ignores an initial model failure from the previous body system', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one stale-request regression per browser engine');

  await page.addInitScript(() => {
    const state = window as typeof window & {
      __anatomyFixtureHeld?: boolean;
      __anatomyRejectFixture?: () => void;
      __anatomySawStaleAlert?: boolean;
    };
    state.__anatomyFixtureHeld = false;
    state.__anatomySawStaleAlert = false;
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const address = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (new URL(address, window.location.href).pathname === '/preview/anatomy-fixture/fixture.glb') {
        state.__anatomyFixtureHeld = true;
        return new Promise<Response>((_resolve, reject) => {
          state.__anatomyRejectFixture = () => reject(new Error('obsolete fixture network failure'));
        });
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
    const observer = new MutationObserver(() => {
      if ([...document.querySelectorAll('[role="alert"]')].some(
        (element) => element.textContent?.includes('could not load'),
      )) state.__anatomySawStaleAlert = true;
    });
    observer.observe(document, { childList: true, subtree: true, characterData: true });
  });

  const pending: Array<() => void> = [];
  await page.route(/\.glb(?:\?|$)/, async (route) => {
    // The fixture is held by window.fetch. These are the replacement system's
    // GLBs, kept pending while obsolete rejection and React state settle.
    await new Promise<void>((resolve) => pending.push(resolve));
    await route.continue();
  });

  try {
    await page.goto('/preview/anatomy-lab?fixture');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect.poll(
      () => page.evaluate(() => (window as typeof window & { __anatomyFixtureHeld?: boolean }).__anatomyFixtureHeld),
      { timeout: 20_000 },
    ).toBe(true);

    const picker = page.getByRole('group', { name: 'body system' }).getByRole('button');
    await expect.poll(() => picker.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

    // Reject the old fixture in the same JavaScript task as the system change,
    // before relying on React's deferred cleanup of the original load effect.
    await picker.nth(1).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (window as typeof window & { __anatomyRejectFixture?: () => void }).__anatomyRejectFixture?.();
    });

    await expect(picker.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => pending.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/^loading /).first()).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'could not load' })).toHaveCount(0);
    expect(await page.evaluate(
      () => (window as typeof window & { __anatomySawStaleAlert?: boolean }).__anatomySawStaleAlert,
    )).toBe(false);
  } finally {
    // Do not strand replacement GLB requests if any assertion fails.
    pending.splice(0).forEach((release) => release());
  }
});

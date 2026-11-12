import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import data from '../../content/breaks/ideas.json' with { type: 'json' };

const list = (page: Page) => page.getByRole('list', { name: 'all the ideas' });
const showOne = (page: Page) => page.getByRole('button', { name: 'show me one', exact: true });
const shuffle = (page: Page) => page.getByRole('button', { name: 'shuffle the ideas', exact: true });
const expectedIdeas = data.ideas.map(idea => idea.text);

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeEnabled();
  for (let step = 0; step < 40; step++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('sample page stays out of search and lists all ideas on plain cards', async ({ page }) => {
  await page.goto('/breaks');
  await expect(page).toHaveTitle('break ideas · cueory');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('main')).not.toHaveAttribute('data-pagefind-body');
  await expect(page.getByText('sample ideas · awaiting content approval')).toBeVisible();
  await expect(list(page).getByRole('listitem')).toHaveText(expectedIdeas);
  await expect(page.locator('body')).not.toHaveClass(/silk/);
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.getByText('sharing your own idea is coming with free accounts. for now, you can browse these samples.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'back to study skills' })).toHaveAttribute('href', '/learn/study-skills');
});

test('shuffle works from the keyboard, keeps focus and preserves every idea', async ({ page }) => {
  // This random draw would keep Fisher–Yates in the original order: exercise the fresh-list fallback too.
  await page.addInitScript(() => { Math.random = () => 0.999999; });
  await page.goto('/breaks');
  await tabTo(page, shuffle(page));
  expect(await shuffle(page).evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(list(page).getByRole('listitem').first()).not.toHaveText(expectedIdeas[0]!);
  expect((await list(page).getByRole('listitem').allTextContents()).sort()).toEqual([...expectedIdeas].sort());
  await expect(shuffle(page)).toBeFocused();
  await expect(page.getByRole('status', { name: 'break idea update' })).toHaveText('the list is shuffled. all the same ideas are here in a new order.');
});

test('tap choices do not repeat immediately, change storage or submit data', async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/breaks');
  await expect(showOne(page)).toBeEnabled();
  const stored = () => page.evaluate(() => ({
    local: { ...localStorage }, session: { ...sessionStorage },
  }));
  const before = await stored();
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method()); });
  await showOne(page).click();
  const first = await page.getByTestId('picked-break-idea').innerText();
  expect(expectedIdeas).toContain(first);
  await showOne(page).click();
  await expect(page.getByTestId('picked-break-idea')).not.toHaveText(first);
  const second = await page.getByTestId('picked-break-idea').innerText();
  expect(expectedIdeas).toContain(second);
  await expect(page.getByRole('status', { name: 'break idea update' })).toHaveText(`one idea: ${second}`);
  await shuffle(page).click();
  expect((await list(page).getByRole('listitem').allTextContents()).sort()).toEqual([...expectedIdeas].sort());
  expect(await stored()).toEqual(before);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});


test('real touchscreen taps operate the timer and idea picker', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.goto('/breaks');
    const timer = page.getByTestId('break-timer');
    await timer.getByRole('button', { name: 'turn on' }).tap();
    await expect(timer.getByTestId('break-status')).toContainText('studying:');
    await timer.getByRole('button', { name: 'pause' }).tap();
    await expect(timer.getByTestId('break-status')).toContainText('studying paused:');
    await timer.getByRole('button', { name: 'resume' }).tap();
    await expect(timer.getByTestId('break-status')).toContainText('studying:');
    await timer.getByRole('button', { name: 'turn off' }).tap();
    await expect(timer.getByRole('button', { name: 'turn on' })).toBeVisible();

    await showOne(page).tap();
    const picked = page.getByTestId('picked-break-idea');
    const first = await picked.innerText();
    expect(expectedIdeas).toContain(first);
    await showOne(page).tap();
    await expect(picked).not.toHaveText(first);
    await shuffle(page).tap();
    await expect(page.getByRole('status', { name: 'break idea update' }))
      .toHaveText('the list is shuffled. all the same ideas are here in a new order.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
});

for (const width of [320, 390, 820, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${width}px ${colorScheme}: readable cards, touch targets and axe after choosing`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/breaks');
      await showOne(page).click();
      await expect(list(page).getByRole('listitem')).toHaveCount(20);
      const timer = page.getByTestId('break-timer');
      await timer.getByRole('button', { name: 'turn on' }).click();
      await expect(timer.getByTestId('break-status')).toHaveText('studying: 25 minutes left.');
      await expect(timer.locator('svg')).toHaveCount(0); // no motion or ring, including reduced-motion mode
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const control of [
        showOne(page), shuffle(page),
        timer.getByRole('button', { name: 'turn off' }),
        timer.getByRole('button', { name: 'pause' }),
      ]) {
        const box = await control.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(await control.evaluate(element => getComputedStyle(element).transitionDuration.split(',')
          .every(value => parseFloat(value) <= 0.01))).toBe(true);
      }
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test('all sample ideas remain readable with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.goto('/breaks');
    await expect(list(page).getByRole('listitem')).toHaveText(expectedIdeas);
    await expect(showOne(page)).toBeDisabled();
    await expect(shuffle(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'turn on' })).toBeDisabled();
    // Playwright skips NOSCRIPT in text matching; inspect the actual rendered paragraph.
    const instructions = page.locator('noscript p');
    await expect(instructions).toHaveText('all the ideas are listed here. turn on javascript to shuffle them or choose one at random.');
    await expect(instructions).toBeVisible();
  } finally {
    await context.close();
  }
});

// W19: app clock is deliberately separate from browser timeouts to mimic a sleeping phone/tab.
async function withSleepingClock(page: Page) {
  await page.addInitScript(() => {
    const clock = { now: Date.UTC(2026, 10, 1, 12) };
    Object.defineProperty(window, '__w19BreakClock', { value: clock });
    Date.now = () => clock.now;
  });
}

async function advanceWithoutWake(page: Page, elapsedMs: number) {
  await page.evaluate(ms => {
    const clock = (window as unknown as { __w19BreakClock: { now: number } }).__w19BreakClock;
    clock.now += ms;
  }, elapsedMs);
}

async function wakeAfter(page: Page, elapsedMs: number) {
  await advanceWithoutWake(page, elapsedMs);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('timer restores its saved end time after a reload', async ({ page }) => {
  await page.goto('/breaks');
  const timer = page.getByTestId('break-timer');
  await timer.getByRole('button', { name: 'turn on' }).click();
  await expect(timer.getByTestId('break-status')).toContainText('studying:');
  await expect.poll(async () => page.evaluate(() => {
    const stored = sessionStorage.getItem('cueory-break-timer');
    if (!stored) return null;
    const record = JSON.parse(stored) as { state?: { endsAt?: number; status?: string } };
    return record.state?.status === 'focusing' ? record.state.endsAt : null;
  })).toBeGreaterThan(Date.now());
  // The exact deadline must not be replaced by a full new focus period on reload.
  const before = await page.evaluate(() => {
    const stored = sessionStorage.getItem('cueory-break-timer')!;
    return (JSON.parse(stored) as { state: { endsAt: number } }).state.endsAt;
  });
  await page.reload();
  await expect(timer.getByTestId('break-status')).toContainText('studying:');
  await expect.poll(async () => page.evaluate(() => {
    const stored = sessionStorage.getItem('cueory-break-timer')!;
    return (JSON.parse(stored) as { state: { endsAt: number } }).state.endsAt;
  })).toBe(before);
});

test('an expired saved break persists its new focus deadline across another reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('cueory-break-timer')) return;
    const now = Date.now();
    sessionStorage.setItem('cueory-break-timer', JSON.stringify({
      version: 1,
      savedAt: now - 6 * 60_000,
      state: {
        settings: { focusMinutes: 25, breakMinutes: 5 },
        status: 'on break', endsAt: now - 60_000,
        pausedFrom: null, pausedRemainingMs: 0,
      },
    }));
  });
  await page.goto('/breaks');
  const status = page.getByTestId('break-status');
  await expect(status).toHaveText('studying: 25 minutes left.');
  const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('cueory-break-timer')!));
  await expect.poll(async () => (await saved()).state.status).toBe('focusing');
  const deadline = (await saved()).state.endsAt;
  await page.clock.fastForward(5 * 60_000);
  await expect(status).toHaveText('studying: 20 minutes left.');
  await page.reload();
  await expect(status).toHaveText('studying: 20 minutes left.');
  expect((await saved()).state.endsAt).toBe(deadline);
});

test('hydration leaves an unchanged paused timer timestamp alone so its age limit still applies', async ({ page }) => {
  const now = Date.UTC(2026, 10, 1, 12);
  const savedAt = now - 90 * 60_000;
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(({ savedAt }) => {
    if (sessionStorage.getItem('cueory-break-timer')) return;
    sessionStorage.setItem('cueory-break-timer', JSON.stringify({
      version: 1, savedAt,
      state: {
        settings: { focusMinutes: 25, breakMinutes: 5 },
        status: 'paused', endsAt: null, pausedFrom: 'focusing', pausedRemainingMs: 60_000,
      },
    }));
  }, { savedAt });
  await page.goto('/breaks');
  await expect(page.getByTestId('break-status')).toHaveText('studying paused: 1 minute left.');
  const timestamp = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('cueory-break-timer')!).savedAt);
  expect(await timestamp()).toBe(savedAt);
  await page.reload();
  await expect(page.getByTestId('break-status')).toHaveText('studying paused: 1 minute left.');
  expect(await timestamp()).toBe(savedAt);
  await page.clock.fastForward(31 * 60_000);
  await page.reload();
  await expect(page.getByTestId('break-timer').getByRole('button', { name: 'turn on' })).toBeEnabled();
  await expect(page.getByTestId('break-status')).toHaveCount(0);
});

test('an expired saved focus phase is persisted as break due', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
  await page.addInitScript(() => {
    const now = Date.now();
    sessionStorage.setItem('cueory-break-timer', JSON.stringify({
      version: 1, savedAt: now - 26 * 60_000,
      state: {
        settings: { focusMinutes: 25, breakMinutes: 5 },
        status: 'focusing', endsAt: now - 60_000,
        pausedFrom: null, pausedRemainingMs: 0,
      },
    }));
  });
  await page.goto('/breaks');
  await expect(page.getByTestId('break-status')).toHaveText('time for a short break.');
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('cueory-break-timer')!).state.status)).toBe('break due');
});

test('sleep cannot stretch the countdown, and keyboard focus moves to a due-break choice', async ({ page }) => {
  await withSleepingClock(page);
  await page.goto('/breaks');
  const timer = page.getByTestId('break-timer');
  await tabTo(page, timer.getByRole('button', { name: 'turn on' }));
  await page.keyboard.press('Enter');
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 25 minutes left.');
  const live = timer.getByTestId('break-live');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveText('studying: 25 minutes left.');
  await wakeAfter(page, 60_000);
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 24 minutes left.');
  await expect(live).toHaveText('studying: 25 minutes left.'); // no noisy per-second or per-minute announcements
  await tabTo(page, timer.getByRole('button', { name: 'pause' }));
  await wakeAfter(page, 24 * 60_000);
  await expect(timer.getByTestId('break-status')).toHaveText('time for a short break.');
  await expect(timer.getByRole('button', { name: 'start break' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(timer.getByTestId('break-status')).toHaveText('on a break: 5 minutes left.');
  await wakeAfter(page, 5 * 60_000);
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 25 minutes left.');
});

test('paused timer ignores elapsed wall time and resume uses the exact remainder', async ({ page }) => {
  await withSleepingClock(page);
  await page.goto('/breaks');
  const timer = page.getByTestId('break-timer');
  await timer.getByRole('button', { name: 'turn on' }).click();
  await wakeAfter(page, 8 * 60_000 + 30_000);
  await timer.getByRole('button', { name: 'pause' }).click();
  await expect(timer.getByTestId('break-status')).toHaveText('studying paused: 17 minutes left.');
  await wakeAfter(page, 60 * 60_000);
  await expect(timer.getByTestId('break-status')).toHaveText('studying paused: 17 minutes left.');
  await timer.getByRole('button', { name: 'resume' }).click();
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 17 minutes left.');
  await wakeAfter(page, 16 * 60_000 + 29_999);
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 1 minute left.');
  await wakeAfter(page, 1);
  await expect(timer.getByTestId('break-status')).toHaveText('time for a short break.');
});

test('timer works with session storage blocked and explains what is not saved', async ({ page }) => {
  await withSleepingClock(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => { throw new DOMException('blocked', 'SecurityError'); },
    });
  });
  await page.goto('/breaks');
  const timer = page.getByTestId('break-timer');
  await expect(timer.getByTestId('break-storage-warning')).toContainText("progress won't be saved");
  await expect(timer.getByTestId('break-storage-warning')).toContainText('timer still works for this visit');
  await timer.getByRole('button', { name: 'turn on' }).click();
  await wakeAfter(page, 10 * 60_000);
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 15 minutes left.');
  await timer.getByRole('button', { name: 'pause' }).click();
  await wakeAfter(page, 15 * 60_000);
  await expect(timer.getByTestId('break-status')).toHaveText('studying paused: 15 minutes left.');
});

test('a stale break cannot pause the new focus period when a phone wakes on tap', async ({ page }) => {
  await withSleepingClock(page);
  await page.goto('/breaks');
  const timer = page.getByTestId('break-timer');
  await timer.getByRole('button', { name: 'turn on' }).click();
  await wakeAfter(page, 25 * 60_000);
  await expect(timer.getByTestId('break-status')).toHaveText('time for a short break.');
  await timer.getByRole('button', { name: 'start break' }).click();
  await expect(timer.getByTestId('break-status')).toHaveText('on a break: 5 minutes left.');
  await advanceWithoutWake(page, 5 * 60_000);
  // The stale view still offers pause. It must reconcile the elapsed break first.
  await timer.getByRole('button', { name: 'pause' }).click();
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 25 minutes left.');
  await expect(timer.getByRole('button', { name: 'resume' })).toHaveCount(0);
});

test('a readable but unwritable session store does not stop the timer', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage && key === 'cueory-break-timer') {
        throw new DOMException('blocked', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.goto('/breaks');
  const timer = page.getByTestId('break-timer');
  await timer.getByRole('button', { name: 'turn on' }).click();
  await expect(timer.getByTestId('break-storage-warning')).toContainText("progress won't be saved");
  await timer.getByRole('button', { name: 'pause' }).click();
  await expect(timer.getByTestId('break-status')).toContainText('studying paused:');
});

test('minute boundary updates promptly after a pause at partial minutes', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
  await page.goto('/breaks');
  const timer = page.getByTestId('break-timer');
  await timer.getByRole('button', { name: 'turn on' }).click();
  await page.clock.fastForward(30_000);
  await timer.getByRole('button', { name: 'pause' }).click();
  await timer.getByRole('button', { name: 'resume' }).click();
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 25 minutes left.');
  await page.clock.fastForward(30_001);
  await expect(timer.getByTestId('break-status')).toHaveText('studying: 24 minutes left.');
});

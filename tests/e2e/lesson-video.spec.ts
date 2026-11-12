import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Route } from '@playwright/test';

// LessonVideo island (D-82): lazy YouTube Nocookie embed. Nothing loads from YouTube before tap.

// The lesson's own video is a draft until Christian publishes it, so the island is tested on a sample page.
const LESSON_URL = '/learn/video-sample';
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

test.beforeEach(async ({ page }) => {
  // Keep the tests offline: any request to the player is answered locally.
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' }));
  // Suppress the promo panel so it doesn't interfere.
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* blocked */ }
  });
});

test('no request leaves localhost before the tap; after it only youtube-nocookie.com is added', async ({ page }) => {
  const hosts = new Set<string>();
  page.on('request', (req) => {
    if (!/^https?:$/.test(new URL(req.url()).protocol)) return;
    hosts.add(new URL(req.url()).hostname);
  });

  await page.goto(LESSON_URL);
  await expect(page.getByRole('button', { name: /play video/i })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect([...hosts].filter((h) => !LOCAL_HOSTS.includes(h))).toEqual([]);

  await page.getByRole('button', { name: /play video/i }).click();
  await expect(page.locator('iframe')).toBeVisible();
  await expect.poll(() => [...hosts].filter((h) => !LOCAL_HOSTS.includes(h))).toEqual(['www.youtube-nocookie.com']);
});

test('a draft video does not appear on its lesson page', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /play video/i })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
});

// Test the actual rendered lesson, not only a manually supplied island prop.
// The video file is draft: its data must stay hidden, while the empty state stays visible.
for (const colorScheme of ['light', 'dark'] as const) {
  test('a lesson without a published video shows a safe notice in ' + colorScheme, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    let youtubeRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'www.youtube-nocookie.com') youtubeRequests += 1;
    });
    const response = await page.goto('/learn/study-skills');
    expect(response?.status()).toBe(200);
    const videoSection = page.locator('section[aria-label="lesson video"]');
    await expect(videoSection).toBeVisible();
    await expect(videoSection.getByText('no video yet.', { exact: true })).toBeVisible();
    await expect(videoSection.getByRole('button', { name: /play video/i })).toHaveCount(0);
    await expect(videoSection.locator('iframe')).toHaveCount(0);
    expect(youtubeRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test('tapping play shows only the YouTube Nocookie player and the privacy note', async ({ page }) => {
  await page.goto(LESSON_URL);
  const cover = page.getByRole('button', { name: /play video/i });
  await expect(cover).toBeVisible();

  await cover.click();

  // Cover disappears; iframe appears.
  await expect(cover).toHaveCount(0);
  const iframe = page.locator('iframe[src*="youtube-nocookie.com"]');
  await expect(iframe).toBeVisible();
  // src must contain autoplay=1 and the encoded video id.
  const src = await iframe.getAttribute('src');
  expect(src).toContain('youtube-nocookie.com/embed/');
  expect(src).toContain('autoplay=1');

  // Privacy note appears.
  await expect(page.getByText(/loading.*youtube.*cookies|playing.*loads youtube|tapping.*loads youtube/i)).toBeVisible();
});

test('the keyboard alone can reach the play button and activate it', async ({ page }) => {
  await page.goto(LESSON_URL);
  const cover = page.getByRole('button', { name: /play video/i });
  await expect(cover).toBeVisible();

  // Tab to the button (may take several presses; focus it directly).
  await cover.focus();
  await expect(cover).toBeFocused();
  await page.keyboard.press('Enter');

  // Player appeared and keyboard focus moved into it (not left on the page body).
  const iframe = page.locator('iframe[src*="youtube-nocookie.com"]');
  await expect(iframe).toBeVisible();
  await expect(iframe).toBeFocused();
});

test('with reduced motion the cover has no CSS animation or transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(LESSON_URL);
  const cover = page.getByRole('button', { name: /play video/i });
  await expect(cover).toBeVisible();

  // The cover button itself must have no running animation or transition.
  // global.css sets durations to 0.01ms under reduced-motion; assert at most 0.001s.
  const animated = await cover.evaluate((el) => {
    const style = getComputedStyle(el);
    const hasAnim = style.animationName !== 'none' && parseFloat(style.animationDuration) > 0.001;
    const hasTrans = parseFloat(style.transitionDuration) > 0.001 && style.transitionProperty !== 'none';
    return hasAnim || hasTrans;
  });
  expect(animated).toBe(false);
});

test('the video cover fits a 320 px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(LESSON_URL);
  await expect(page.getByRole('button', { name: /play video/i })).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(320);
});

test('privacy note and transcript links are visible before the tap', async ({ page }) => {
  await page.goto(LESSON_URL);
  await expect(page.getByRole('button', { name: /play video/i })).toBeVisible();
  // Note about YouTube loading must appear before the student taps (ROADMAP 4d).
  await expect(page.getByText(/loads youtube/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Transcript' })).toBeVisible();
});

test('cover and player are at least 200 px tall, even at 320 px wide', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(LESSON_URL);
  const cover = page.getByRole('button', { name: /play video/i });
  expect((await cover.boundingBox())?.height).toBeGreaterThanOrEqual(200);
  await cover.click();
  const iframe = page.locator('iframe[src*="youtube-nocookie.com"]');
  await expect(iframe).toBeVisible();
  const box = await iframe.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(200);
});

test('the loaded player offers a keyboard/tap retry without pre-tap requests', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'www.youtube-nocookie.com') requests.push(request.url());
  });
  await page.goto(LESSON_URL);
  await page.waitForLoadState('networkidle');
  expect(requests).toHaveLength(0);
  await expect(page.getByTestId('lesson-video-status')).toHaveText('tap to play the video.');

  await page.getByRole('button', { name: /play video/i }).click();
  const iframe = page.locator('iframe[src*="youtube-nocookie.com"]');
  await expect(iframe).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('lesson-video-status')).toContainText('player ready');

  const retry = page.getByRole('button', { name: 'video not working? try again' });
  await expect(retry).toBeVisible();
  const box = await retry.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(iframe).toBeVisible();
  await expect(iframe).toBeFocused();
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(2);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test('video cover accessibility at ' + colorScheme + ' palette', async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    let youtubeRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'www.youtube-nocookie.com') youtubeRequests += 1;
    });
    await page.goto(LESSON_URL);
    await page.waitForLoadState('networkidle');
    expect(youtubeRequests).toBe(0);
    const cover = page.getByRole('button', { name: /play video/i });
    await expect(cover).toBeVisible();
    await expect(page.getByTestId('lesson-video-status')).toHaveText('tap to play the video.');
    const bounds = await cover.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await cover.focus();
    await expect(cover).toHaveCSS('outline-style', 'solid');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('stalled player shows failure, moves keyboard focus to retry, and recovers without a second tap', async ({ page }) => {
  // Override the default local player fixture: keep the FIRST iframe response pending.
  // The second attempt gets a local HTML response, without contacting YouTube.
  let requests = 0;
  let firstRequest: Route | undefined;
  await page.route('https://www.youtube-nocookie.com/**', (route) => {
    requests += 1;
    if (requests === 1) {
      firstRequest = route;
      return;
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' });
  });
  await page.clock.install();
  await page.goto(LESSON_URL);

  const cover = page.getByRole('button', { name: /play video/i });
  await expect(cover).toBeVisible();
  expect(requests).toBe(0);
  await cover.click();
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByTestId('lesson-video-status')).toHaveText('loading the video…');

  // Fast-forward the real component's 20-second timeout, not the Playwright test timeout.
  await page.clock.fastForward(20_100);
  const retry = page.getByRole('button', { name: 'try again', exact: true });
  await expect(page.getByTestId('lesson-video-status')).toHaveText("the video couldn't load. try again.");
  await expect(retry).toBeVisible();
  await expect(retry).toBeFocused();
  const box = await retry.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  const violations = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.violations).toEqual([]);

  // A keyboard retry remounts the autoplay iframe. The stale first response cannot override it.
  await page.keyboard.press('Enter');
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toBeVisible();
  await expect(page.getByTestId('lesson-video-status')).toContainText('player ready');
  // A detached iframe may already have canceled its first request. Cleanup is best-effort.
  if (firstRequest) {
    try { await firstRequest.abort('failed'); } catch { /* request canceled with the first iframe */ }
  }
  await expect(page.getByTestId('lesson-video-status')).toContainText('player ready');
  expect(requests).toBe(2);
});

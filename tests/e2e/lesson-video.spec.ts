import { expect, test } from '@playwright/test';

// LessonVideo island (D-82): lazy YouTube Nocookie embed. Nothing loads from YouTube before tap.

// The lesson's own video is an empty placeholder, so the island is tested on a sample page.
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

test('the placeholder video does not appear on its lesson page', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /play video/i })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
});

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

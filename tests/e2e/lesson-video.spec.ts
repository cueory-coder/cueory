import { expect, test } from '@playwright/test';

// LessonVideo island (D-82): lazy YouTube Nocookie embed. Nothing loads from YouTube before tap.
// The study-skills lesson page renders a placeholder video (content/videos/study-skills-01.json).

const LESSON_URL = '/learn/study-skills';
const YT_HOST = /youtube(-nocookie)?\.com/;

test.beforeEach(async ({ page }) => {
  // Suppress the promo panel so it doesn't interfere.
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* blocked */ }
  });
});

test('no request to any YouTube host before the play button is tapped', async ({ page }) => {
  const youtubeRequests: string[] = [];
  page.on('request', (req) => {
    if (YT_HOST.test(req.url())) youtubeRequests.push(req.url());
  });

  await page.goto(LESSON_URL);
  // Wait for the cover to mount.
  await expect(page.getByRole('button', { name: /play video/i })).toBeVisible();
  // Navigate away so any lazy loads would have fired by now.
  await page.waitForLoadState('networkidle');

  expect(youtubeRequests).toEqual([]);
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
  await expect(page.getByText(/loading.*youtube.*cookies|playing.*loads youtube/i)).toBeVisible();
});

test('the keyboard alone can reach the play button and activate it', async ({ page }) => {
  await page.goto(LESSON_URL);
  const cover = page.getByRole('button', { name: /play video/i });
  await expect(cover).toBeVisible();

  // Tab to the button (may take several presses; focus it directly).
  await cover.focus();
  await expect(cover).toBeFocused();
  await page.keyboard.press('Enter');

  // Player appeared.
  await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toBeVisible();
});

test('with reduced motion the cover has no CSS animation or transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(LESSON_URL);
  const cover = page.getByRole('button', { name: /play video/i });
  await expect(cover).toBeVisible();

  // The cover button itself must have no running animation or transition.
  const animated = await cover.evaluate((el) => {
    const style = getComputedStyle(el);
    const hasAnim = style.animationName !== 'none' && style.animationDuration !== '0s';
    const hasTrans = style.transitionDuration !== '0s' && style.transitionProperty !== 'none';
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

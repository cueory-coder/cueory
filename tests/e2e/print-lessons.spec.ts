import { expect, test } from '@playwright/test';

const lessonRoutes = [
  '/learn/study-skills',
  '/learn/study-skills/cards',
  '/learn/study-skills/fill-in',
  '/learn/study-skills/label-it',
  '/learn/study-skills/learn-mode',
  '/learn/study-skills/matching',
  '/learn/study-skills/organizer',
  '/learn/study-skills/questions',
];

test.describe('Task 216: printed lesson pages', () => {
  for (const route of lessonRoutes) {
    test(`${route} prints reading content without site navigation`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);

      if (route === '/learn/study-skills') {
        await expect(page.getByTestId('print-lesson-reader')).toBeHidden();
      }

      await page.emulateMedia({ media: 'print' });

      await expect(page.locator('main')).toBeVisible();
      for (const selector of [
        'body > header',
        'body > footer',
        'body > [data-testid="building-notice"]',
        'body > dialog',
        'body > a[href="#main"]',
      ]) {
        await expect(page.locator(selector)).toBeHidden();
      }
      await expect(page.locator('main')).toHaveCSS('max-width', 'none');

      if (route === '/learn/study-skills') {
        const printReader = page.getByTestId('print-lesson-reader');
        await expect(printReader).toBeVisible();
        await expect(printReader.locator('li')).toHaveCount(3);
        await expect(printReader).toContainText('Placeholder sentence 1');
        await expect(printReader).toContainText('Placeholder sentence 2');
        await expect(printReader).toContainText('Placeholder sentence 3');
      }
    });
  }

  test('/learn/study-skills prints a single full-text lesson when JavaScript is disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto('/learn/study-skills');
    expect(response?.status()).toBe(200);

    // On screen with JS disabled, noscript is visible and print reader is hidden
    await expect(page.getByTestId('print-lesson-reader')).toBeHidden();
    await expect(page.locator('noscript ol')).toBeVisible();

    // Emulate print media
    await page.emulateMedia({ media: 'print' });

    // Print reader is visible with all 3 sentences
    const printReader = page.getByTestId('print-lesson-reader');
    await expect(printReader).toBeVisible();
    await expect(printReader.locator('li')).toHaveCount(3);
    await expect(printReader).toContainText('Placeholder sentence 1');
    await expect(printReader).toContainText('Placeholder sentence 2');
    await expect(printReader).toContainText('Placeholder sentence 3');

    // noscript fallback is hidden in print so sentences are not duplicated
    await expect(page.locator('noscript ol')).toBeHidden();
    await expect(page.locator('main [data-testid="study-reader"] [data-print-only] li:visible')).toHaveCount(3);

    await context.close();
  });
});

test.describe('Task 709: lesson-only printing', () => {
  test('keeps the reading in black on white and hides choices, video and controls', async ({ page }) => {
    const response = await page.goto('/learn/study-skills');
    expect(response?.status()).toBe(200);

    const modes = page.getByTestId('mode-grid');
    const reader = page.getByTestId('print-lesson-reader');
    await expect(modes).toBeVisible();
    await expect(reader).toBeHidden();

    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    await expect(modes).toBeHidden();
    await expect(page.locator('main section[aria-labelledby="study-modes-heading"]')).toBeHidden();
    await expect(reader).toBeVisible();
    await expect(reader.locator('li')).toHaveCount(3);
    await expect(page.getByTestId('study-reader').getByRole('heading', { name: 'read the lesson' })).toBeVisible();
    expect(await page.locator('main button:visible').count()).toBe(0);

    const colors = await page.evaluate(() => ({
      paper: getComputedStyle(document.body).backgroundColor,
      reader: getComputedStyle(document.querySelector<HTMLElement>('[data-testid="study-reader"]')!).backgroundColor,
      ink: getComputedStyle(document.querySelector<HTMLElement>('main h1')!).color,
    }));
    expect(colors).toEqual({ paper: 'rgb(255, 255, 255)', reader: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)' });

    await page.emulateMedia({ media: 'screen' });
    await expect(modes).toBeVisible();
    await expect(reader).toBeHidden();
  });

  test('preserves sample visual credits, avoids breaks and prints outside URLs', async ({ page }) => {
    await page.goto('/learn/study-skills');
    // All real visuals are drafts on this route. Use labeled sample DOM to exercise the actual lesson stylesheet
    // without publishing an unreviewed image or medical content.
    await page.getByTestId('study-reader').evaluate((reader) => {
      const figure = document.createElement('figure');
      figure.dataset.visual = 'sample';
      figure.dataset.printFixtureFigure = '';
      const imageFrame = document.createElement('div');
      imageFrame.dataset.step = 'sample';
      imageFrame.className = 'overflow-hidden';
      const image = document.createElement('img');
      image.dataset.printFixtureImage = '';
      image.src = '/brand/v1/icon-32.png';
      image.alt = '[sample visual]';
      image.width = 2000;
      image.height = 200;
      imageFrame.append(image);
      const caption = document.createElement('figcaption');
      caption.textContent = '[sample picture credit]';
      figure.append(imageFrame, caption);

      const callout = document.createElement('aside');
      callout.dataset.calloutKind = 'note';
      callout.textContent = '[sample callout]';

      const credits = document.createElement('p');
      credits.dataset.visualCredits = '';
      credits.textContent = '[sample visual source] ';
      const outside = document.createElement('a');
      outside.href = 'https://example.org/sample-license';
      outside.textContent = '[sample outside license]';
      const local = document.createElement('a');
      local.href = '/disclaimer';
      local.textContent = '[sample local reference]';
      credits.append(outside, local);

      const video = document.createElement('section');
      video.setAttribute('aria-label', 'lesson video');
      video.dataset.printFixtureVideo = '';
      const play = document.createElement('button');
      play.textContent = '[sample play button]';
      video.append(play);
      const control = document.createElement('button');
      control.dataset.printFixtureControl = '';
      control.textContent = '[sample reader control]';
      reader.append(figure, callout, credits, video, control);
    });

    await page.emulateMedia({ media: 'print' });
    const figure = page.locator('[data-print-fixture-figure]');
    await expect(figure).toBeVisible();
    await expect(figure.locator('figcaption')).toBeVisible();
    await expect(page.locator('[data-visual-credits]')).toBeVisible();
    await expect(page.locator('[data-callout-kind="note"]')).toBeVisible();
    await expect(figure).toHaveCSS('break-inside', 'avoid');
    await expect(page.locator('[data-callout-kind="note"]')).toHaveCSS('break-inside', 'avoid');
    await expect(figure.locator('[data-step]')).toHaveCSS('overflow', 'visible');
    await expect(page.locator('[data-print-fixture-video]')).toBeHidden();
    await expect(page.locator('[data-print-fixture-control]')).toBeHidden();

    const widths = await figure.evaluate((element) => ({
      figure: element.getBoundingClientRect().width,
      image: element.querySelector('img')!.getBoundingClientRect().width,
    }));
    expect(widths.image).toBeLessThanOrEqual(widths.figure + 1);

    const externalUrl = await page.locator('[data-visual-credits] a[href^="https://"]').evaluate((link) =>
      getComputedStyle(link, '::after').content);
    expect(externalUrl).toContain('https://example.org/sample-license');
    const localUrl = await page.locator('[data-visual-credits] a[href="/disclaimer"]').evaluate((link) =>
      getComputedStyle(link, '::after').content);
    expect(localUrl).not.toContain('/disclaimer');
  });
});

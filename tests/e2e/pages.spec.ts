import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { socials } from '../../src/config/site';

// The once-only promo panel (D-59) slides down after 5 seconds and takes keyboard focus, which would interrupt these
// tests part-way, so every page here starts as if it had already been shown. tests/e2e/promo.spec.ts tests the panel.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

/** The name of the card in the middle of the "ways to study" merry-go-round (D-60). */
const middleCard = (page: Page) =>
  page.locator('#ways-to-study [data-mode-card][data-offset="0"]').getAttribute('data-name');

const pages = [
  '/',
  '/learn/study-skills',
  '/learn/study-skills/cards',
  '/learn/study-skills/learn-mode',
  '/learn/study-skills/matching',
  '/learn/study-skills/organizer',
  '/learn/study-skills/fill-in',
  '/learn/study-skills/label-it',
  '/learn/study-skills/questions',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/support',
  '/subscribed',
  '/play',
  '/start',
  '/progress',
  '/learn/video-sample',
];

for (const path of pages) {
  test(`${path} loads, shows the notice, and passes accessibility checks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId('building-notice')).toHaveText("we're still building. more coming soon.");
    await expect(page.locator('h1')).toHaveCount(1);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    // Nothing scrolls sideways, on any screen size (D-48).
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('lesson can be stepped through with the keyboard', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await expect(page.getByText('Sentence 1 of')).toBeVisible();

  const nextButton = page.getByRole('button', { name: 'Next sentence' });
  await nextButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Sentence 2 of')).toBeVisible();

  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByText("That's the whole lesson for now.")).toBeVisible();
});

test('cards can be sorted with the keyboard, and "Still learning" cards come back next round', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await page.getByRole('link', { name: 'Practice this lesson with cards' }).click();
  await expect(page).toHaveURL(/\/learn\/study-skills\/cards$/);
  await expect(page.getByText('Card 1 of 3 · Know it: 0 · Still learning: 0')).toBeVisible();
  await expect(page.getByText('Question', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Show answer' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Answer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Still learning' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Card 2 of 3 · Know it: 0 · Still learning: 1')).toBeVisible();

  // Back undoes the last sort.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Card 1 of 3 · Know it: 0 · Still learning: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Still learning' }).click();

  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Know it' }).click();
  }
  await expect(page.getByText('Round 1 done.')).toBeVisible();
  await expect(page.getByText('Know it: 2 · Still learning: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Study the 1 still learning' }).click();
  await expect(page.getByText('Round 2 · Card 1 of 1 · Know it: 0 · Still learning: 0')).toBeVisible();
  await expect(page.getByText('Placeholder card 1, front.')).toBeVisible();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await expect(page.getByText("That's every card for now.")).toBeVisible();

  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByText('Card 1 of 3 · Know it: 0 · Still learning: 0')).toBeVisible();
});

test('starred cards are remembered in this browser and can be studied on their own', async ({ page }) => {
  await page.goto('/learn/study-skills/cards');
  const star = page.getByRole('button', { name: 'Star', exact: true });
  const onlyStarred = page.getByRole('checkbox', { name: /Only starred cards/ });
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await expect(onlyStarred).toBeDisabled();

  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await star.focus();
  await page.keyboard.press('Space'); // star card 2
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: 'Only starred cards (1)' })).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-progress') ?? '{}'));
  expect(saved.decks['study-skills-01'].starred).toEqual(['ss01-c02']);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.reload();
  await onlyStarred.check();
  await expect(page.getByText('Card 1 of 1 · Know it: 0 · Still learning: 0')).toBeVisible();
  await expect(page.getByText('Placeholder card 2, front.')).toBeVisible();
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  // Removing the last star turns "Only starred cards" off; the next start uses every card again.
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('checkbox', { name: 'Only starred cards (0)' })).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('cueory-stars-study-skills-01'))).toBeNull();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByText('Card 1 of 3 · Know it: 0 · Still learning: 0')).toBeVisible();
});

test('shuffle keeps every card in the round exactly once', async ({ page }) => {
  await page.goto('/learn/study-skills/cards');
  await page.getByRole('checkbox', { name: 'Shuffle' }).check();
  const fronts: string[] = [];
  for (let i = 0; i < 3; i++) {
    fronts.push((await page.getByTestId('card-text').textContent()) ?? '');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Know it' }).click();
  }
  expect([...fronts].sort()).toEqual([
    'Placeholder card 1, front.',
    'Placeholder card 2, front.',
    'Placeholder card 3, front.',
  ]);
  await expect(page.getByText("That's every card for now.")).toBeVisible();
});

test('Learn mode brings back what you miss until you know every card', async ({ page }) => {
  const deck: Record<string, { back: string; blank?: string }> = {
    'Placeholder card 1, front.': { back: "Placeholder card 1, back. Christian's reviewed card text replaces this." },
    'Placeholder card 2, front.': { back: 'Placeholder card 2, back.', blank: 'card 2' },
    'Placeholder card 3, front.': { back: 'Placeholder card 3, back.' },
  };
  await page.goto('/learn/study-skills');
  await page.getByRole('link', { name: "Learn this lesson's cards in Learn mode" }).click();
  await expect(page).toHaveURL(/\/learn\/study-skills\/learn-mode$/);
  await expect(page.getByText('Mastered 0 of 3')).toBeVisible();

  const steps: string[] = [];
  let missedOnce = false;
  let typoOnce = false;
  for (let turn = 0; turn < 20; turn++) {
    if (await page.getByText('You know all 3 cards.').isVisible()) break;
    const step = (await page.getByTestId('learn-step').textContent())!;
    const card = deck[(await page.getByTestId('learn-prompt').textContent())!]!;
    steps.push(step);

    if (step === 'New card') {
      // By keyboard: the answer, then the next card.
      await page.getByRole('button', { name: 'Show answer' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(card.back)).toBeVisible();
      await page.getByRole('button', { name: 'Next card' }).focus();
      await page.keyboard.press('Enter');
    } else if (step === 'Choose the answer') {
      const answers = await page.getByRole('list', { name: 'Answers' }).getByRole('button').allTextContents();
      expect(answers).toContain(card.back);
      const pick = missedOnce ? card.back : answers.find((a) => a !== card.back)!;
      await page.getByRole('button', { name: pick, exact: true }).click();
      await expect(page.getByText(missedOnce ? 'Correct.' : 'Not quite.')).toBeVisible();
      if (!missedOnce) await expect(page.getByText('Correct answer', { exact: true })).toBeVisible();
      missedOnce = true;
      await page.getByRole('button', { name: 'Continue' }).click();
    } else if (step === 'Fill in the blank') {
      await expect(page.getByText('Placeholder ______blank, back.')).toBeVisible();
      await page.getByLabel('The missing words').fill(card.blank!);
      await page.keyboard.press('Enter');
      await expect(page.getByText('Correct.')).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
    } else {
      expect(step).toBe('Type the answer');
      // The first typed answer has a typo, and the student counts it as right.
      await page.getByLabel('Your answer').fill(typoOnce ? card.back.toUpperCase() : `${card.back}x`);
      await page.keyboard.press('Enter');
      if (typoOnce) await expect(page.getByText('Correct.')).toBeVisible();
      else {
        await expect(page.getByText('Not quite.')).toBeVisible();
        await page.getByRole('button', { name: 'I was right' }).click();
        await expect(page.getByText('Counted as right.')).toBeVisible();
      }
      typoOnce = true;
      await page.getByRole('button', { name: 'Continue' }).click();
    }
  }

  await expect(page.getByText('You know all 3 cards.')).toBeVisible();
  expect(steps.filter((s) => s === 'New card')).toHaveLength(3);
  expect(steps.filter((s) => s === 'Choose the answer')).toHaveLength(4);
  expect(steps).toContain('Fill in the blank');
  expect(steps.filter((s) => s === 'Type the answer')).toHaveLength(2);

  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByText('Mastered 0 of 3')).toBeVisible();
});

test('Matching pairs terms with meanings by keyboard, counting misses', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await page.getByRole('link', { name: "Match this lesson's terms and meanings" }).click();
  await expect(page).toHaveURL(/\/learn\/study-skills\/matching$/);
  await expect(page.getByText('Matched 0 of 3 · Misses: 0')).toBeVisible();

  const terms = page.getByRole('region', { name: 'Terms' });
  const meanings = page.getByRole('region', { name: 'Meanings' });

  // A wrong pair, by keyboard.
  await terms.getByRole('button', { name: 'Placeholder card 1, front.' }).focus();
  await page.keyboard.press('Enter');
  await expect(terms.getByRole('button', { name: /Placeholder card 1, front\./ })).toHaveAttribute('aria-pressed', 'true');
  await meanings.getByRole('button', { name: 'Placeholder card 2, back.' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Not a match. Try again.')).toBeVisible();
  await expect(page.getByText('Matched 0 of 3 · Misses: 1')).toBeVisible();

  // A right pair by keyboard: the button just used keeps focus once it is matched.
  await terms.getByRole('button', { name: 'Placeholder card 1, front.' }).focus();
  await page.keyboard.press('Enter');
  const meaningOne = meanings.getByRole('button', { name: /^Placeholder card 1, back\./ });
  await meaningOne.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Matched: Placeholder card 1, front.')).toBeVisible();
  await expect(meaningOne).toBeFocused();
  await expect(meaningOne).toHaveAttribute('aria-disabled', 'true');
  // Pressing a matched item again changes nothing.
  await page.keyboard.press('Enter');
  await expect(page.getByText('Matched 1 of 3 · Misses: 1')).toBeVisible();

  // Right pairs by tap, starting from either side.
  await meanings.getByRole('button', { name: 'Placeholder card 2, back.' }).click();
  await terms.getByRole('button', { name: 'Placeholder card 2, front.' }).click();
  await terms.getByRole('button', { name: 'Placeholder card 3, front.' }).click();
  await meanings.getByRole('button', { name: 'Placeholder card 3, back.' }).click();

  await expect(page.getByText('All 3 matched.')).toBeVisible();
  await expect(page.getByText('Matched 3 of 3 · Misses: 1')).toBeVisible();
  const finished = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(finished.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await expect(terms.getByRole('button', { name: /Matched$/ })).toHaveCount(3);
  await expect(terms.getByRole('button', { disabled: true })).toHaveCount(3);

  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByText('Matched 0 of 3 · Misses: 0')).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the lesson shows every sentence once and no stepper controls', async ({ page }) => {
    await page.goto('/learn/study-skills');
    await expect(page.getByText('Sentence 1 of')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next sentence' })).toHaveCount(0);
    const items = page.locator('ol > li');
    const texts = await items.allTextContents();
    expect(texts.length).toBeGreaterThan(1);
    expect(new Set(texts).size).toBe(texts.length);
  });

  test('the cards page lists every card with its answer and no controls', async ({ page }) => {
    await page.goto('/learn/study-skills/cards');
    await expect(page.getByRole('button')).toHaveCount(0);
    expect(await page.locator('dl dt').count()).toBe(3);
    expect(await page.locator('dl dd').count()).toBe(3);
  });

  test('Learn mode says it needs JavaScript and points to the cards', async ({ page }) => {
    await page.goto('/learn/study-skills/learn-mode');
    await expect(page.getByRole('button')).toHaveCount(0);
    // Playwright's text matching skips <noscript>, so these use CSS.
    await expect(page.locator('noscript p')).toHaveText(
      'Learn mode needs JavaScript. You can read every card and its answer on the cards page.',
    );
    await page.locator('noscript a[href="/learn/study-skills/cards"]').click();
    await expect(page).toHaveURL(/\/learn\/study-skills\/cards$/);
  });

  test('Matching says it needs JavaScript and points to the cards', async ({ page }) => {
    await page.goto('/learn/study-skills/matching');
    await expect(page.getByRole('button')).toHaveCount(0);
    // Playwright's text matching skips <noscript>, so these use CSS.
    await expect(page.locator('noscript p')).toHaveText(
      'Matching needs JavaScript. You can read every card and its answer on the cards page.',
    );
    await page.locator('noscript a[href="/learn/study-skills/cards"]').click();
    await expect(page).toHaveURL(/\/learn\/study-skills\/cards$/);
  });

  test('home page sections are there at once, with nothing waiting to fade in', async ({ page }) => {
    await page.goto('/');
    for (const section of await page.locator('[data-reveal-section]').all()) {
      expect(await section.evaluate((el) => [el.getAttribute('data-reveal'), getComputedStyle(el).opacity])).toEqual([
        null,
        '1',
      ]);
    }
  });

  test('"ways to study" is a row of all eleven cards that scrolls sideways, and the buttons keep their space', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('[data-mode-card]')).toHaveCount(11);
    const row = page.getByRole('group', { name: 'study mode cards' });
    await row.scrollIntoViewIfNeeded();
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await row.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: 'instant' }));
    await expect(page.locator('#mode-level-test')).toBeInViewport();
    await expect(page.locator('#ways-to-study').getByRole('button', { name: 'next study mode' })).toBeHidden();
  });
});

test('keyboard focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline).not.toBe('none');
});

test('home page has a launch-updates signup that works by keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Get launch updates' })).toBeVisible();
  const form = page.getByTestId('signup-form');
  if ((await form.count()) === 0) {
    await expect(page.getByTestId('signup-pending')).toBeVisible();
    return;
  }
  const email = page.getByLabel('Email address');
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('required', '');
  await email.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeFocused();
});

test.describe('theme switch', () => {
  const pageBackground = (page: import('@playwright/test').Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const charcoal = 'rgb(28, 25, 23)'; // #1C1917, brand v1.0 (D-55)
  const ivory = 'rgb(249, 245, 239)';

  test('Light, Dark and Follow device change the palette and are remembered', async ({ page }, testInfo) => {
    const deviceIsDark = testInfo.project.use.colorScheme === 'dark';
    await page.goto('/');
    const picker = page.getByRole('group', { name: 'Theme' });
    await expect(picker.getByRole('radio', { name: 'Follow device' })).toBeChecked();
    expect(await pageBackground(page)).toBe(deviceIsDark ? charcoal : ivory);

    await picker.getByRole('radio', { name: 'Dark' }).check();
    expect(await pageBackground(page)).toBe(charcoal);

    // The pick carries over to other pages and survives a reload.
    await page.goto('/privacy');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await pageBackground(page)).toBe(charcoal);

    await page.getByRole('radio', { name: 'Light' }).check();
    expect(await pageBackground(page)).toBe(ivory);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await page.getByRole('radio', { name: 'Follow device' }).check();
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    expect(await pageBackground(page)).toBe(deviceIsDark ? charcoal : ivory);
  });

  test('can be used with the keyboard', async ({ page }) => {
    await page.goto('/');
    const followDevice = page.getByRole('radio', { name: 'Follow device' });
    await followDevice.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('marketing look (D-41)', () => {
  test('the home hero fills the first screen: logo, a one-line serif headline, the accent line, one button', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const height = page.viewportSize()!.height;
    const headline = page.getByRole('heading', { level: 1 });
    await expect(headline).toHaveText('nursing school is hard enough.');
    await expect(page.getByText('cueory makes studying simpler.')).toBeVisible();
    await expect(page.getByText('Short, clear lessons')).toHaveCount(0);
    const button = page.getByRole('link', { name: 'create your free account', exact: true });
    await expect(button).toHaveAttribute('href', '/#signup');
    await expect(page.getByText('save your progress and pick up where you left off.')).toBeVisible();
    // A calmer hero (D-55): no course link, no motto line and no embossed logo behind the headline.
    const hero = page.locator('.scene-hero');
    await expect(hero.getByRole('link')).toHaveCount(1);
    await expect(hero.getByText('by nursing students, for nursing students.')).toHaveCount(0);
    await expect(hero.locator('.logo')).toHaveCount(1);
    for (const element of [headline, button]) {
      const box = (await element.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    // One straight line at every width (D-46): one line tall, nothing cut off, inside the screen.
    const fit = await headline.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        lines: box.height / parseFloat(style.lineHeight),
        clipped: el.scrollWidth > el.clientWidth + 1,
        inside: box.left >= 0 && box.right <= window.innerWidth,
      };
    });
    expect(fit.lines).toBeLessThan(1.5);
    expect(fit.clipped).toBe(false);
    expect(fit.inside).toBe(true);
    expect(await headline.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Bodoni Moda/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the logo is the brand v1.0 artwork in the palette\'s color, and the motto is in the footer (D-55)', async ({
    page,
  }) => {
    const shown = (scope: import('@playwright/test').Locator) =>
      scope.locator('.logo img').evaluateAll((imgs) =>
        imgs
          .filter((img) => img.getClientRects().length > 0)
          .map((img) => ({ src: (img as HTMLImageElement).currentSrc, alt: img.getAttribute('alt') })),
      );
    await page.goto('/');
    const hero = page.locator('.scene-hero');
    await page.getByRole('radio', { name: 'Light' }).check();
    let images = await shown(hero);
    expect(images).toHaveLength(1);
    expect(images[0]!.src).toMatch(/\/brand\/v1\/logo-full-light-\d+\.png$/);
    expect(images[0]!.alt).toBe('');
    expect(await hero.locator('.logo img').first().evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const width = (await hero.locator('.logo').boundingBox())!.width;
    expect(width).toBeGreaterThanOrEqual(239);

    await page.getByRole('radio', { name: 'Dark' }).check();
    images = await shown(hero);
    expect(images).toHaveLength(1);
    expect(images[0]!.src).toMatch(/\/brand\/v1\/logo-full-dark-\d+\.png$/);

    await expect(page.locator('footer').getByText('by nursing students, for nursing students.')).toBeVisible();
    await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute('href', '/brand/v1/icon-32.png');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/brand/v1/icon-180.png');

    // Other pages: the logo in the header, named by its link. The full logo where it fits (640px and wider), the
    // emblem on phones, and the header never wider than the screen.
    await page.goto('/support');
    const home = page.getByRole('link', { name: 'cueory home' });
    await expect(home).toBeVisible();
    const header = await shown(home);
    expect(header).toHaveLength(1);
    const wide = page.viewportSize()!.width >= 640;
    expect(header[0]!.src).toMatch(wide ? /\/brand\/v1\/logo-full-dark-\d+\.png$/ : /\/brand\/v1\/emblem-dark-\d+\.png$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const account = (await page.getByRole('button', { name: /account/i }).first().boundingBox())!;
    expect(account.x + account.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test('the glassy button is see-through glass with a blur, and its text stays readable', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('link', { name: 'create your free account', exact: true });
    const look = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, blur: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter') };
    });
    expect(look.background).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
    expect(look.blur).toContain('blur(');
    const results = await new AxeBuilder({ page }).include('#hero-heading ~ *').withRules(['color-contrast']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('the serif comes from our own site and is ready once the page has loaded', async ({ page }) => {
    const fonts: string[] = [];
    page.on('request', (r) => r.resourceType() === 'font' && fonts.push(r.url()));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('500 44px "Bodoni Moda"'))).toBe(true);
    expect(fonts.length).toBeGreaterThan(0);
    for (const url of fonts) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
  });

  test('nothing on the home page jumps while it loads', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 300);
        }),
    );
    expect(shift).toBeLessThan(0.02);
  });

  test('sections below the first screen fade in with a small rise the first time they come into view (D-62)', async ({
    page,
  }) => {
    await page.goto('/');
    const sections = page.locator('[data-reveal-section]');
    // "ways to study", daily games (D-61) and the launch-updates panel.
    await expect(sections).toHaveCount(3);
    const look = (index: number) =>
      sections.nth(index).evaluate((el) => [el.getAttribute('data-reveal'), getComputedStyle(el).opacity, getComputedStyle(el).translate]);
    // All three start below the first screen, so they wait, lowered and clear.
    for (const index of [0, 1, 2]) expect(await look(index)).toEqual(['waiting', '0', '0px 10px']);
    await page.locator('#ways-to-study').scrollIntoViewIfNeeded();
    await expect.poll(() => look(0)).toEqual(['shown', '1', 'none']);
    // Once only: scrolling away and back changes nothing.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#ways-to-study').scrollIntoViewIfNeeded();
    expect(await look(0)).toEqual(['shown', '1', 'none']);

    // With reduced motion nothing waits or moves.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    for (const index of [0, 1, 2]) expect(await look(index)).toEqual([null, '1', 'none']);
  });

  test('study screens stay plain, with no texture behind lesson text', async ({ page }) => {
    await page.goto('/learn/study-skills');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toBe('none');
    await page.goto('/privacy');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).not.toBe('none');
  });
});

test.describe('"ways to study" merry-go-round (D-50, D-60)', () => {
  const section = (page: Page) => page.locator('#ways-to-study');
  /** The names of the cards on screen, left to right. */
  const onScreen = (page: Page) =>
    section(page)
      .locator('[data-mode-card]')
      .evaluateAll((cards) =>
        cards
          .filter((card) => getComputedStyle(card).visibility === 'visible')
          .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
          .map((card) => (card as HTMLElement).dataset.name),
      );

  test('the card in the middle has neighbours on both sides, and the arrows, keys and side cards turn it, endlessly', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await section(page).scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'ways to study' })).toBeVisible();
    // The first card in the middle, with the last card as its left neighbour: one on each side, two on wider screens.
    await expect
      .poll(() => onScreen(page))
      .toEqual(
        testInfo.project.name === 'desktop'
          ? ['adaptive quiz', 'level test', 'video', 'cards', 'learn']
          : ['level test', 'video', 'cards'],
      );
    await expect(section(page).getByRole('group', { name: '1 of 11', exact: true })).toHaveAttribute('data-active', '');

    // Previous from the first card goes round to the last, and next from the last comes back to the first.
    await section(page).getByRole('button', { name: 'previous study mode' }).click();
    await expect.poll(() => middleCard(page)).toBe('level test');
    await section(page).getByRole('button', { name: 'next study mode' }).click();
    await section(page).getByRole('button', { name: 'next study mode' }).click();
    await expect.poll(() => middleCard(page)).toBe('cards');

    // A tap on a side card brings it to the middle (on phones only its edge shows, so the tap is near its edge).
    await section(page).getByRole('button', { name: 'show learn' }).click({ position: { x: 16, y: 120 } });
    await expect.poll(() => middleCard(page)).toBe('learn');
    await expect(section(page).getByRole('button', { name: 'preview learn' })).toBeVisible();

    // The arrow keys, Home and End, round and round.
    await page.getByRole('group', { name: 'study mode cards' }).focus();
    await page.keyboard.press('End');
    await expect.poll(() => middleCard(page)).toBe('level test');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => middleCard(page)).toBe('video');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => middleCard(page)).toBe('level test');

    // Once the visitor is using it, the card where it comes to rest is announced.
    const live = section(page).locator('[data-modes-live]');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveText('level test, 11 of 11');

    // Only the card in the middle is in the Tab order; side cards are a tap or an arrow key away.
    const tabbable = await section(page)
      .locator('[data-mode-card] :is(button, a)')
      .evaluateAll((items) => items.filter((item) => (item as HTMLElement).tabIndex === 0).length);
    expect(tabbable).toBe(1);

    const axe = await new AxeBuilder({ page })
      .include('#ways-to-study')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("neighbours step back, smaller, turned away and quieter, but no card's words are ever faded", async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await section(page).scrollIntoViewIfNeeded();
    await section(page).getByRole('button', { name: 'next study mode' }).click();
    await expect.poll(() => middleCard(page)).toBe('cards');
    await page.waitForTimeout(400);
    const look = (id: string) =>
      page.locator(`#mode-${id}`).evaluate((card) => ({
        width: card.getBoundingClientRect().width,
        turn: (card as HTMLElement).style.getPropertyValue('--ring-turn'),
        heading: getComputedStyle(card.querySelector('h3')!).color,
        shadow: getComputedStyle(card).boxShadow,
      }));
    const front = await look('cards');
    const near = await look('learn');
    const left = await look('video');
    expect(near.width / front.width).toBeGreaterThan(0.78);
    expect(near.width / front.width).toBeLessThan(0.9);
    expect([front.turn, near.turn, left.turn]).toEqual(['0', '10', '-10']);
    expect(near.heading).not.toBe(front.heading);
    expect(near.shadow).toBe('none');
    if (testInfo.project.name === 'desktop') {
      const far = await look('fill-in');
      expect(far.width / front.width).toBeGreaterThan(0.6);
      expect(far.width / front.width).toBeLessThan(0.78);
    }

    // Nothing fades a card's words: from each card's words up to the page there is no mask, no filter and full
    // opacity, so the text keeps the frosted-panel contrast checked in tests/unit/tokens.test.ts. (First the section's
    // own fade-in, the first time it comes into view, has to finish: D-62.)
    await expect
      .poll(() => section(page).locator('[data-reveal-section]').evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
    const faded = await page.locator('[data-mode-card] h3, [data-mode-card] p, [data-mode-card] a').evaluateAll((texts) =>
      texts.flatMap((text) => {
        const found: string[] = [];
        for (let el: Element | null = text; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          const mask = style.maskImage || style.getPropertyValue('-webkit-mask-image');
          if (style.opacity !== '1' || style.filter !== 'none' || (mask && mask !== 'none')) {
            found.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
          }
        }
        return found;
      }),
    );
    expect(faded).toEqual([]);
  });

  /** Every text the live region is given from now on. */
  const listen = (page: Page) =>
    page.locator('#ways-to-study [data-modes-live]').evaluate((live) => {
      const heard: string[] = [];
      (window as unknown as { heard: string[] }).heard = heard;
      new MutationObserver(() => heard.push(live.textContent ?? '')).observe(live, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
  const heard = (page: Page) => page.evaluate(() => (window as unknown as { heard: string[] }).heard);

  test('a run of quick presses announces only the card where it comes to rest', async ({ page }) => {
    await page.goto('/');
    await section(page).scrollIntoViewIfNeeded();
    await listen(page);
    const next = section(page).getByRole('button', { name: 'next study mode' });
    for (let i = 0; i < 4; i++) await next.click({ force: true });
    await expect(section(page).locator('[data-modes-live]')).toHaveText('matching, 5 of 11');
    await page.waitForTimeout(600);
    expect(await heard(page)).toEqual(['matching, 5 of 11']);
  });

  test('a sideways swipe turns it one card each way; a short or mostly up-and-down one does not', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'a touch-screen gesture');
    await page.goto('/');
    await section(page).scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (dx: number, dy = 0) => {
      const box = (await page.getByRole('group', { name: 'study mode cards' }).boundingBox())!;
      const x = Math.round(box.x + box.width / 2);
      const y = Math.round(box.y + box.height / 2);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 6; step++) {
        const point = { x: Math.round(x + (dx * step) / 6), y: Math.round(y + (dy * step) / 6) };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(-120);
    await expect.poll(() => middleCard(page)).toBe('cards');
    await swipe(120);
    await expect.poll(() => middleCard(page)).toBe('video');
    await swipe(-30);
    await swipe(-30, 160);
    await page.waitForTimeout(500);
    expect(await middleCard(page)).toBe('video');
    // A swipe is never a tap: no preview opened on the way.
    await expect(page.locator('#mode-preview')).toBeHidden();
  });

  test('each card links to its mode when it is open, and says "coming soon" otherwise', async ({ page }) => {
    await page.goto('/');
    const open: Record<string, [string, string]> = {
      cards: ['try the cards', '/learn/study-skills/cards'],
      learn: ['try learn mode', '/learn/study-skills/learn-mode'],
      matching: ['try matching', '/learn/study-skills/matching'],
      organizer: ['try the organizer', '/learn/study-skills/organizer'],
      'fill-in': ['try fill-in', '/learn/study-skills/fill-in'],
      'label-it': ['try label it', '/learn/study-skills/label-it'],
      questions: ['try the questions', '/learn/study-skills/questions'],
    };
    const modes = [
      ['video', 'video'],
      ['cards', 'cards'],
      ['learn', 'learn'],
      ['fill-in', 'fill-in'],
      ['matching', 'matching'],
      ['organizer', 'organizer'],
      ['questions', 'questions'],
      ['review', 'review'],
      ['label-it', 'label it'],
      ['adaptive-quiz', 'adaptive quiz'],
      ['level-test', 'level test'],
    ];
    for (const [id, name] of modes) {
      const card = page.locator(`#mode-${id}`);
      await expect(card.locator('h3')).toHaveText(name!);
      const link = open[id!];
      if (link) await expect(card.locator(`a[href="${link[1]}"]`)).toHaveText(link[0]);
      else await expect(card.getByText('coming soon', { exact: true })).toHaveCount(1);
    }
  });

  test('the pause button stops the motion, and with reduced motion it just switches, without a glide or a turn', async ({
    page,
  }) => {
    await page.goto('/');
    const press = section(page).locator('#mode-video .ill-video-press');
    await expect.poll(() => press.evaluate((el) => getComputedStyle(el).animationName)).toBe('ill-video-press');
    await section(page).getByRole('button', { name: 'pause the slideshow' }).click();
    await expect(section(page).getByRole('button', { name: 'play the slideshow' })).toBeVisible();
    expect(await press.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await section(page).getByRole('button', { name: 'play the slideshow' }).click();
    await expect(section(page).getByRole('button', { name: 'pause the slideshow' })).toBeVisible();

    // A turn glides, and the side cards are turned away.
    await section(page).getByRole('button', { name: 'next study mode' }).click();
    const learn = section(page).locator('#mode-learn');
    expect(await learn.evaluate((el) => getComputedStyle(el).transitionDuration)).toContain('0.24s');
    expect(await learn.evaluate((el) => el.style.getPropertyValue('--ring-turn'))).toBe('10');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(section(page).getByRole('button', { name: 'next study mode' })).toBeVisible();
    await expect(section(page).locator('[data-modes-pause]')).toBeHidden();
    expect(
      await section(page)
        .locator('#mode-video .ill-video-press')
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');
    await section(page).getByRole('button', { name: 'next study mode' }).click();
    await expect.poll(() => middleCard(page)).toBe('cards');
    const still = await section(page)
      .locator('#mode-learn')
      .evaluate((el) => [getComputedStyle(el).transitionDuration, el.style.getPropertyValue('--ring-turn')]);
    // Instant: no transition at all (the site-wide reduced-motion rule leaves 0.01 ms at most).
    expect(Math.max(...still[0]!.split(',').map((d) => parseFloat(d)))).toBeLessThan(0.001);
    expect(still[1]).toBe('0');
  });

  test('auto-advance moves on after about six seconds, pauses on the cards, and stops once the visitor takes over', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one size is enough for a timing test');
    test.slow();
    await page.goto('/');
    await section(page).scrollIntoViewIfNeeded();
    // The mouse over the section's words, not its cards: that doesn't pause it.
    await page.mouse.move(0, 0);
    await expect.poll(() => middleCard(page), { timeout: 9000 }).toBe('cards');

    // Resting on the cards pauses it; moving off lets it go on.
    await page.getByRole('group', { name: 'study mode cards' }).hover();
    await page.waitForTimeout(7000);
    expect(await middleCard(page)).toBe('cards');
    await page.mouse.move(0, 0);
    await expect.poll(() => middleCard(page), { timeout: 9000 }).toBe('learn');

    await section(page).getByRole('button', { name: 'next study mode' }).click();
    await expect.poll(() => middleCard(page)).toBe('fill-in');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(7000);
    expect(await middleCard(page)).toBe('fill-in');
  });
});

test.describe('silk scenes down the home page (D-53)', () => {
  test('three scenes in order, each its own layer behind its section, with no section numbers or decorative lines', async ({
    page,
  }) => {
    await page.goto('/');
    const scenes = await page.locator('.scene').evaluateAll((sections) =>
      sections.map((section) => {
        const layer = getComputedStyle(section, '::before');
        return {
          kind: [...section.classList].find((name) => name.startsWith('scene-')),
          drawn: layer.backgroundImage !== 'none',
          behind: layer.zIndex,
          fades: (layer.maskImage || layer.getPropertyValue('-webkit-mask-image')).includes('linear-gradient'),
        };
      }),
    );
    expect(scenes.map((scene) => scene.kind)).toEqual(['scene-hero', 'scene-tint', 'scene-play', 'scene-low']);
    for (const scene of scenes) expect(scene).toMatchObject({ drawn: true, behind: '-20', fades: true });

    // Calm, not a template (D-60): no numbered labels, no figure caption, no rhythm line.
    await expect(page.locator('[data-section-label], [data-rhythm]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/fig\. |\b0\d — /);
  });

  test('every fade between scenes lies in empty space, never over words', async ({ page }) => {
    // Measured where everything has settled: with reduced motion no section waits, lowered, to fade in (D-62).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const covered = await page.evaluate(() => {
      // Each scene fades in over the space above it and the last one fades out at its bottom: measure those bands.
      const length = (section: Element, name: string) => {
        const probe = document.createElement('div');
        probe.style.blockSize = `var(${name})`;
        section.append(probe);
        const size = probe.getBoundingClientRect().height;
        probe.remove();
        return size;
      };
      const bands: Array<[number, number]> = [];
      for (const section of document.querySelectorAll('.scene')) {
        const box = section.getBoundingClientRect();
        const top = length(section, '--scene-fade-top');
        const bottom = length(section, '--scene-fade-bottom');
        if (top > 0) bands.push([box.top - top, box.top]);
        if (bottom > 0) bands.push([box.bottom - bottom, box.bottom]);
      }
      const hits: string[] = [];
      const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width === 0 || rect.height === 0) continue;
          if (bands.some(([from, to]) => rect.bottom > from && rect.top < to)) hits.push(node.textContent.trim());
        }
      }
      return { bands: bands.length, hits };
    });
    expect(covered.bands).toBe(4);
    expect(covered.hits).toEqual([]);
  });
});

test.describe('study-mode preview (D-51)', () => {
  const dialog = (page: Page) => page.locator('#mode-preview');
  /** Turns the merry-go-round until `name` is in the middle, where a tap opens its preview. */
  const bringToMiddle = async (page: Page, name: string) => {
    await page.locator('#ways-to-study').scrollIntoViewIfNeeded();
    for (let i = 0; i < 11 && (await middleCard(page)) !== name; i++) {
      await page.locator('#ways-to-study').getByRole('button', { name: 'next study mode' }).click();
    }
    await expect.poll(() => middleCard(page)).toBe(name);
  };
  const openPreview = async (page: Page, name: string) => {
    await page.goto('/');
    await bringToMiddle(page, name);
    await page.getByRole('button', { name: `preview ${name}` }).click();
    await expect(page.getByRole('dialog', { name })).toBeVisible();
  };

  test('the card in the middle grows into its preview, which passes axe; Escape shrinks it back and focus returns', async ({
    page,
  }) => {
    await page.goto('/');
    await bringToMiddle(page, 'cards');
    // Let the turn finish, so the card has come to rest before it is measured.
    await page.waitForTimeout(400);
    // The grow starts with the panel exactly over the card it came from. (A click without moving the mouse there, so
    // the hover zoom doesn't change the card while it is measured.)
    const start = await page.evaluate(() => {
      const card = document.querySelector('#mode-cards')!.getBoundingClientRect();
      document.querySelector<HTMLButtonElement>('#mode-cards [data-mode-open]')!.click();
      const panel = document.querySelector<HTMLElement>('[data-mode-preview-panel]')!;
      const [grow] = panel.getAnimations();
      if (!grow) return undefined;
      grow.pause();
      grow.currentTime = 0;
      const box = panel.getBoundingClientRect();
      grow.play();
      return [box.left - card.left, box.top - card.top, box.width - card.width, box.height - card.height];
    });
    expect(start).toBeDefined();
    for (const gap of start!) expect(Math.abs(gap)).toBeLessThan(2);

    const preview = page.getByRole('dialog', { name: 'cards' });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('heading', { level: 2, name: 'cards' })).toBeVisible();
    await expect(preview.getByText('flip a card to check yourself')).toBeVisible();
    await expect(preview.getByRole('link', { name: 'try it' })).toHaveAttribute('href', '/learn/study-skills/cards');
    await expect(preview.getByRole('link', { name: 'create your free account to save progress' })).toHaveAttribute(
      'href',
      '/#signup',
    );
    await expect(preview.getByRole('button', { name: 'close preview' })).toBeFocused();
    // Its illustration plays in the preview too.
    await expect
      .poll(() => preview.locator('.ill-flip-front').evaluate((el) => getComputedStyle(el).animationName))
      .toBe('ill-flip-front');
    await expect.poll(() => page.evaluate(() => document.querySelector('[data-mode-preview-panel]')!.getAnimations().length)).toBe(0);

    const axe = await new AxeBuilder({ page })
      .include('#mode-preview')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'preview cards' })).toBeFocused();
  });

  test('previous and next move through the modes with the row behind; the X and the darkened page close it', async ({
    page,
  }) => {
    await openPreview(page, 'cards');
    const preview = dialog(page);
    await preview.getByRole('button', { name: 'next study mode' }).click();
    await expect(page.getByRole('dialog', { name: 'learn' })).toBeVisible();
    await expect(preview.getByRole('link', { name: 'try it' })).toHaveAttribute('href', '/learn/study-skills/learn-mode');
    await expect(preview.locator('[data-mode-preview-live]')).toHaveText('learn, 3 of 11');

    await preview.getByRole('button', { name: 'previous study mode' }).click();
    await preview.getByRole('button', { name: 'previous study mode' }).click();
    await expect(page.getByRole('dialog', { name: 'video' })).toBeVisible();
    await expect(preview.getByText('coming soon')).toBeVisible();
    await expect(preview.getByRole('link', { name: 'try it' })).toBeHidden();
    await expect(preview.locator('[data-mode-preview-live]')).toHaveText('video, 1 of 11');
    // The merry-go-round behind follows, so closing shrinks the preview into the video card.
    await expect(page.locator('#mode-video')).toHaveAttribute('data-active', '');

    await preview.getByRole('button', { name: 'close preview' }).click();
    await expect(preview).toBeHidden();
    await expect(page.getByRole('button', { name: 'preview video' })).toBeFocused();

    await page.getByRole('button', { name: 'preview video' }).click();
    await expect(page.getByRole('dialog', { name: 'video' })).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(preview).toBeHidden();
  });

  test('moving to a mode that is not open yet keeps focus in the preview when "try it" had it', async ({ page }) => {
    await openPreview(page, 'cards');
    const preview = dialog(page);
    await preview.getByRole('link', { name: 'try it' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('dialog', { name: 'video' })).toBeVisible();
    await expect(preview.getByRole('button', { name: 'previous study mode' })).toBeFocused();
    // The arrow keys still work from there, round to the last card.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('dialog', { name: 'level test' })).toBeVisible();
  });

  test('closing in the middle of the grow still shrinks the preview exactly back into its card', async ({ page }) => {
    await page.goto('/');
    await page.locator('#ways-to-study').scrollIntoViewIfNeeded();
    const gaps = await page.evaluate(async () => {
      document.querySelector<HTMLButtonElement>('#mode-video [data-mode-open]')!.click();
      // Escape a tenth of a second into the 320 ms grow.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const card = document.querySelector('#mode-video')!.getBoundingClientRect();
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const panel = document.querySelector<HTMLElement>('[data-mode-preview-panel]')!;
      const [shrink] = panel.getAnimations();
      if (!shrink) return undefined;
      shrink.pause();
      shrink.currentTime = Number(shrink.effect!.getComputedTiming().endTime);
      const box = panel.getBoundingClientRect();
      return [box.left - card.left, box.top - card.top, box.width - card.width, box.height - card.height];
    });
    expect(gaps).toBeDefined();
    for (const gap of gaps!) expect(Math.abs(gap)).toBeLessThan(2);
  });

  test('keyboard focus stays inside the open preview', async ({ page }) => {
    await openPreview(page, 'cards');
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('#mode-preview'))).toBe(true);
    }
  });

  test('with reduced motion it opens and closes at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPreview(page, 'video');
    expect(await page.evaluate(() => document.querySelector('[data-mode-preview-panel]')!.getAnimations().length)).toBe(0);
    await page.keyboard.press('Escape');
    expect(await dialog(page).evaluate((el) => (el as HTMLDialogElement).open)).toBe(false);
  });

  test('a swipe down closes it on touch screens, a short one does not', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'a touch-screen gesture');
    await openPreview(page, 'video');
    const swipe = (distance: number) =>
      page.locator('[data-mode-preview-panel]').evaluate((panel, down) => {
        const touch = (y: number) => new Touch({ identifier: 1, target: panel, clientX: 200, clientY: y });
        panel.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(300)], changedTouches: [touch(300)], bubbles: true }));
        panel.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch(300 + down)], bubbles: true }));
      }, distance);
    await swipe(40);
    await page.waitForTimeout(500);
    await expect(dialog(page)).toBeVisible();
    await swipe(120);
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'preview video' })).toBeFocused();
  });

  test('with a mouse, the card in the middle grows a little under the pointer, and side cards stay as they are', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'hover needs a mouse');
    await page.goto('/');
    await page.locator('#ways-to-study').scrollIntoViewIfNeeded();
    const card = page.locator('#mode-video');
    expect(await card.evaluate((el) => getComputedStyle(el).scale)).toBe('none');
    await card.hover();
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).scale)).toBe('1.04');
    const side = page.locator('#mode-cards');
    await side.hover();
    await page.waitForTimeout(300);
    expect(await side.evaluate((el) => getComputedStyle(el).scale)).toBe('none');
  });
});

test.describe('☰ side panel and account corner (D-46)', () => {
  for (const path of ['/', '/privacy', '/learn/study-skills']) {
    test(`☰ opens the side panel on ${path}, keeps focus inside, and Escape brings focus back`, async ({ page }) => {
      await page.goto(path);
      const open = page.getByRole('button', { name: 'menu', exact: true });
      await expect(open).toHaveAttribute('aria-expanded', 'false');
      await open.click();
      const panel = page.getByTestId('site-menu');
      await expect(panel).toBeVisible();
      await expect(open).toHaveAttribute('aria-expanded', 'true');
      await expect(panel.getByRole('button', { name: 'close menu' })).toBeFocused();

      const nav = panel.getByRole('navigation', { name: 'site' });
      for (const name of ['home', 'ways to study', 'lessons', 'daily games', 'my progress', 'support cueory']) {
        await expect(nav.getByRole('link', { name })).toBeVisible();
      }
      await expect(panel.getByRole('link', { name: 'privacy' })).toBeVisible();
      await expect(panel.getByRole('link', { name: 'terms' })).toBeVisible();

      // Tab never leaves the panel while it is open.
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.activeElement?.closest('#site-menu') !== null)).toBe(true);
      }

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(open).toBeFocused();
      await expect(open).toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('the current page is marked in the side panel by more than color', async ({ page }) => {
    await page.goto('/learn/study-skills/cards');
    await page.getByRole('button', { name: 'menu', exact: true }).click();
    const current = page.getByTestId('site-menu').locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('lessons');
    // A short line beside the link, drawn by ::before.
    expect(await current.evaluate((el) => getComputedStyle(el, '::before').content)).not.toBe('none');
  });

  test('the close button and a tap on the dimmed page close the side panel', async ({ page }) => {
    await page.goto('/');
    const open = page.getByRole('button', { name: 'menu', exact: true });
    const panel = page.getByTestId('site-menu');
    await open.click();
    await panel.getByRole('button', { name: 'close menu' }).click();
    await expect(panel).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await expect(panel).toBeVisible();
    const viewport = page.viewportSize()!;
    await page.mouse.click(viewport.width - 8, viewport.height / 2);
    await expect(panel).toBeHidden();
  });

  test('a side-panel link to a spot on the home page closes the panel and goes there', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'menu', exact: true }).click();
    await page.getByTestId('site-menu').getByRole('link', { name: 'ways to study' }).click();
    await expect(page.getByTestId('site-menu')).toBeHidden();
    await expect(page).toHaveURL(/#ways-to-study$/);
    await expect(page.getByRole('heading', { name: 'ways to study' })).toBeInViewport();
  });

  test('the account corner offers "create free account" and "sign in", both coming soon', async ({ page }) => {
    await page.goto('/');
    const account = page.getByRole('button', { name: 'account', exact: true });
    const menu = page.getByTestId('account-menu');
    await expect(menu).toBeHidden();
    await account.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(account).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('link', { name: /create free account/ })).toHaveAttribute('href', '/#signup');
    await expect(menu.getByRole('link', { name: /sign in/ })).toHaveAttribute('href', '/#signup');
    await expect(menu.getByText('coming soon')).toHaveCount(2);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // Hovering a row underlines it but never lightens it, so the "coming soon" note keeps the AA contrast that
    // tests/unit/tokens.test.ts checks on the panel glass (Codex review of #24). axe can't judge text on see-through
    // glass over silk, so this checks the hover layer directly.
    for (const name of [/create free account/, /sign in/]) {
      const link = menu.getByRole('link', { name });
      await link.hover();
      expect(await link.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('underline');
    }
    await account.focus();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(account).toBeFocused();

    // A tap anywhere else closes it too.
    await account.click();
    await expect(menu).toBeVisible();
    await page.getByRole('heading', { level: 1 }).click();
    await expect(menu).toBeHidden();
  });

  test('corner buttons are at least 44 by 44 px', async ({ page }) => {
    for (const path of ['/', '/learn/study-skills']) {
      await page.goto(path);
      for (const name of ['menu', 'account']) {
        const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe('site search in the ☰ panel (D-49)', () => {
  test('finds pages as you type, works by keyboard, and goes to the result', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'menu', exact: true }).click();
    const panel = page.getByTestId('site-menu');
    const field = panel.getByRole('searchbox', { name: 'search the site' });
    await expect(field).toHaveAttribute('placeholder', 'search');

    await field.fill('privacy');
    const results = panel.getByRole('list', { name: 'search results' });
    const privacy = results.getByRole('link', { name: /^privacy/ });
    await expect(privacy).toBeVisible();
    await expect(privacy).toHaveAttribute('href', '/privacy');
    await expect(panel.locator('#site-search-status')).toHaveText(/^(1 result|\d+ results|\d+ of \d+ results)$/);
    // The matched word is marked by weight, not color alone.
    const mark = results.locator('mark').first();
    await expect(mark).toBeVisible();
    expect(Number(await mark.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThan(500);

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // Down from the field goes to the first result; Up goes back.
    await field.press('ArrowDown');
    await expect(results.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(field).toBeFocused();

    await privacy.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test('a new search while a result has keyboard focus keeps focus in the panel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'menu', exact: true }).click();
    const panel = page.getByTestId('site-menu');
    const field = panel.getByRole('searchbox', { name: 'search the site' });
    const results = panel.getByRole('list', { name: 'search results' });
    const search = (term: string) =>
      field.evaluate((el, value) => {
        const input = el as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, term);

    await field.fill('card');
    await expect(results.getByRole('link').nth(1)).toBeVisible();
    // Focus moves onto a result before the next search's results arrive (Codex review on #27).
    await results.getByRole('link').nth(1).focus();
    await search('privacy');
    // The new results are in once the privacy page leads the list ("card" never puts it first).
    await expect(results.getByRole('link').first()).toHaveAccessibleName(/^privacy/);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[aria-label="search results"]') !== null))
      .toBe(true);

    await search('zzqxv');
    await expect(panel.locator('#site-search-status')).toHaveText('no results for “zzqxv”');
    await expect(field).toBeFocused();
  });

  test('says "no results" plainly, and clearing the field clears the results', async ({ page }) => {
    await page.goto('/learn/study-skills');
    await page.getByRole('button', { name: 'menu', exact: true }).click();
    const panel = page.getByTestId('site-menu');
    const field = panel.getByRole('searchbox', { name: 'search the site' });
    const status = panel.locator('#site-search-status');

    await field.fill('zzqxv');
    await expect(status).toHaveText('no results for “zzqxv”');
    await expect(panel.getByRole('list', { name: 'search results' })).toBeHidden();

    await field.fill('placeholder card');
    await expect(panel.getByRole('list', { name: 'search results' }).getByRole('link').first()).toBeVisible();
    await field.fill('');
    await expect(status).toBeHidden();
    await expect(panel.getByRole('list', { name: 'search results' })).toBeHidden();
  });
});

test.describe('social links (D-54)', () => {
  test("the footer and the ☰ panel link to cueory's profiles in a new tab, only where an address is set", async ({
    page,
  }) => {
    await page.goto('/privacy');
    const footer = page.getByRole('contentinfo');
    const expected = Object.fromEntries(socials.filter((social) => social.href).map((social) => [social.id, social.href]));
    await expect(footer.locator('[data-social]')).toHaveCount(Object.keys(expected).length);
    for (const [id, href] of Object.entries(expected)) {
      const link = footer.locator(`[data-social="${id}"]`);
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      // The mark is drawn inline from our own page, never loaded from the platform.
      await expect(link.locator('svg path')).toHaveCount(1);
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(footer.getByRole('link', { name: 'cueory on Instagram (opens in a new tab)' })).toBeVisible();

    await page.getByRole('button', { name: 'menu' }).click();
    await expect(page.getByTestId('site-menu').locator('[data-social]')).toHaveCount(Object.keys(expected).length);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('without JavaScript, the corners', () => {
  test.use({ javaScriptEnabled: false });

  test('stay hidden but keep their space, so nothing moves', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('button', { name: 'menu', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'account', exact: true })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'footer' }).getByRole('link', { name: 'support cueory' })).toBeVisible();
  });
});

test.describe('organizer at 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('sorts by keyboard, number keys and tap; check returns wrong items to the tray', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    // The lesson page links here; the test then opens the page itself, because the lesson's reader grows while it
    // loads and a tap during that shift can land beside the link.
    await page.goto('/learn/study-skills');
    await expect(page.getByRole('link', { name: 'sort ideas into groups with the organizer' })).toHaveAttribute(
      'href',
      '/learn/study-skills/organizer',
    );
    await page.goto('/learn/study-skills/organizer');
    await expect(page.getByTestId('organizer-sample-note')).toBeVisible();

    const board = page.getByTestId('organizer');
    const live = page.getByTestId('organizer-live');
    const item = (name: string) => board.getByRole('button', { name: new RegExp(`^${name}`) });
    const group = (name: string) => board.getByRole('button', { name });
    const axe = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    await axe();
    await expect(board.getByRole('button', { name: 'check' })).toBeDisabled();

    // Keyboard: pick with Enter, which moves focus to the first group, then place with Enter.
    await item('apple').focus();
    await page.keyboard.press('Enter');
    await expect(group('1. fruit')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(live).toHaveText('apple moved to fruit.');
    await expect(board.getByRole('list', { name: 'fruit' }).getByRole('button', { name: /^apple/ })).toBeFocused();

    // Number keys on an item: 2 is the second group. A wrong one on purpose: plum is fruit, not vegetable.
    await item('carrot').focus();
    await page.keyboard.press('2');
    await expect(live).toHaveText('carrot moved to vegetable.');
    await item('plum').focus();
    await page.keyboard.press('2');
    await expect(live).toHaveText('plum moved to vegetable.');

    // Tap: the item, then its group.
    await item('rice').click();
    await group('3. grain').click();
    await expect(live).toHaveText('rice moved to grain.');

    // Nothing is marked until check; the wrong one goes back to the tray, in words.
    await board.getByRole('button', { name: 'check' }).click();
    await expect(live).toHaveText('3 right, 1 back in the tray to try again.');
    await expect(board.getByRole('list', { name: 'tray' }).getByRole('button', { name: /^plum/ })).toContainText(
      'back in the tray to try again',
    );
    await expect(item('apple')).toContainText('✓ right');
    await expect(item('apple')).toHaveAttribute('aria-disabled', 'true');
    await axe();

    // Sort the rest by number keys, then check: the summary takes focus.
    for (const [name, key] of [['plum', '1'], ['pear', '1'], ['spinach', '2'], ['onion', '2'], ['oats', '3']] as const) {
      await item(name).focus();
      await page.keyboard.press(key);
    }
    await board.getByRole('button', { name: 'check' }).click();
    await expect(page.getByTestId('organizer-result')).toBeFocused();
    await expect(page.getByTestId('organizer-result')).toContainText('all 8 sorted in 2 tries.');
    await axe();

    await board.getByRole('button', { name: 'sort again' }).click();
    await expect(board.getByRole('list', { name: 'tray' }).getByRole('button')).toHaveCount(8);
    expect(errors).toEqual([]);
  });
});

test.describe('fill-in at 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('recalls by keyboard: right, a hint, almost, wrong, then a second round of the missed ones', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    await page.goto('/learn/study-skills');
    await expect(page.getByRole('link', { name: 'recall the missing word with fill-in' })).toHaveAttribute(
      'href',
      '/learn/study-skills/fill-in',
    );
    await page.goto('/learn/study-skills/fill-in');
    await expect(page.getByTestId('fill-in-sample-note')).toBeVisible();

    const board = page.getByTestId('fill-in');
    const field = board.getByRole('textbox', { name: 'the missing word' });
    const next = board.getByRole('button', { name: 'next' });
    const axe = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    const answer = async (words: string) => {
      await field.fill(words);
      await field.press('Enter');
    };

    await expect(board.getByText('round 1 · item 1 of 4')).toBeVisible();
    // The answer is never shown in the sentence.
    await expect(board.getByText(/Bees make/)).not.toContainText('honey');
    await axe();

    // Right: focus moves to "next", and Enter moves on with focus back in the field.
    await answer('Honey.');
    await expect(board.getByText('right.', { exact: true })).toBeVisible();
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
    await expect(field).toBeFocused();

    // A hint gives the first letter; a right answer after a hint comes back next round.
    await board.getByRole('button', { name: 'hint' }).click();
    await expect(board.getByText('starts with d.')).toBeVisible();
    await answer('days');
    await expect(board.getByText("right. you'll see this one again because you used a hint.")).toBeVisible();
    await next.click();

    // One letter off is "almost", and the field stays open; a wrong answer shows the word.
    await answer('pencl');
    await expect(board.getByText('almost. check the spelling.')).toBeVisible();
    await expect(field).toBeFocused();
    await answer('pen');
    await expect(board.getByText('the word was pencil.')).toBeVisible();
    await axe();
    await next.click();

    await answer('umbrella');
    await next.click();

    // Round 2 is only the hinted and the missed ones.
    await expect(board.getByText('round 2 · item 1 of 2')).toBeVisible();
    await answer('days');
    await next.click();
    await answer('pencil');
    await next.click();
    await expect(board.getByText('all 4 recalled in 2 rounds.')).toBeVisible();
    await axe();
    expect(errors).toEqual([]);
  });
});

test.describe('label it at 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('uncovers by keyboard and tap, marks each label, and covers only "still learning" again', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    await page.goto('/learn/study-skills');
    await expect(page.getByRole('link', { name: "uncover a diagram's labels with label it" })).toHaveAttribute(
      'href',
      '/learn/study-skills/label-it',
    );
    await page.goto('/learn/study-skills/label-it');
    await expect(page.getByTestId('label-it-sample-note')).toBeVisible();

    const board = page.getByTestId('labelit');
    await expect(board).toBeVisible();
    const live = page.getByTestId('labelit-live');
    const status = page.getByTestId('labelit-status');
    const axe = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };

    // The drawing loads, with its credit, and nothing in the board names a covered label.
    await expect.poll(() => board.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(board).toContainText('drawing: cueory');
    await expect(board).not.toContainText(/roof|chimney|window|door/);
    await expect(status).toHaveText('4 covered · know it: 0 · still learning: 0');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
    await axe();

    // Keyboard on the drawing: the cover keeps focus and says what it was.
    await page.getByTestId('cover-1').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1: roof');
    await expect(page.getByTestId('cover-1')).toBeFocused();
    await expect(live).toHaveText('label 1: roof.');

    // "uncover" in the list hands focus to that label's "know it".
    await board.getByRole('button', { name: 'uncover label 2' }).click();
    await expect(board.getByRole('group', { name: 'mark label 2' }).getByRole('button', { name: 'know it' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(live).toHaveText('chimney: know it. 3 left to mark.');

    // Tap: reveal all, then mark the rest; roof and door are still learning.
    await board.getByRole('button', { name: 'reveal all' }).click();
    for (const [n, mark] of [[1, 'still learning'], [3, 'know it'], [4, 'still learning']] as const) {
      await board.getByRole('group', { name: `mark label ${n}` }).getByRole('button', { name: mark }).click();
    }
    await axe();

    await board.getByRole('button', { name: 'study the 2 still learning' }).click();
    await expect(status).toHaveText('round 2 · 2 covered · know it: 2 · still learning: 0');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
    await expect(page.getByTestId('cover-4')).toHaveAccessibleName('label 4, covered');
    await expect(page.getByTestId('cover-2')).toHaveAccessibleName('label 2: chimney');
    expect(errors).toEqual([]);
  });
});

test.describe('questions at 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('checks single and select-all answers, shows each choice in words with its rationale, and retries the missed', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    await page.goto('/learn/study-skills');
    await expect(page.getByRole('link', { name: 'practice questions with rationales' })).toHaveAttribute(
      'href',
      '/learn/study-skills/questions',
    );
    await page.goto('/learn/study-skills/questions');
    await expect(page.getByTestId('questions-sample-note')).toBeVisible();

    const board = page.getByTestId('questions');
    const check = board.getByRole('button', { name: 'check' });
    const next = board.getByRole('button', { name: 'next question' });
    const axe = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };

    await expect(board.getByText('question 1 of 3')).toBeVisible();
    await expect(board).not.toContainText('Apples are fruit.');
    await expect(check).toBeDisabled();
    await axe();

    // A wrong single answer: the verdict, then every choice marked in words, with its rationale.
    await board.getByRole('radio', { name: 'a carrot' }).check();
    await check.click();
    await expect(board.getByText('not quite.', { exact: true }).first()).toBeVisible();
    await expect(board.getByRole('group', { name: 'Which of these is a fruit?' })).toContainText(
      "you picked this, but it's not right",
    );
    await expect(board).toContainText("this is right, and you didn't pick it");
    await expect(board).toContainText('Apples are fruit.');
    await expect(board).toContainText('Carrots are vegetables.');
    await axe();
    await next.click();

    // Select all that apply, by keyboard: Space ticks each box.
    await expect(board.getByText('question 2 of 3')).toBeVisible();
    await expect(board.getByText('select all that apply')).toBeVisible();
    await board.getByRole('checkbox', { name: 'Monday' }).focus();
    await page.keyboard.press('Space');
    await board.getByRole('checkbox', { name: 'Friday' }).focus();
    await page.keyboard.press('Space');
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(board.getByText('right.', { exact: true }).first()).toBeVisible();
    await next.click();

    await board.getByRole('radio', { name: '60' }).check();
    await check.click();
    await next.click();

    await expect(board.getByText('right on 2 of 3.')).toBeVisible();
    await board.getByRole('button', { name: 'try the missed ones again' }).click();
    await expect(board.getByText('question 1 of 1')).toBeVisible();
    await expect(board.getByRole('radio', { name: 'an apple' })).not.toBeChecked();
    await axe();
    expect(errors).toEqual([]);
  });
});

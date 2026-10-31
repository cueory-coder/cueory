import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pages = [
  '/',
  '/learn/study-skills',
  '/learn/study-skills/cards',
  '/learn/study-skills/learn-mode',
  '/learn/study-skills/matching',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/support',
  '/subscribed',
];

for (const path of pages) {
  test(`${path} loads, shows the notice, and passes accessibility checks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId('building-notice')).toHaveText("We're still building. More coming soon.");
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
  expect(await page.evaluate(() => localStorage.getItem('cueory-stars-study-skills-01'))).toBe('["ss01-c02"]');

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
      if (!missedOnce) await expect(page.getByText('The answer', { exact: true })).toBeVisible();
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

  test('"ways to study" shows every card, each chip links to its card, and the buttons keep their space', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('[data-mode-card]')).toHaveCount(8);
    const chip = page.getByRole('group', { name: 'pick a study mode' }).getByRole('link', { name: 'matching', exact: true });
    await expect(chip).toHaveAttribute('href', '#mode-matching');
    await chip.click();
    await expect(page).toHaveURL(/#mode-matching$/);
    await expect(page.locator('#mode-matching')).toBeInViewport();
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
  const charcoal = 'rgb(27, 23, 21)';
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
    // The free course stays one tap away until accounts exist.
    await expect(page.getByRole('link', { name: 'or start the free study-skills course' })).toHaveAttribute(
      'href',
      '/learn/study-skills',
    );
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

  test('study screens stay plain, with no texture behind lesson text', async ({ page }) => {
    await page.goto('/learn/study-skills');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toBe('none');
    await page.goto('/privacy');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).not.toBe('none');
  });
});

test.describe('"ways to study" carousel (D-50)', () => {
  const chips = (page: Page) => page.getByRole('group', { name: 'pick a study mode' });
  const chip = (page: Page, name: string) => chips(page).getByRole('link', { name, exact: true });
  /** The name of the card whose middle is nearest the middle of the row. */
  const middleCard = (page: Page) =>
    page.getByRole('group', { name: 'study mode cards' }).evaluate((row) => {
      const box = row.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      let best = '';
      let gap = Infinity;
      for (const card of row.querySelectorAll<HTMLElement>('[data-mode-card]')) {
        const r = card.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < gap) [gap, best] = [d, card.dataset.name ?? ''];
      }
      return best;
    });

  test('chips, arrows and the keyboard bring each mode to the middle', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#ways-to-study');
    await section.scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'ways to study' })).toBeVisible();
    await expect(chip(page, 'lesson')).toHaveAttribute('aria-current', 'true');

    await chip(page, 'matching').click();
    await expect(chip(page, 'matching')).toHaveAttribute('aria-current', 'true');
    await expect.poll(() => middleCard(page)).toBe('matching');
    await expect(section.getByRole('group', { name: '5 of 8' })).toHaveAttribute('data-active', '');

    await section.getByRole('button', { name: 'next study mode' }).click();
    await expect(chip(page, 'organizer')).toHaveAttribute('aria-current', 'true');
    await section.getByRole('button', { name: 'previous study mode' }).click();
    await expect(chip(page, 'matching')).toHaveAttribute('aria-current', 'true');

    await page.getByRole('group', { name: 'study mode cards' }).focus();
    await page.keyboard.press('End');
    await expect(chip(page, 'review')).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(chip(page, 'lesson')).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(chip(page, 'review')).toHaveAttribute('aria-current', 'true');
    await expect.poll(() => middleCard(page)).toBe('review');

    // Once the visitor is using it, the card that arrives in the middle is announced.
    const live = section.locator('[data-modes-live]');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveText('review, 8 of 8');

    const axe = await new AxeBuilder({ page })
      .include('#ways-to-study')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('each card links to its mode when it is open, and says "coming soon" otherwise', async ({ page }) => {
    await page.goto('/');
    const open: Record<string, [string, string]> = {
      lesson: ['read lesson 1', '/learn/study-skills'],
      cards: ['try the cards', '/learn/study-skills/cards'],
      learn: ['try learn mode', '/learn/study-skills/learn-mode'],
      matching: ['try matching', '/learn/study-skills/matching'],
    };
    for (const id of ['lesson', 'cards', 'learn', 'fill-in', 'matching', 'organizer', 'questions', 'review']) {
      const card = page.locator(`#mode-${id}`);
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(id);
      const link = open[id];
      if (link) await expect(card.getByRole('link', { name: link[0] })).toHaveAttribute('href', link[1]);
      else await expect(card.getByText('coming soon')).toBeVisible();
    }
  });

  test('the pause button stops the motion, and with reduced motion nothing moves by itself', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#ways-to-study');
    const line = section.locator('#mode-lesson .ill-lesson-1');
    await expect.poll(() => line.evaluate((el) => getComputedStyle(el).animationName)).toBe('ill-lesson-line');
    await section.getByRole('button', { name: 'pause the slideshow' }).click();
    await expect(section.getByRole('button', { name: 'play the slideshow' })).toBeVisible();
    expect(await line.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await section.getByRole('button', { name: 'play the slideshow' }).click();
    await expect(section.getByRole('button', { name: 'pause the slideshow' })).toBeVisible();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('#ways-to-study').getByRole('button', { name: 'next study mode' })).toBeVisible();
    await expect(page.locator('#ways-to-study [data-modes-pause]')).toBeHidden();
    expect(await page.locator('#mode-lesson .ill-lesson-1').evaluate((el) => getComputedStyle(el).animationName)).toBe(
      'none',
    );
  });

  test('auto-advance moves on after about six seconds, and stops once the visitor takes over', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one size is enough for a timing test');
    test.slow();
    await page.goto('/');
    await page.locator('#ways-to-study').scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(chip(page, 'cards')).toHaveAttribute('aria-current', 'true', { timeout: 9000 });

    await page.locator('#ways-to-study').getByRole('button', { name: 'next study mode' }).click();
    await expect(chip(page, 'learn')).toHaveAttribute('aria-current', 'true');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(7000);
    await expect(chip(page, 'learn')).toHaveAttribute('aria-current', 'true');
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
      for (const name of ['home', 'ways to study', 'lessons', 'my progress', 'support cueory']) {
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

test.describe('without JavaScript, the corners', () => {
  test.use({ javaScriptEnabled: false });

  test('stay hidden but keep their space, so nothing moves', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('button', { name: 'menu', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'account', exact: true })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'footer' }).getByRole('link', { name: 'support cueory' })).toBeVisible();
  });
});

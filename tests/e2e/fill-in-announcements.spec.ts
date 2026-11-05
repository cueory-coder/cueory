import { expect, test } from '@playwright/test';

// Existing pages/resume suites cover full rounds and persistence. This checks the spoken feedback contract.
test('fill-in keyboard feedback remains live, atomic and associated with the answer field', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  const board = page.getByTestId('fill-in');
  await board.getByRole('button', { name: 'type instead' }).click();
  const field = board.getByRole('textbox', { name: 'the missing word', exact: true });
  const next = board.getByRole('button', { name: 'next', exact: true });
  const feedback = board.locator('p[id$="-message"]');
  await expect(field).toBeVisible();
  await expect(feedback).toHaveCount(1);
  await expect(feedback).toHaveAttribute('aria-live', 'polite');
  await expect(feedback).toHaveAttribute('aria-atomic', 'true');

  // Reach the field without any pointer actions, including when initial hydration has already focused it.
  for (let tabs = 0; tabs < 40 && !(await field.evaluate(element => element === document.activeElement)); tabs++) {
    await page.keyboard.press('Tab');
  }
  await expect(field).toBeFocused();
  const feedbackId = await feedback.getAttribute('id');
  expect(feedbackId).toBeTruthy();
  const expectAssociated = async () => {
    expect((await field.getAttribute('aria-describedby'))?.split(/\s+/)).toContain(feedbackId);
  };

  await field.pressSequentially('honey');
  await page.keyboard.press('Enter');
  await expect(feedback).toHaveText('right.');
  await expectAssociated();
  await expect(next).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  await expect(feedback).toBeEmpty();
  expect((await field.getAttribute('aria-describedby'))?.split(/\s+/)).not.toContain(feedbackId);

  await field.pressSequentially('zzzz');
  await page.keyboard.press('Enter');
  await expect(feedback).toHaveText('the word was days.');
  await expectAssociated();
  await expect(next).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(field).toBeFocused();
  await field.pressSequentially('pencl');
  await page.keyboard.press('Enter');
  await expect(feedback).toHaveText('almost. check the spelling.');
  await expectAssociated();
  await expect(field).toBeFocused();
  await expect(next).toHaveCount(0);

  await field.press('ControlOrMeta+A');
  await field.pressSequentially('pencil');
  await page.keyboard.press('Enter');
  await expect(feedback).toHaveText('right.');
  await expectAssociated();
  await expect(next).toBeFocused();
});

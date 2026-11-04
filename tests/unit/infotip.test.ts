import { describe, expect, it } from 'vitest';
import { closesInfoTip, infoTipName } from '../../src/scripts/infotip';

// The ⓘ button (src/components/InfoTip.astro). Opening and closing in the page is tested in tests/e2e.
describe('the ⓘ button', () => {
  it('is named "more about <label>"', () => {
    expect(infoTipName('cards')).toBe('more about cards');
    expect(infoTipName('label it')).toBe('more about label it');
  });

  it('closes on Escape only while open; Enter and Space are left to the button', () => {
    expect(closesInfoTip('Escape', true)).toBe(true);
    expect(closesInfoTip('Esc', true)).toBe(true);
    expect(closesInfoTip('Escape', false)).toBe(false);
    expect(closesInfoTip('Enter', true)).toBe(false);
    expect(closesInfoTip(' ', true)).toBe(false);
    expect(closesInfoTip('Tab', true)).toBe(false);
  });
});

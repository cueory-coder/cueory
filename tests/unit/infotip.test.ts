import { describe, expect, it } from 'vitest';
import { changedInfoTipText, closesInfoTip, infoTipName, nextOpenInfoTip } from '../../src/scripts/infotip';

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

  it('toggles one tip, and opening another replaces the first', () => {
    expect(nextOpenInfoTip(null, { type: 'toggle', id: 'cards' })).toBe('cards');
    expect(nextOpenInfoTip('cards', { type: 'toggle', id: 'learn' })).toBe('learn');
    expect(nextOpenInfoTip('cards', { type: 'toggle', id: 'cards' })).toBeNull();
  });

  it('only closes for an outside tap, not one inside the open panel', () => {
    expect(nextOpenInfoTip('cards', { type: 'outside', insideOpenPanel: true })).toBe('cards');
    expect(nextOpenInfoTip('cards', { type: 'outside', insideOpenPanel: false })).toBeNull();
    expect(nextOpenInfoTip(null, { type: 'outside', insideOpenPanel: false })).toBeNull();
  });

  it('Escape closes the active tip without changing unrelated keys', () => {
    expect(nextOpenInfoTip('cards', { type: 'escape' })).toBeNull();
    expect(nextOpenInfoTip(null, { type: 'escape' })).toBeNull();
  });

  it('keeps another tip closed after repeated outside actions and Escape', () => {
    const current = nextOpenInfoTip('cards', { type: 'toggle', id: 'learn' });
    expect(current).toBe('learn');
    expect(nextOpenInfoTip(current, { type: 'outside', insideOpenPanel: true })).toBe('learn');
    expect(nextOpenInfoTip(current, { type: 'outside', insideOpenPanel: false })).toBeNull();
    expect(nextOpenInfoTip(null, { type: 'escape' })).toBeNull();
  });

  it('does not reannounce whitespace-only edits, even with nonbreaking spaces', () => {
    expect(changedInfoTipText('[sample words]', ' [sample\u00a0words] ', true)).toBeNull();
    expect(changedInfoTipText('[sample words]', '\n  ', true)).toBeNull();
  });

  it('announces new visible words only when a tip is open', () => {
    expect(changedInfoTipText('old wording', '[sample new wording]', true)).toBe('[sample new wording]');
    expect(changedInfoTipText('old wording', '[sample new wording]', false)).toBeNull();
    expect(changedInfoTipText('same  wording', 'same wording', true)).toBeNull();
    expect(changedInfoTipText('old wording', ' ', true)).toBeNull();
    expect(changedInfoTipText('old wording', '  [sample line]\n [sample more] ', true))
      .toBe('[sample line] [sample more]');
  });
});

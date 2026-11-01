import { describe, expect, it } from 'vitest';
import { accountMenu, initialsFor, type AccountState } from '../../src/islands/account';

// All names, schools and addresses below are synthetic display samples.
describe('account initials', () => {
  it.each([
    ['sam lee', 'SL'],
    ['  sam\t\n lee  ', 'SL'],
    ['Ana María de la Cruz', 'AC'],
    ['sam', 'S'],
    ['éloïse álvarez', 'ÉÁ'],
    ['e\u0301loïse a\u0301lvarez', 'E\u0301A\u0301'],
    ['سارة علي', 'سع'],
    ['王 小明', '王小'],
    ['小明', '小'],
    ['👩🏽‍⚕️ sample', '👩🏽‍⚕️S'],
    ['👨‍👩‍👧‍👦', '👨‍👩‍👧‍👦'],
    ['🇵🇭 sample', '🇵🇭S'],
    ["'ana — cruz", 'AC'],
  ])('uses visible first and last initials for sample name %s', (name, expected) => {
    expect(initialsFor(name, 'unused@example.invalid')).toBe(expected);
  });

  it.each([null, '', ' \t\n ', '---', '\u200b\u200d', '\u0301'])('falls back from unusable sample name %j', name => {
    expect(initialsFor(name, 'élève@example.invalid')).toBe('É');
  });

  it.each([
    ['sample@example.invalid', 'S'],
    ['..sample+tag@example.invalid', 'S'],
    ['👩🏽‍⚕️@example.invalid', '👩🏽‍⚕️'],
    ['王@example.invalid', '王'],
    ['', '?'],
    ['@example.invalid', '?'],
    ['+++@example.invalid', '?'],
    ['\u200d@example.invalid', '?'],
  ])('uses only the sample email local part %j', (email, expected) => {
    expect(initialsFor(null, email)).toBe(expected);
  });

  it('caps uppercase expansions and multi-code-point emoji at two visible characters', () => {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const name of ['ß sample', 'ﬃ sample', '👩🏽‍⚕️ sample 👨‍👩‍👧‍👦', 'e\u0301 sample a\u0301']) {
      expect([...segmenter.segment(initialsFor(name, 'unused@example.invalid'))].length).toBeLessThanOrEqual(2);
    }
    expect(initialsFor('ß sample', '')).toBe('SS');
    expect(initialsFor('ß cruz', '')).toBe('SC');
    expect(initialsFor('ß', '')).toBe('S');
  });
});

describe('account menu', () => {
  it('lists the two signed-out actions in order', () => {
    expect(accountMenu({ signedIn: false })).toEqual([
      { id: 'create-account', label: 'create free account' },
      { id: 'sign-in', label: 'sign in' },
    ]);
  });

  it('preserves the sample name and school exactly, before the signed-in actions', () => {
    const state = Object.freeze({ signedIn: true as const, displayName: '  Sample Ána  ', onboarding: Object.freeze({ school: '  Sample School of Nursing  ' }) });
    expect(accountMenu(state)).toEqual([
      { id: 'name', label: '  Sample Ána  ' },
      { id: 'school', label: '  Sample School of Nursing  ' },
      { id: 'profile', label: 'see profile' },
      { id: 'settings', label: 'account settings' },
      { id: 'sign-out', label: 'sign out' },
    ]);
    expect(state.onboarding.school).toBe('  Sample School of Nursing  ');
  });

  it.each([undefined, null, {}, { school: undefined }, { school: null }, { school: '' }, { school: ' \t ' }])('omits an unanswered school %j', onboarding => {
    expect(accountMenu({ signedIn: true, displayName: 'Sample', onboarding }).map(item => item.id))
      .toEqual(['name', 'profile', 'settings', 'sign-out']);
  });

  it('returns fresh arrays and items without inventing routes or mutating state', () => {
    const state: AccountState = Object.freeze({ signedIn: true, displayName: 'Sample', onboarding: Object.freeze({ school: 'Sample School' }) });
    const first = accountMenu(state);
    first[0].label = 'changed';
    first.pop();
    expect(accountMenu(state).map(item => item.label)).toEqual(['Sample', 'Sample School', 'see profile', 'account settings', 'sign out']);
    expect(accountMenu({ signedIn: false })).not.toBe(accountMenu({ signedIn: false }));
    expect(accountMenu(state).every(item => !Object.hasOwn(item, 'href'))).toBe(true);
  });
});

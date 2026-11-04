import { describe, expect, it } from 'vitest';
import { accountHref, accountLaunch, accountsOpen, promo } from '../../src/config/site';
import { cornerView } from '../../src/scripts/accountcorner';

describe('account launch wording', () => {
  it('ships with launch wording off and preserves the launch-list promo', () => {
    expect(accountsOpen).toBe(false);
    expect(accountHref).toBe('/#signup');
    expect(promo.joinLabel).toBe('join the launch list');
  });

  it('uses the planned signup destination and promo wording when open', () => {
    expect(accountLaunch(true)).toEqual({
      accountHref: '/signup', signInHref: '/signin', promoJoinLabel: 'create your free account',
    });
  });

  it.each([false, true])('uses separate launch links with runtime accounts enabled: %s', (enabled) => {
    expect(cornerView({ signedIn: false }, null, enabled, true).items).toEqual([
      { id: 'create-account', label: 'create free account', href: '/signup' },
      { id: 'sign-in', label: 'sign in', href: '/signin' },
    ]);
  });

  it('keeps runtime account availability independent from launch wording', () => {
    const view = cornerView({ signedIn: true, userId: 'sample-id', email: 'sample@example.invalid' }, null, false, true);
    expect(view.accountsEnabled).toBe(false);
    expect(view.account).toEqual({ signedIn: false });
    expect(view.initials).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { accountHref } from '../../src/config/site';
import {
  cornerState,
  cornerView,
  loadCorner,
  type CornerProfile,
} from '../../src/scripts/accountcorner';
import type { SessionState } from '../../src/islands/supabaseclient';

const session: SessionState = { signedIn: true, userId: 'sample-user-id', email: 'sara@example.invalid' };

describe('account corner state', () => {
  it('ignores a profile when signed out', () => {
    expect(cornerState({ signedIn: false }, { display_name: 'not displayed' }))
      .toEqual({ signedIn: false });
  });

  it('uses the own profile name and supplied school', () => {
    const profile: CornerProfile = {
      display_name: '  Sara Valdez  ',
      onboarding: { school: 'Sample School of Nursing' },
    };
    expect(cornerState(session, profile)).toEqual({
      signedIn: true,
      displayName: '  Sara Valdez  ',
      onboarding: { school: 'Sample School of Nursing' },
    });
    const view = cornerView(session, profile, true);
    expect(view.initials).toBe('SV');
    expect(view.items.map((item) => item.label)).toEqual([
      '  Sara Valdez  ',
      'Sample School of Nursing',
      'see profile',
      'account settings',
      'sign out',
    ]);
    expect(view.items.filter((item) => item.href).map((item) => [item.id, item.href])).toEqual([
      ['profile', '/account'],
      ['settings', '/account'],
    ]);
    expect(view.items.find((item) => item.id === 'sign-out')?.href).toBeUndefined();
  });

  it.each([null, {}, { display_name: null }, { display_name: '   ' }])(
    'uses email initials but never exposes the email as a menu label for profile %j',
    (profile) => {
      const view = cornerView(session, profile, true);
      expect(view.initials).toBe('S');
      expect(view.account).toEqual({ signedIn: true, displayName: 'your account' });
      expect(view.items.map((item) => item.label)).toEqual([
        'your account', 'see profile', 'account settings', 'sign out',
      ]);
      expect(JSON.stringify(view.items)).not.toContain(session.signedIn ? session.email : '');
    },
  );

  it('does not display an empty school or a school that was not returned', () => {
    expect(cornerView(session, { display_name: 'S', onboarding: { school: '   ' } }, true)
      .items.map((item) => item.id)).not.toContain('school');
    expect(cornerView(session, { display_name: 'S' }, true)
      .items.map((item) => item.id)).not.toContain('school');
  });

  it('keeps accounts-off links and "coming soon" wording unchanged', () => {
    const view = cornerView({ signedIn: false }, null, false);
    expect(view.initials).toBeNull();
    expect(view.items).toEqual([
      { id: 'create-account', label: 'create free account', href: accountHref, note: 'coming soon' },
      { id: 'sign-in', label: 'sign in', href: accountHref, note: 'coming soon' },
    ]);
  });

  it('routes both signed-out actions to /signin only when a client exists', () => {
    const view = cornerView({ signedIn: false }, null, true);
    expect(view.items).toEqual([
      { id: 'create-account', label: 'create free account', href: '/signin' },
      { id: 'sign-in', label: 'sign in', href: '/signin' },
    ]);
    expect(view.initials).toBeNull();
  });

  it('never shows a signed-in state when accounts are off', () => {
    expect(cornerView(session, { display_name: 'Sample' }, false).account).toEqual({ signedIn: false });
  });
});

describe('idle account loading with injected dependencies', () => {
  it('does not fetch a session or profile if getSupabase returns null', async () => {
    const readSession = vi.fn(async () => session);
    const readProfile = vi.fn(async () => ({ display_name: 'Sample' }));
    const view = await loadCorner(async () => null, readSession, readProfile);
    expect(view).toEqual(cornerView({ signedIn: false }, null, false));
    expect(readSession).not.toHaveBeenCalled();
    expect(readProfile).not.toHaveBeenCalled();
  });

  it('fails closed on a client download failure', async () => {
    await expect(loadCorner(
      async () => { throw new Error('offline'); },
      async () => session,
      async () => ({ display_name: 'Sample' }),
    )).resolves.toEqual(cornerView({ signedIn: false }, null, false));
  });

  it('does not fetch the profile when there is no signed-in user', async () => {
    const readProfile = vi.fn(async () => ({ display_name: 'Sample' }));
    const view = await loadCorner(async () => ({}), async () => ({ signedIn: false }), readProfile);
    expect(view.items.map((item) => item.href)).toEqual(['/signin', '/signin']);
    expect(readProfile).not.toHaveBeenCalled();
  });

  it('uses the signed-in user's id to query only their own profile', async () => {
    const readClient = vi.fn(async () => ({}));
    const readSession = vi.fn(async () => session);
    const readProfile = vi.fn(async () => ({ display_name: 'Sara Valdez' }));
    const view = await loadCorner(readClient, readSession, readProfile);
    expect(readClient).toHaveBeenCalledTimes(1);
    expect(readSession).toHaveBeenCalledTimes(1);
    expect(readProfile).toHaveBeenCalledExactlyOnceWith('sample-user-id');
    expect(view.initials).toBe('SV');
    expect(view.items.find((item) => item.id === 'name')?.label).toBe('Sara Valdez');
  });

  it('recovers safely when the session or optional profile read throws', async () => {
    const badSession = await loadCorner(
      async () => ({}),
      async () => { throw new Error('session read failed'); },
      async () => { throw new Error('should not be called'); },
    );
    expect(badSession).toEqual(cornerView({ signedIn: false }, null, true));

    const badProfile = await loadCorner(
      async () => ({}),
      async () => session,
      async () => { throw new Error('RLS error'); },
    );
    expect(badProfile.initials).toBe('S');
    expect(badProfile.items.find((item) => item.id === 'name')?.label).toBe('your account');
  });
});

describe('account component integration guard', () => {
  const source = readFileSync(new URL('../../src/components/AccountCorner.astro', import.meta.url), 'utf8');

  it('keeps its account panel keyboard and screen-reader controls', () => {
    expect(source).toContain('aria-expanded="false"');
    expect(source).toContain('aria-controls="account-menu"');
    expect(source).toContain('data-account-toggle');
    expect(source).toContain('data-account-initials');
    expect(source).toContain('isCloseKey');
    expect(source).toContain('toggle.focus()');
  });

  it('loads the auth client only after idle and uses the shared session helpers', () => {
    expect(source).toContain('requestIdleCallback');
    expect(source).toContain("import('../islands/supabaseclient')");
    expect(source).toContain('getSessionState');
    expect(source).toContain('loadCorner');
    expect(source).toContain("select('display_name')");
    expect(source).toContain("maybeSingle()");
    expect(source).not.toContain("import '@supabase/supabase-js'");
  });

  it('signs out through Supabase and reloads after success', () => {
    expect(source).toContain("auth.signOut({ scope: 'local' })");
    expect(source).toContain('window.location.reload()');
    expect(source).toContain('data-account-message');
  });
});

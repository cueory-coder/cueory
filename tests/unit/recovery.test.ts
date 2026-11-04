import { describe, expect, it, vi } from 'vitest';
import { establishRecovery, type RecoveryAuth } from '../../src/islands/recovery';

// Fake, clearly non-secret values only.
const ORIGIN = 'https://cueory.app';
const at = (query: string) => `${ORIGIN}/reset-password${query}`;
const session = (id: string) => ({ access_token: 'fake-access-token', user: { id } });
type Listener = Parameters<RecoveryAuth['onAuthStateChange']>[0];

/** A fake auth client. `emit` is the event the exchange fires, as supabase-js does before resolving. */
function fakeAuth({ emit = 'SIGNED_IN', eventUser = 'fake-user-1', redirectType = null as string | null,
  error = null as unknown, user = 'fake-user-1' as string | null } = {}) {
  const listeners = new Set<Listener>();
  const unsubscribe = vi.fn();
  const auth = {
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener);
      listener('INITIAL_SESSION', null);
      return { data: { subscription: { unsubscribe: () => { listeners.delete(listener); unsubscribe(); } } } };
    }),
    exchangeCodeForSession: vi.fn(async () => {
      if (error || !user) return { data: { session: null, user: null, redirectType: null }, error };
      for (const listener of listeners) listener(emit, session(eventUser));
      return { data: { session: session(user), user: session(user).user, redirectType }, error: null };
    }),
    updateUser: vi.fn(),
  } satisfies RecoveryAuth;
  return { auth, unsubscribe };
}

describe('establishRecovery (reset form gating)', () => {
  it('opens the form when the exchange emits PASSWORD_RECOVERY for the same user', async () => {
    const { auth, unsubscribe } = fakeAuth({ emit: 'PASSWORD_RECOVERY' });
    expect(await establishRecovery(async () => auth, at('?code=fake-code-1'))).toEqual({ kind: 'ready', auth });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('fake-code-1');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('opens the form when the exchange reports a recovery redirect', async () => {
    const { auth } = fakeAuth({ redirectType: 'recovery' });
    expect((await establishRecovery(async () => auth, at('?code=fake-code-1'))).kind).toBe('ready');
  });

  it('keeps the form closed for an ordinary sign-in code', async () => {
    const { auth, unsubscribe } = fakeAuth({ emit: 'SIGNED_IN' });
    expect(await establishRecovery(async () => auth, at('?code=fake-code-1'))).toEqual({ kind: 'required' });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores a PASSWORD_RECOVERY event for a different user', async () => {
    const { auth } = fakeAuth({ emit: 'PASSWORD_RECOVERY', eventUser: 'fake-user-2' });
    expect(await establishRecovery(async () => auth, at('?code=fake-code-1'))).toEqual({ kind: 'required' });
  });

  it.each([
    ['no code', ''],
    ['URL flags alone', '?recovery=1&type=recovery&recoveryReady=true&redirectType=recovery'],
    ['a provider error', '?code=fake-code-1&error=access_denied'],
  ])('never exchanges or opens with %s', async (_label, query) => {
    const { auth } = fakeAuth({ emit: 'PASSWORD_RECOVERY', redirectType: 'recovery' });
    expect(await establishRecovery(async () => auth, at(query))).toEqual({ kind: 'required' });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it.each([
    ['a returned error', { error: { message: 'provider-private-detail' } }],
    ['no session', { user: null }],
  ])('keeps the form closed on %s', async (_label, options) => {
    const { auth, unsubscribe } = fakeAuth({ ...options, emit: 'PASSWORD_RECOVERY', redirectType: 'recovery' });
    const result = await establishRecovery(async () => auth, at('?code=fake-code-1'));
    expect(result).toEqual({ kind: 'required' });
    expect(JSON.stringify(result)).not.toContain('provider-private-detail');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps the form closed and unsubscribes when the exchange throws', async () => {
    const { auth, unsubscribe } = fakeAuth();
    auth.exchangeCodeForSession.mockRejectedValue(new Error('provider-private-detail'));
    expect(await establishRecovery(async () => auth, at('?code=fake-code-1'))).toEqual({ kind: 'required' });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps the form closed when the client download fails', async () => {
    expect(await establishRecovery(() => Promise.reject(new Error('download failed')), at('?code=fake-code-1')))
      .toEqual({ kind: 'required' });
  });

  it('reports accounts off when the build has no client', async () => {
    expect(await establishRecovery(async () => null, at('?code=fake-code-1'))).toEqual({ kind: 'unavailable' });
    expect(await establishRecovery(async () => null, at(''))).toEqual({ kind: 'unavailable' });
  });
});

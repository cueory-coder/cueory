/**
 * Decides whether /reset-password may show the "choose a new password" form (Task 165).
 *
 * The reset email links straight to /reset-password with a one-time PKCE code. The form opens only when this page
 * exchanges that code itself and supabase-js reports a recovery sign-in: it emits `PASSWORD_RECOVERY` for the same
 * user, or returns `redirectType: 'recovery'`. Both come from the code verifier that `resetPasswordForEmail` stored in
 * this browser (@supabase/auth-js 2.118, `_exchangeCodeForSession`). A URL parameter, an ordinary session or another
 * kind of code never opens it.
 */
import { exchangedUserId, readCallback, type AuthLoader, type CodeExchangeAuth } from './authcallback';
import type { ResetPasswordAuth } from './signin';

export interface RecoveryAuth extends CodeExchangeAuth, ResetPasswordAuth {
  onAuthStateChange(callback: (event: string, session: { user?: { id?: string } } | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
}

export type RecoveryResult = { kind: 'ready'; auth: RecoveryAuth } | { kind: 'required' } | { kind: 'unavailable' };

export async function establishRecovery(load: AuthLoader<RecoveryAuth>, href: string): Promise<RecoveryResult> {
  const callback = readCallback(href);
  let subscription: { unsubscribe(): void } | undefined;
  try {
    const auth = await load();
    if (!auth) return { kind: 'unavailable' };
    if (callback.kind !== 'code') return { kind: 'required' };
    let recoveryUser: string | null = null;
    // Synchronous on purpose: the callback only records the event (supabase-js deprecates async callbacks).
    subscription = auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recoveryUser = typeof session?.user?.id === 'string' ? session.user.id : null;
    }).data.subscription;
    const { data, error } = await auth.exchangeCodeForSession(callback.code);
    const userId = exchangedUserId(data);
    if (error || !userId) return { kind: 'required' };
    const typed = (data as { redirectType?: unknown }).redirectType === 'recovery';
    return typed || recoveryUser === userId ? { kind: 'ready', auth } : { kind: 'required' };
  } catch {
    return { kind: 'required' };
  } finally {
    subscription?.unsubscribe();
  }
}

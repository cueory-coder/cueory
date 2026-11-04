import { useEffect, useRef, useState } from 'react';
import { CALLBACK_ERROR, cleanCallbackUrl, finishCallback, type CallbackOutcome, type CodeExchangeAuth } from './authcallback';
import { getSupabase } from './supabaseclient';
import { afterSignIn, type LevelReader } from './twofactor';

export type { CodeExchangeAuth } from './authcallback';

type Feedback = { kind: 'working' } | { kind: 'unavailable' } | { kind: 'error' };

/** One fixed sentence on failure: nothing from the address or the provider is ever rendered. */
export function CallbackFeedback({ state }: { state: Feedback }) {
  return <div aria-live="polite" className="mt-4 text-ink">
    {state.kind === 'working' && <p role="status">checking your sign-in…</p>}
    {state.kind === 'unavailable' && <p>accounts open soon. sign-in isn't available yet.</p>}
    {state.kind === 'error' && <p role="alert">{CALLBACK_ERROR}</p>}
    {state.kind === 'unavailable' && <p className="mt-4"><a href="/#signup">back to home</a></p>}
    {state.kind === 'error' && <p className="mt-4"><a href="/signin">back to sign in</a></p>}
  </div>;
}

/**
 * Finishes a PKCE sign-in on the student's device with the shared client (Task 55). An omitted `auth` uses
 * `getSupabase()`; explicit null keeps accounts off. The code is removed from the address once the exchange settles
 * (supabase-js reads the address during the exchange), then the student goes to the checked `next` path.
 */
export default function AuthCallback({ auth: suppliedAuth }: { auth?: CodeExchangeAuth | null }) {
  const [state, setState] = useState<Feedback>({ kind: 'working' });
  // React Strict Mode may run effects twice. Exchange a single-use code only once per mounted island.
  const started = useRef<Promise<CallbackOutcome> | null>(null);
  // Use the client from the verified PKCE exchange for the optional two-factor check.
  const levelReader = useRef<LevelReader | null>(null);

  useEffect(() => {
    let active = true;
    if (!started.current) {
      const load = suppliedAuth !== undefined
        ? () => Promise.resolve(suppliedAuth)
        // Keep the auth object intact: its methods rely on their receiver.
        : async () => (await getSupabase())?.auth ?? null;
      started.current = finishCallback(async () => {
        const client = await load();
        // Injected fakes may omit MFA methods; afterSignIn handles this safely.
        levelReader.current = client as unknown as LevelReader | null;
        return client;
      }, window.location.href).finally(() => {
        window.history.replaceState(window.history.state, '', cleanCallbackUrl(window.location.href));
      });
    }
    void started.current.then(async outcome => {
      if (!active) return;
      if (outcome.kind === 'redirect') {
        // Check MFA only after the code exchange confirms the authenticated user.
        const destination = await afterSignIn(levelReader.current, outcome.next, window.location.origin);
        if (active) window.location.replace(destination);
      } else setState(outcome);
    }).catch(() => { if (active) setState({ kind: 'error' }); });
    return () => { active = false; };
  }, [suppliedAuth]);

  return <CallbackFeedback state={state} />;
}

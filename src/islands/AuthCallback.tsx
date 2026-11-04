import { useEffect, useRef, useState } from 'react';
import { CALLBACK_ERROR, cleanCallbackUrl, finishCallback, type CallbackOutcome, type CodeExchangeAuth } from './authcallback';
import { getSupabase } from './supabaseclient';

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

  useEffect(() => {
    let active = true;
    if (!started.current) {
      const load = suppliedAuth !== undefined
        ? () => Promise.resolve(suppliedAuth)
        // Keep the auth object intact: its methods rely on their receiver.
        : async () => (await getSupabase())?.auth ?? null;
      started.current = finishCallback(load, window.location.href).finally(() => {
        window.history.replaceState(window.history.state, '', cleanCallbackUrl(window.location.href));
      });
    }
    void started.current.then(outcome => {
      if (!active) return;
      if (outcome.kind === 'redirect') window.location.replace(outcome.next);
      else setState(outcome);
    });
    return () => { active = false; };
  }, [suppliedAuth]);

  return <CallbackFeedback state={state} />;
}

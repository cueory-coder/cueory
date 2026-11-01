import { useEffect, useRef, useState } from 'react';
import { cleanCallbackUrl, readCallback } from './authcallback';

/** Supabase's auth.exchangeCodeForSession shape, injected so accounts can stay off until Task 55 lands. */
export interface ExchangeAuth {
  exchangeCodeForSession(code: string): Promise<{ error: { message: string } | null }>;
}

type Feedback =
  | { kind: 'working' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

const RETRY_MESSAGE = "we couldn't finish signing you in. please try again.";

/** Keeping the message as a React text child (never HTML) protects provider error descriptions. */
export function CallbackFeedback({ state }: { state: Feedback }) {
  return <div aria-live="polite" className="mt-4 text-ink">
    {state.kind === 'working' && <p role="status">checking your sign-in…</p>}
    {state.kind === 'unavailable' && <p>accounts open soon. sign-in isn't available yet.</p>}
    {state.kind === 'error' && <p role="alert">{state.message}</p>}
    {state.kind !== 'working' && <p className="mt-4"><a href="/signin">back to sign in</a></p>}
  </div>;
}

/**
 * Finishes a PKCE login on the student's device. The real client is injected after Task 55 is in staging.
 * Until then the page cannot exchange any code and shows a calm accounts-off message.
 */
export default function AuthCallback({ auth = null }: { auth?: ExchangeAuth | null }) {
  const [state, setState] = useState<Feedback>({ kind: 'working' });
  // React Strict Mode may run effects twice. Exchange a single-use code only once per mounted island.
  const callbackRef = useRef<ReturnType<typeof readCallback> | null>(null);
  const exchange = useRef<{ code: string; promise: ReturnType<ExchangeAuth['exchangeCodeForSession']> } | null>(null);

  useEffect(() => {
    // Remember the first URL in development Strict Mode: clearing the query must not change a re-run's result.
    if (!callbackRef.current) callbackRef.current = readCallback(window.location.href);
    const callback = callbackRef.current;
    const clearCode = () => window.history.replaceState(window.history.state, '', cleanCallbackUrl(window.location.href));
    if (callback.kind === 'error') {
      clearCode();
      setState({ kind: 'error', message: callback.message });
      return;
    }
    if (callback.kind === 'nothing') {
      clearCode();
      setState({ kind: 'error', message: 'this sign-in link has no code. please start again.' });
      return;
    }
    if (!auth) {
      clearCode();
      setState({ kind: 'unavailable' });
      return;
    }

    let active = true;
    if (!exchange.current || exchange.current.code !== callback.code) {
      try {
        exchange.current = { code: callback.code, promise: auth.exchangeCodeForSession(callback.code) };
      } catch {
        clearCode();
        setState({ kind: 'error', message: RETRY_MESSAGE });
        return;
      }
    }

    void exchange.current.promise.then(({ error }) => {
      if (!active) return;
      clearCode();
      if (error) setState({ kind: 'error', message: RETRY_MESSAGE });
      else window.location.replace(callback.next);
    }).catch(() => {
      if (!active) return;
      clearCode();
      setState({ kind: 'error', message: RETRY_MESSAGE });
    });
    return () => { active = false; };
  }, [auth]);

  return <CallbackFeedback state={state} />;
}

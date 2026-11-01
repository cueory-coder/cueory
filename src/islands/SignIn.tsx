import { useEffect, useId, useRef, useState } from 'react';
import { checkEmail, resendSeconds, safeNext, signInMessage } from './signin';

/** The small injected interface matches Supabase v2 without loading its package here. */
export interface SignInAuth {
  signInWithOAuth(credentials: {
    provider: 'google'; options: { redirectTo: string };
  }): Promise<{ error: { status?: number } | null }>;
  signInWithOtp(credentials: {
    email: string; options: { emailRedirectTo: string };
  }): Promise<{ error: { status?: number } | null }>;
}

interface Props { auth?: SignInAuth | null }
const button = 'min-h-11 w-full rounded-md border border-control px-4 py-3 aria-disabled:opacity-50';

// Task 55 owns the client. Keep accounts closed until it lands in staging, then replace this null default
// with getSupabase() in a browser effect. Never create another client or import its unmerged branch.
export default function SignIn({ auth = null }: Props) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<'google' | 'email' | null>(null);
  const [seconds, setSeconds] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const deadline = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (seconds === 0) return;
    const timer = window.setInterval(() => setSeconds(resendSeconds(deadline.current, Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [seconds > 0]);

  const callbackUrl = () => {
    const { origin, search } = window.location;
    const next = safeNext(new URLSearchParams(search).get('next'), origin);
    const callback = new URL('/auth/callback', origin);
    callback.searchParams.set('next', next);
    return callback.href;
  };

  const submit = async (kind: 'google' | 'email') => {
    if (!auth || busy.current || (kind === 'email' && resendSeconds(deadline.current, Date.now()) > 0)) return;
    if (kind === 'email') {
      const error = checkEmail(email);
      setProblem(error);
      if (error) { setMessage(''); field.current?.focus(); return; }
    }
    busy.current = true;
    setPending(kind);
    setMessage('');
    setProblem(null);
    try {
      const redirect = callbackUrl();
      const { error } = kind === 'google'
        ? await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect } })
        : await auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } });
      if (!mounted.current) return;
      if (error) {
        setMessage(signInMessage(error.status === 429 ? 'too-many' : kind === 'google' ? 'google-failed' : 'email-failed'));
      } else if (kind === 'email') {
        deadline.current = Date.now() + 60_000;
        setSeconds(60);
        setEmail('');
        setMessage(signInMessage('sent'));
      } else {
        // Supabase redirects the browser on OAuth success. Keep both actions locked until it leaves.
        return;
      }
    } catch {
      if (mounted.current) setMessage(signInMessage(kind === 'google' ? 'google-failed' : 'email-failed'));
    }
    busy.current = false;
    if (mounted.current) setPending(null);
  };

  if (!auth) return <div data-testid="signin-unavailable">
    <p className="text-ink-soft">{signInMessage('unavailable')}</p>
    <a href="/#signup" className="mt-4 inline-flex min-h-11 items-center">get launch updates</a>
  </div>;

  return <div>
    <button type="button" className={`${button} bg-button text-on-button hover:bg-button-hover`}
      aria-disabled={pending !== null} onClick={() => { void submit('google'); }}>
      {pending === 'google' ? 'opening google…' : 'continue with google'}
    </button>
    <p className="mt-3 text-sm text-ink-soft">google sign-in takes you to google. or use an email link below.</p>
    <form className="mt-6" noValidate onSubmit={event => { event.preventDefault(); void submit('email'); }}>
      <label htmlFor={`${id}-email`} className="block">email address</label>
      <input ref={field} id={`${id}-email`} type="email" name="email" autoComplete="email" inputMode="email"
        required maxLength={254} value={email} readOnly={pending !== null}
        onChange={event => { setEmail(event.target.value); setProblem(null); }}
        aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-error` : undefined}
        className="mt-2 block min-h-11 w-full rounded-md border border-control bg-page px-4 py-3 text-ink" />
      {problem && <p id={`${id}-error`} role="alert" className="mt-2 text-sm">{problem}</p>}
      {/* aria-disabled keeps keyboard focus on the button while the guarded action is unavailable. */}
      <button type="submit" className={`${button} mt-4 bg-page text-ink`}
        aria-disabled={pending !== null || seconds > 0} aria-describedby={seconds > 0 ? `${id}-countdown` : undefined}>
        {pending === 'email' ? 'sending your link…' : 'email me a sign-in link'}
      </button>
      {seconds > 0 && <p id={`${id}-countdown`} className="mt-2 text-sm text-ink-soft">
        you can send another link in {seconds} {seconds === 1 ? 'second' : 'seconds'}.
      </p>}
    </form>
    <p role="status" aria-atomic="true" className="mt-3 text-sm">{message}</p>
  </div>;
}

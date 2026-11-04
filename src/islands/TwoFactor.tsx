import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AccountsUnavailable, authButton, authInput } from './SignIn.tsx';
import { getSupabase } from './supabaseclient';
import {
  TWO_FACTOR_PATH, cancelEnroll, confirmCode, groupSecret, readStatus, removeFactor, returnPath, startEnroll,
  type Enrollment, type TwoFactorAuth, type TwoFactorStatus,
} from './twofactor';

type Screen =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'load-failed' }
  | TwoFactorStatus
  | { kind: 'enrolling'; enrollment: Enrollment }
  | { kind: 'removing'; factorId: string };

const primary = `${authButton} bg-button text-on-button hover:bg-button-hover`;
const secondary = `${authButton} bg-page text-ink`;

interface Props { auth?: TwoFactorAuth | null }

/**
 * /account/two-factor (Task 301): add an authenticator app, enter its code when signing in, or remove it.
 * An omitted client uses the shared one after hydration; explicit null keeps accounts off. Logic is in twofactor.ts.
 */
export default function TwoFactor({ auth: supplied }: Props) {
  const id = useId();
  const [auth, setAuth] = useState<TwoFactorAuth | null | undefined>(supplied);
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const busy = useRef(false);
  const focusTarget = useRef<HTMLElement | null>(null);
  const shouldFocus = useRef(false);

  useEffect(() => {
    setNext(returnPath(window.location.search, window.location.origin));
  }, []);

  useEffect(() => {
    let active = true;
    setScreen({ kind: 'loading' });
    const load = async () => {
      let client: TwoFactorAuth | null;
      if (supplied !== undefined) client = supplied;
      else {
        // Keep the auth object intact: its methods rely on their receiver.
        const shared = await getSupabase();
        client = shared ? (shared.auth as unknown as TwoFactorAuth) : null;
      }
      if (!active) return;
      setAuth(client);
      if (!client) { setScreen({ kind: 'unavailable' }); return; }
      const status = await readStatus(client);
      if (!active) return;
      // Arriving to enter a code (after signing in, or from /admin/flags): the code field is the one thing to do.
      if (status.kind === 'needs-code') shouldFocus.current = true;
      setScreen(status.kind === 'failed' ? { kind: 'load-failed' } : status);
    };
    load().catch(() => { if (active) setScreen({ kind: 'load-failed' }); });
    return () => { active = false; };
  }, [supplied, attempt]);

  // After a change of screen, move focus to its heading or field, so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    focusTarget.current?.focus();
  });

  const show = (value: Screen, message = '') => {
    setCode('');
    setProblem('');
    setNotice(message);
    shouldFocus.current = true;
    setScreen(value);
  };

  const run = async (task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try { await task(); } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const begin = () => run(async () => {
    if (!auth) return;
    setNotice('');
    const enrollment = await startEnroll(auth);
    if (enrollment) show({ kind: 'enrolling', enrollment });
    else setNotice('two-factor could not be started. please try again.');
  });

  const cancel = (factorId: string) => run(async () => {
    if (!auth) return;
    await cancelEnroll(auth, factorId);
    show({ kind: 'off' }, 'two-factor was not turned on.');
  });

  const submitCode = () => run(async () => {
    if (!auth) return;
    if (screen.kind === 'enrolling' || screen.kind === 'needs-code') {
      const factorId = screen.kind === 'enrolling' ? screen.enrollment.factorId : screen.factorId;
      const result = await confirmCode(auth, factorId, code);
      if (!result.ok) { setProblem(result.message); setCode(''); focusTarget.current?.focus(); return; }
      if (next) { window.location.assign(next); return; }
      show({ kind: 'on', factorId }, screen.kind === 'enrolling' ? 'two-factor is now on.' : 'thanks, you’re signed in with two-factor.');
    } else if (screen.kind === 'removing') {
      const result = await removeFactor(auth, screen.factorId, code);
      if (!result.ok) {
        if (result.problem === 'session-reset') {
          // A failed refresh forced local sign-out; do not leave a stale authenticated screen.
          show({ kind: 'signed-out' }, result.message);
          return;
        }
        setProblem(result.message); setCode(''); focusTarget.current?.focus(); return;
      }
      show({ kind: 'off' }, 'two-factor is off.');
    }
  });

  const signInHref = `/signin?next=${encodeURIComponent(next ? `${TWO_FACTOR_PATH}?next=${encodeURIComponent(next)}` : TWO_FACTOR_PATH)}`;

  const codeForm = (label: string, submitLabel: string, extra?: ReactNode) => (
    <form noValidate className="mt-6 space-y-4" onSubmit={event => { event.preventDefault(); void submitCode(); }}>
      <div>
        <label htmlFor={`${id}-code`} className="block">{label}</label>
        <input ref={el => { focusTarget.current = el; }} id={`${id}-code`} name="code" inputMode="numeric"
          autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={9} required value={code} readOnly={pending}
          onChange={event => { setCode(event.target.value); setProblem(''); }}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-code-hint${problem ? ` ${id}-code-error` : ''}`}
          className={authInput} />
        <p id={`${id}-code-hint`} className="mt-2 text-sm text-ink-soft">6 digits. a new code appears in the app every 30 seconds.</p>
        {problem && <p id={`${id}-code-error`} role="alert" className="mt-2 text-sm">{problem}</p>}
      </div>
      <button type="submit" className={primary} aria-disabled={pending}>{pending ? 'checking…' : submitLabel}</button>
      {extra}
    </form>
  );

  const heading = (text: string) => (
    <h2 ref={el => { if (screen.kind === 'on' || screen.kind === 'off' || screen.kind === 'signed-out') focusTarget.current = el; }}
      tabIndex={-1} className="text-lg leading-relaxed">{text}</h2>
  );

  return <div className="font-body leading-relaxed" data-testid="two-factor">
    {screen.kind === 'loading' && <p role="status">checking two-factor…</p>}
    {screen.kind === 'unavailable' && <AccountsUnavailable />}
    {(screen.kind === 'load-failed' || screen.kind === 'failed') && <div>
      <p role="alert">two-factor settings could not load. please try again.</p>
      <button type="button" className={`${primary} mt-4`} onClick={() => setAttempt(n => n + 1)}>try again</button>
    </div>}

    {screen.kind === 'signed-out' && <div>
      {heading('sign in first')}
      <p className="mt-2">two-factor is a setting on your account, so you need to be signed in.</p>
      <a href={signInHref} className={`${primary} mt-6`}>sign in</a>
    </div>}

    {screen.kind === 'off' && <div>
      {heading('two-factor is off')}
      <p className="mt-2">
        with two-factor on, signing in also asks for a 6-digit code from an authenticator app on your phone. someone
        who learns your password still can’t get in without your phone.
      </p>
      <button type="button" className={`${primary} mt-6`} aria-disabled={pending} onClick={() => { void begin(); }}>
        {pending ? 'please wait…' : 'turn on two-factor'}
      </button>
    </div>}

    {screen.kind === 'enrolling' && <div>
      <h2 className="text-lg leading-relaxed">add cueory to your authenticator app</h2>
      <ol className="mt-4 list-decimal space-y-4 pl-6">
        <li>open an authenticator app on your phone and choose to add an account.</li>
        <li>
          {screen.enrollment.qr ? 'scan this code with the app, or type the key below.' : 'type this key into the app.'}
          {screen.enrollment.qr && <div className="mt-4 inline-block rounded-lg bg-qr-quiet p-4">
            <img src={screen.enrollment.qr} width={192} height={192} className="block h-48 w-48"
              alt="QR code for adding cueory to an authenticator app. the same key is written out below." />
          </div>}
          <p className="mt-4">key: <code data-testid="two-factor-secret" className="break-all text-lg">{groupSecret(screen.enrollment.secret)}</code></p>
          <p className="mt-2 text-sm text-ink-soft">keep this key private. anyone with it can make your codes.</p>
        </li>
        <li>type the 6-digit code the app shows.</li>
      </ol>
      {codeForm('code from your app', 'turn on',
        <button type="button" className={secondary} aria-disabled={pending}
          onClick={() => { void cancel(screen.enrollment.factorId); }}>cancel</button>)}
      <p className="mt-4 text-sm text-ink-soft">turning two-factor on signs you out of cueory on your other devices.</p>
    </div>}

    {screen.kind === 'needs-code' && <div>
      <h2 className="text-lg leading-relaxed">enter your two-factor code</h2>
      <p className="mt-2">open your authenticator app and type the code it shows for cueory.</p>
      {codeForm('code from your app', 'continue')}
    </div>}

    {screen.kind === 'on' && <div>
      {heading('two-factor is on')}
      <p className="mt-2">when you sign in, you’ll also enter a code from your authenticator app.</p>
      {next && <a href={next} className={`${primary} mt-6`}>continue</a>}
      <button type="button" className={`${secondary} mt-4`} aria-disabled={pending}
        onClick={() => { if (!busy.current) show({ kind: 'removing', factorId: screen.factorId }); }}>remove two-factor</button>
    </div>}

    {screen.kind === 'removing' && <div>
      <h2 className="text-lg leading-relaxed">remove two-factor?</h2>
      <p className="mt-2">
        you’ll sign in with only your password or google. pages for the site owner stay locked until two-factor is
        on again. to confirm, enter a current code from your app.
      </p>
      {codeForm('code from your app', 'remove two-factor',
        <button type="button" className={secondary} aria-disabled={pending}
          onClick={() => { if (!busy.current) show({ kind: 'on', factorId: screen.factorId }); }}>keep it on</button>)}
    </div>}

    <p role="status" aria-atomic="true" className="mt-4 text-sm">{screen.kind === 'loading' ? '' : notice}</p>
  </div>;
}

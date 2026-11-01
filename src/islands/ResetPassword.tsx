import { useEffect, useId, useRef, useState } from 'react';
import { AccountsUnavailable, authButton, PasswordField } from './SignIn.tsx';
import { changePassword, checkPassword, signInMessage, type ResetPasswordAuth } from './signin.ts';

interface Props { auth?: ResetPasswordAuth | null; recoveryReady?: boolean }

// Fail closed until Tasks 55/57 provide the authenticated recovery handoff. URL flags are never proof.
export default function ResetPassword({ auth = null, recoveryReady = false }: Props) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string>();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const submit = async () => {
    if (!auth || !recoveryReady || busy.current || done) return;
    const error = checkPassword(password);
    setProblem(error ?? undefined);
    setMessage('');
    if (error) { form.current?.querySelector('input')?.focus(); return; }
    busy.current = true;
    setPending(true);
    const result = await changePassword(auth, recoveryReady, password);
    if (!mounted.current) return;
    setPassword('');
    setMessage(result.message);
    setDone(result.ok);
    setPending(false);
    busy.current = false;
  };

  if (!auth) return <AccountsUnavailable />;
  if (!recoveryReady) return <div>
    <p>{signInMessage('recovery-required')}</p>
    <a href="/signin?reset=1" className="mt-4 inline-flex min-h-12 items-center underline">request a reset link</a>
  </div>;
  return <div className="font-body leading-relaxed">
    <form ref={form} noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
      <PasswordField id={`${id}-password`} value={password} onChange={value => { setPassword(value); setProblem(undefined); }}
        fresh readOnly={pending || done} problem={problem} />
      <button type="submit" aria-disabled={pending || done}
        className={`${authButton} mt-6 bg-button text-on-button hover:bg-button-hover`}>
        {pending ? 'saving your password…' : done ? 'password changed' : 'save new password'}
      </button>
    </form>
    <p role="status" aria-atomic="true" className="mt-4">{message}</p>
    <a href={done ? '/progress' : '/signin?reset=1'} className="mt-4 inline-flex min-h-12 items-center underline">
      {done ? 'continue to your progress' : 'request a new reset link'}
    </a>
  </div>;
}

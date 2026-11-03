import { useEffect, useId, useRef, useState } from 'react';
import {
  accountMessage, adaptersFor, deleteGate, deleteMyAccount, deletionLines, offerFile, prepareDownload,
  saveDisplayName, signOutHere, type AccountAdapters, type AccountClient, type DownloadFile,
} from './accountsettings';
import { AccountsUnavailable, authButton, authInput } from './SignIn.tsx';
import { getSupabase } from './supabaseclient';
import { localDay } from '../scripts/progress';
import { browserStorage, type KeyValueStorage } from '../scripts/storage';

const primary = `${authButton} bg-button text-on-button hover:bg-button-hover`;

function tabStorage(): KeyValueStorage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

const dom = () => ({ urls: URL, document, later: (run: () => void, ms: number) => window.setTimeout(run, ms) });

type Phase =
  | { kind: 'loading' | 'failed' | 'off' | 'signed-out' }
  | { kind: 'ready'; adapters: AccountAdapters; userId: string; email: string; name: string }
  | { kind: 'deleted'; message: string; next: string };

interface Props {
  /** Tests pass adapters. Omitted, the page uses the shared client; null keeps accounts off. */
  adapters?: AccountAdapters | null;
}

/** /account (Task 59): display name, download my data, delete my account, then sign out. */
export default function AccountSettings({ adapters: supplied }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const deletedRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let adapters = supplied;
      if (adapters === undefined) {
        const client = await getSupabase();
        adapters = client ? adaptersFor(client as unknown as AccountClient) : null;
      }
      if (!active) return;
      if (!adapters) return setPhase({ kind: 'off' });
      const session = await adapters.session();
      if (!active) return;
      if (!session.signedIn) return setPhase({ kind: 'signed-out' });
      const name = await adapters.readName(session.userId).catch(() => null);
      if (active) setPhase({ kind: 'ready', adapters, userId: session.userId, email: session.email, name: name ?? '' });
    };
    setPhase({ kind: 'loading' });
    load().catch(() => { if (active) setPhase({ kind: 'failed' }); });
    return () => { active = false; };
  }, [supplied, attempt]);

  useEffect(() => { if (phase.kind === 'deleted') deletedRef.current?.focus(); }, [phase.kind]);

  if (phase.kind === 'loading') return <p role="status">opening your account…</p>;
  if (phase.kind === 'failed') return <div>
    <p role="alert">{accountMessage('load-failed')}</p>
    <button type="button" className={`${primary} mt-4`} onClick={() => setAttempt(value => value + 1)}>try again</button>
  </div>;
  if (phase.kind === 'off') return <AccountsUnavailable />;
  if (phase.kind === 'signed-out') return <p data-testid="account-signed-out">
    you're signed out. <a href="/signin?next=%2Faccount" className="inline-flex min-h-12 items-center underline">sign in</a>
  </p>;
  if (phase.kind === 'deleted') return <div>
    <p ref={deletedRef} tabIndex={-1} role="status">{phase.message}</p>
    <a href={phase.next} className="mt-4 inline-flex min-h-12 items-center underline">go to the home page</a>
  </div>;
  if (phase.kind !== 'ready') return null;

  return <div className="space-y-10">
    <NameSection adapters={phase.adapters} initial={phase.name} />
    <DataSection adapters={phase.adapters} email={phase.email} />
    <DeleteSection adapters={phase.adapters} email={phase.email}
      onDeleted={(message, next) => setPhase({ kind: 'deleted', message, next })} />
    <SignOutSection adapters={phase.adapters} />
  </div>;
}

function NameSection({ adapters, initial }: { adapters: AccountAdapters; initial: string }) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<{ invalid: boolean; message: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setOutcome(null);
    const result = await saveDisplayName(adapters.writeName, name);
    setSaving(false);
    setOutcome({ invalid: result.kind === 'invalid', message: result.message });
    if (result.kind === 'saved') setName(result.name);
    if (result.kind === 'invalid') input.current?.focus();
  };

  return <section aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`} className="text-xl">display name</h2>
    <form noValidate className="mt-3" onSubmit={event => { event.preventDefault(); void save(); }}>
      <input ref={input} id={`${id}-name`} name="display_name" autoComplete="nickname" maxLength={100}
        aria-labelledby={`${id}-heading`} value={name} readOnly={saving}
        onChange={event => { setName(event.target.value); setOutcome(null); }}
        aria-invalid={outcome?.invalid ? true : undefined}
        aria-describedby={outcome ? `${id}-said` : undefined} className={authInput} />
      <button type="submit" aria-disabled={saving} className={`${primary} mt-4 sm:w-auto sm:px-8`}>
        {saving ? 'saving…' : 'save'}
      </button>
    </form>
    <p id={`${id}-said`} role="status" aria-atomic="true" className="mt-3 text-sm">{outcome?.message}</p>
  </section>;
}

function DataSection({ adapters, email }: { adapters: AccountAdapters; email: string }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState<DownloadFile[] | null>(null);
  const [message, setMessage] = useState('');

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setCsv(null);
    const today = localDay(new Date());
    let signInDetails: unknown;
    try {
      signInDetails = await adapters.signInDetails?.();
    } catch {
      // All or nothing, like the database sections: no file without the sign-in details.
      setBusy(false);
      return setMessage(accountMessage('export-failed'));
    }
    const files = await prepareDownload(adapters.reader, { email, signInDetails, storage: browserStorage(), today });
    setBusy(false);
    if (!files.ok) return setMessage(files.message);
    offerFile(files.json, dom());
    setCsv(files.csv);
    setMessage(accountMessage('export-downloading'));
  };

  const spreadsheets = () => {
    if (!csv) return;
    // One at a time, a moment apart: browsers can drop downloads started together.
    csv.forEach((file, index) => window.setTimeout(() => offerFile(file, dom()), index * 300));
    setMessage(accountMessage('export-csv-downloading'));
  };

  return <section aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`} className="text-xl">your data</h2>
    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
      <button type="button" aria-disabled={busy} className={`${primary} sm:w-auto sm:px-8`} onClick={() => { void download(); }}>
        {busy ? 'getting your data…' : 'download my data'}
      </button>
      {csv && <button type="button" className={`${authButton} sm:w-auto sm:px-8`} onClick={spreadsheets}>
        download spreadsheet files
      </button>}
    </div>
    <p role="status" aria-atomic="true" className="mt-3 text-sm">{message}</p>
  </section>;
}

type Summary = { kind: 'idle' | 'loading' } | { kind: 'lines'; lines: string[] } | { kind: 'failed'; message: string };

function DeleteSection({ adapters, email, onDeleted }: {
  adapters: AccountAdapters; email: string; onDeleted: (message: string, next: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary>({ kind: 'idle' });
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLInputElement>(null);
  const gate = deleteGate(typed);
  const locked = !gate.ready || deleting;

  const show = async () => {
    setOpen(true);
    setSummary({ kind: 'loading' });
    requestAnimationFrame(() => confirm.current?.focus());
    const result = await deletionLines(adapters.reader, { email, storage: browserStorage(), today: localDay(new Date()) });
    setSummary(result.ok ? { kind: 'lines', lines: result.lines } : { kind: 'failed', message: result.message });
  };

  const close = () => {
    if (deleting) return;
    setOpen(false);
    setTyped('');
    setMessage('');
    requestAnimationFrame(() => toggle.current?.focus());
  };

  const remove = async () => {
    if (locked) return;
    setDeleting(true);
    setMessage('');
    const result = await deleteMyAccount({
      typed, deleteAccount: adapters.deleteAccount, signOut: adapters.signOut, local: browserStorage(), session: tabStorage(),
    });
    setDeleting(false);
    if (result.kind === 'deleted') onDeleted(result.message, result.next);
    else setMessage(result.message);
  };

  return <section aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`} className="text-xl">delete account</h2>
    {!adapters.deleteAccount ? <p className="mt-3">{accountMessage('delete-unavailable')}</p> : <>
      <button ref={toggle} type="button" aria-expanded={open} aria-controls={`${id}-panel`}
        className={`${authButton} mt-3 sm:w-auto sm:px-8`} onClick={() => { if (open) close(); else void show(); }}>
        delete my account
      </button>
      <div id={`${id}-panel`} hidden={!open} className="mt-4 rounded-lg border border-line p-5">
        <p>this can't be undone. it removes:</p>
        {summary.kind === 'loading' && <p role="status" className="mt-2 text-ink-soft">checking what's saved…</p>}
        {summary.kind === 'lines' && <ul className="mt-2 list-disc pl-6">
          {summary.lines.map(line => <li key={line}>{line}</li>)}
        </ul>}
        {summary.kind === 'failed' && <p className="mt-2">{summary.message}</p>}
        <form noValidate className="mt-4" onSubmit={event => { event.preventDefault(); void remove(); }}>
          <label htmlFor={`${id}-confirm`}>type delete to confirm</label>
          <input ref={confirm} id={`${id}-confirm`} name="confirm" autoComplete="off" autoCapitalize="none" spellCheck={false}
            maxLength={20} value={typed} readOnly={deleting} onChange={event => { setTyped(event.target.value); setMessage(''); }}
            aria-describedby={gate.hint ? `${id}-hint` : undefined} className={authInput} />
          {gate.hint && <p id={`${id}-hint`} className="mt-2 text-sm">{gate.hint}</p>}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button type="submit" aria-disabled={locked} className={`${primary} sm:w-auto sm:px-8`}>
              {deleting ? 'deleting…' : 'delete my account forever'}
            </button>
            <button type="button" className={`${authButton} sm:w-auto sm:px-8`} onClick={close}>keep my account</button>
          </div>
        </form>
        <p role="status" aria-atomic="true" className="mt-3 text-sm">{message}</p>
      </div>
    </>}
  </section>;
}

function SignOutSection({ adapters }: { adapters: AccountAdapters }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const result = await signOutHere(adapters.signOut);
    if (result.ok) return window.location.assign(result.next);
    setBusy(false);
    setMessage(result.message);
  };

  return <div className="border-t border-line pt-8">
    <button type="button" aria-disabled={busy} className={`${authButton} sm:w-auto sm:px-8`} onClick={() => { void leave(); }}>
      {busy ? 'signing out…' : 'sign out'}
    </button>
    <p role="status" aria-atomic="true" className="mt-3 text-sm">{message}</p>
  </div>;
}

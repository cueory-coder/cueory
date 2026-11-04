import { useEffect, useMemo, useRef, useState } from 'react';
import { groupByItem } from './flaginbox';
import { inboxAdapter } from './adminflagsrpc';
import { getSupabase } from './supabaseclient';
import { codePageFor, needsCode, type LevelReader } from './twofactor';
import {
  REFUSAL_SENTENCE,
  STATUSES,
  UNWIRED_ADAPTER,
  formatWhen,
  groupLabel,
  isSitePath,
  loadView,
  makeMarker,
  makeMemoryAdapter,
  makeReopener,
  reasonLabel,
  withHandled,
  withReopened,
  type AdminFlagsAdapter,
  type FlagRow,
  type FlagStatus,
} from './adminflags';

interface Props {
  /**
   * Labeled sample rows for /preview/admin-flags only: they are kept in this browser and never sent anywhere. Without
   * them the page reads the database through Task 65's admin functions, or refuses everything when accounts are off.
   */
  sampleRows?: FlagRow[];
}

const control = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink aria-disabled:opacity-50';

type Screen = { kind: 'loading' } | { kind: 'refused' } | { kind: 'failed' } | { kind: 'ok'; rows: FlagRow[]; complete: boolean };

/** A client that could not load: the page says the reports could not be loaded and offers to try again. */
const FAILED_ADAPTER: AdminFlagsAdapter = Object.freeze({
  loadFlags: async () => ({ kind: 'failed' }) as const,
  markHandled: async () => ({ kind: 'failed' }) as const,
  reopen: async () => ({ kind: 'failed' }) as const,
});

/**
 * Christian's "Flag or comment" inbox (Task 66): one plain table, grouped by question, with "mark handled" and
 * "reopen". Wired to the database in Task 305: the shared client's `rpc` calls Task 65's admin functions, which check
 * the admin list and two-factor (aal2) themselves.
 */
export default function AdminFlags({ sampleRows }: Props) {
  const sample = useMemo(() => (sampleRows ? makeMemoryAdapter(sampleRows) : null), [sampleRows]);
  const [client, setClient] = useState<{ adapter: AdminFlagsAdapter; auth: LevelReader | null; watchAuth?: (invalidate: () => void) => () => void } | null>(null);
  const [clientAttempt, setClientAttempt] = useState(0);
  const adapter = sample ?? client?.adapter ?? null;
  const mark = useMemo(() => makeMarker(adapter ?? UNWIRED_ADAPTER), [adapter]);
  const reopen = useMemo(() => makeReopener(adapter ?? UNWIRED_ADAPTER), [adapter]);
  const [status, setStatus] = useState<FlagStatus>('open');
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [rowProblem, setRowProblem] = useState<Readonly<Record<string, string>>>({});
  const [announcement, setAnnouncement] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Nothing about the inbox is drawn until the database has let this visitor in once.
  const [admitted, setAdmitted] = useState(false);
  const statusCells = useRef(new Map<string, HTMLTableCellElement>());
  const focusAfter = useRef<string | null>(null);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  // Invalidate responses started under an older auth session, including work still in flight.
  const authEpoch = useRef(0);

  // The shared client, loaded once (again after "try again" if its download failed). Accounts off: refuse everything.
  useEffect(() => {
    if (sample) return;
    let live = true;
    getSupabase().then(
      (supabase) => {
        if (!live) return;
        setClient(supabase
          ? {
              adapter: inboxAdapter((fn, args) => supabase.rpc(fn, args)),
              auth: supabase.auth,
              watchAuth: (invalidate: () => void) => {
                const { data } = supabase.auth.onAuthStateChange(() => invalidate());
                return () => data.subscription.unsubscribe();
              },
            }
          : { adapter: UNWIRED_ADAPTER, auth: null });
      },
      () => { if (live) setClient({ adapter: FAILED_ADAPTER, auth: null }); },
    );
    return () => {
      live = false;
    };
  }, [sample, clientAttempt]);

  // Supabase broadcasts sign-out and account/token changes across tabs. Drop private rows
  // immediately, not only after the next admin RPC refuses the changed session.
  useEffect(() => {
    if (sample || !client?.watchAuth) return;
    return client.watchAuth(() => {
      authEpoch.current += 1;
      focusAfter.current = null;
      statusCells.current.clear();
      setAdmitted(false);
      setScreen({ kind: 'loading' });
      setPending(new Set());
      setRowProblem({});
      setAnnouncement('');
      setAttempt((n) => n + 1);
    });
  }, [client, sample]);

  useEffect(() => {
    if (!adapter) return;
    let live = true;
    const epoch = authEpoch.current;
    setScreen({ kind: 'loading' });
    setRowProblem({});
    loadView(adapter, status).then((view) => {
      if (!live || epoch !== authEpoch.current) return;
      if (view.kind === 'ok') setAdmitted(true);
      setScreen(view);
    });
    return () => {
      live = false;
    };
  }, [adapter, status, attempt]);

  const retry = () => {
    if (client?.adapter === FAILED_ADAPTER) {
      setClient(null);
      setClientAttempt((n) => n + 1);
    }
    setAttempt((n) => n + 1);
  };

  // After "mark handled", the button is gone, so focus moves to the row's new status.
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    statusCells.current.get(id)?.focus();
  });

  const onAction = async (row: FlagRow, action: 'mark' | 'reopen') => {
    if (pending.has(row.id)) return;
    const epoch = authEpoch.current;
    setPending((p) => new Set(p).add(row.id));
    setRowProblem((r) => {
      const next = { ...r };
      delete next[row.id];
      return next;
    });
    // A mark answers with the stored handled time; a reopen with nothing.
    const outcome: { kind: 'ok'; handledAt: string | null } | { kind: 'refused' } | { kind: 'failed' } =
      action === 'mark'
        ? await mark(row.id)
        : await reopen(row.id).then((o) => (o.kind === 'ok' ? { kind: 'ok' as const, handledAt: null } : o));
    if (epoch !== authEpoch.current) return;
    setPending((p) => {
      const next = new Set(p);
      next.delete(row.id);
      return next;
    });
    if (outcome.kind === 'refused') {
      setScreen({ kind: 'refused' });
      return;
    }
    if (outcome.kind === 'failed') {
      setRowProblem((r) => ({ ...r, [row.id]: "it didn't save. please try again." }));
      return;
    }
    focusAfter.current = row.id;
    const { handledAt } = outcome;
    setScreen((s) => {
      if (s.kind !== 'ok') return s;
      return { ...s, rows: handledAt !== null ? withHandled(s.rows, row.id, handledAt) : withReopened(s.rows, row.id) };
    });
    setAnnouncement(`${action === 'mark' ? 'marked handled' : 'reopened'}: ${reasonLabel(row.reason)}, ${formatWhen(row.created_at, timeZone)}.`);
  };

  // A signed-in account with two-factor on that hasn't entered its code this sign-in is refused by the database (aal1).
  // Send it to the code page, which comes back here (Supabase's MFA docs: redirect to a page where the user can
  // authenticate with the additional factor). The link stays in case the move is blocked. Nobody else sees anything new.
  const [codeStep, setCodeStep] = useState(false);
  const auth = client?.auth ?? null;
  useEffect(() => {
    if (screen.kind !== 'refused' || sample || !auth) return;
    let live = true;
    needsCode(auth).then((value) => {
      if (!live || !value) return;
      setCodeStep(true);
      window.location.assign(codePageFor('/admin/flags'));
    });
    return () => {
      live = false;
    };
  }, [screen.kind, sample, auth]);

  // Refused (signed out, not an admin, or no two-factor): the one sentence and nothing else, no counts. It is the
  // page's heading, so the page still has exactly one h1.
  if (screen.kind === 'refused') return <>
    <h1 className="text-xl text-ink">{REFUSAL_SENTENCE}</h1>
    {codeStep && <a href={codePageFor('/admin/flags')} className="mt-4 inline-flex min-h-12 items-center text-ink underline">
      enter your two-factor code
    </a>}
  </>;

  if (!admitted) {
    return screen.kind === 'failed' ? (
      <div className="text-ink">
        <h1 className="text-xl">the reports could not be loaded.</h1>
        <button type="button" className={`${control} mt-4`} onClick={retry}>
          try again
        </button>
      </div>
    ) : (
      <p role="status" className="text-ink-soft">loading…</p>
    );
  }

  const groups = screen.kind === 'ok' ? groupByItem(screen.rows) : [];

  return (
    <div className="text-ink">
      <h1 className="text-2xl">reports</h1>
      <fieldset className="mt-6">
        <legend className="font-medium">show</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {STATUSES.map((value) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-control px-3 py-2">
              <input
                type="radio"
                name="admin-flags-status"
                value={value}
                checked={status === value}
                onChange={() => {
                  setAnnouncement('');
                  setStatus(value);
                }}
                className="size-5 shrink-0 accent-ink"
              />
              {value === 'open' ? 'not handled' : 'handled'}
            </label>
          ))}
        </div>
      </fieldset>

      <p role="status" className="mt-4 min-h-6 text-sm text-ink-soft">
        {screen.kind === 'loading' ? 'loading reports…' : announcement}
      </p>

      {screen.kind === 'failed' && (
        <div className="mt-4">
          <p>the reports could not be loaded.</p>
          <button type="button" className={`${control} mt-3`} onClick={retry}>
            try again
          </button>
        </div>
      )}

      {screen.kind === 'ok' && !screen.complete && (
        <p className="mt-4" data-testid="admin-flags-capped">
          showing the newest 2,000 reports; older ones are not shown. mark some handled to see more.
        </p>
      )}

      {screen.kind === 'ok' && groups.length === 0 && (
        <p className="mt-4">{status === 'open' ? 'no reports waiting.' : 'no handled reports yet.'}</p>
      )}

      {screen.kind === 'ok' && groups.length > 0 && (
        <div
          role="region"
          aria-labelledby="admin-flags-caption"
          tabIndex={0}
          // relative: the table's screen-reader-only text is absolutely positioned; without a positioned ancestor here
          // it escapes this scroll box, widens the whole page on phones and covers the footer's buttons.
          className="relative mt-4 max-w-full overflow-x-auto"
          data-testid="admin-flags-table"
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption id="admin-flags-caption" className="sr-only">
              {status === 'open' ? 'reports not handled yet' : 'handled reports'}, grouped by question
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2 font-medium">sent</th>
                <th scope="col" className="px-3 py-2 font-medium">what's wrong</th>
                <th scope="col" className="px-3 py-2 font-medium">comment</th>
                <th scope="col" className="px-3 py-2 font-medium">page</th>
                <th scope="col" className="px-3 py-2 font-medium">status</th>
                <th scope="col" className="px-3 py-2 font-medium">action</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={`${group.item_id ?? ''}::${group.item_version_id ?? ''}`} data-testid="admin-flags-group">
                <tr className="border-b border-line bg-surface">
                  <th scope="rowgroup" colSpan={6} className="px-3 py-2 text-left font-medium">
                    <span className="break-all">{groupLabel(group)}</span>
                    <span className="text-ink-soft"> · {group.summary}</span>
                  </th>
                </tr>
                {group.flags.map((row) => {
                  const busy = pending.has(row.id);
                  const problem = rowProblem[row.id];
                  return (
                    <tr key={row.id} className="border-b border-line align-top" data-testid="admin-flags-row">
                      <td className="whitespace-nowrap px-3 py-2">{formatWhen(row.created_at, timeZone)}</td>
                      <td className="px-3 py-2">{reasonLabel(row.reason)}</td>
                      {/* Plain text only: React escapes it, so a comment that looks like HTML is shown as written. */}
                      <td className="min-w-48 whitespace-pre-wrap break-words px-3 py-2" data-testid="admin-flags-comment">
                        {row.comment ?? <span className="text-ink-soft">(no comment)</span>}
                      </td>
                      <td className="px-3 py-2">
                        {isSitePath(row.page) ? (
                          <a href={row.page} className="break-all underline underline-offset-4">{row.page}</a>
                        ) : (
                          <span className="break-all">{row.page}</span>
                        )}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-2"
                        tabIndex={-1}
                        ref={(el) => {
                          if (el) statusCells.current.set(row.id, el);
                          else statusCells.current.delete(row.id);
                        }}
                      >
                        {row.status === 'handled' ? (
                          <>handled{row.handled_at ? <span className="block text-ink-soft">{formatWhen(row.handled_at, timeZone)}</span> : null}</>
                        ) : (
                          'not handled'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.status === 'open' ? (
                          <>
                            <button
                              type="button"
                              className={control}
                              aria-disabled={busy || undefined}
                              aria-describedby={problem ? `admin-flags-problem-${row.id}` : undefined}
                              onClick={() => onAction(row, 'mark')}
                            >
                              {busy ? 'saving…' : 'mark handled'}
                              <span className="sr-only">: {reasonLabel(row.reason)}, {formatWhen(row.created_at, timeZone)}</span>
                            </button>
                            {problem && (
                              <p id={`admin-flags-problem-${row.id}`} className="mt-2">
                                {problem}
                              </p>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            className={control}
                            aria-disabled={busy || undefined}
                            aria-describedby={problem ? `admin-flags-problem-${row.id}` : undefined}
                            onClick={() => onAction(row, 'reopen')}
                          >
                            {busy ? 'saving…' : 'reopen'}
                            <span className="sr-only">: {reasonLabel(row.reason)}, {formatWhen(row.created_at, timeZone)}</span>
                          </button>
                        )}
                        {row.status === 'handled' && problem && (
                          <p id={`admin-flags-problem-${row.id}`} className="mt-2">
                            {problem}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

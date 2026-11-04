import { useEffect, useMemo, useRef, useState } from 'react';
import { groupByItem } from './flaginbox';
import { getSupabase } from './supabaseclient';
import { codePageFor, needsCode } from './twofactor';
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
  reasonLabel,
  withHandled,
  type FlagRow,
  type FlagStatus,
} from './adminflags';

interface Props {
  /**
   * Labeled sample rows for /preview/admin-flags only: they are kept in this browser and never sent anywhere. Without
   * them the page uses the unwired adapter, which refuses, until Task 65's database functions are wired in.
   */
  sampleRows?: FlagRow[];
}

const control = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink aria-disabled:opacity-50';

type Screen = { kind: 'loading' } | { kind: 'refused' } | { kind: 'failed' } | { kind: 'ok'; rows: FlagRow[] };

/** Christian's "Flag or comment" inbox (Task 66): one plain table, grouped by question, with "mark handled". */
export default function AdminFlags({ sampleRows }: Props) {
  const adapter = useMemo(() => (sampleRows ? makeMemoryAdapter(sampleRows) : UNWIRED_ADAPTER), [sampleRows]);
  const mark = useMemo(() => makeMarker(adapter), [adapter]);
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

  useEffect(() => {
    let live = true;
    setScreen({ kind: 'loading' });
    setRowProblem({});
    loadView(adapter, status).then((view) => {
      if (!live) return;
      if (view.kind === 'ok') setAdmitted(true);
      setScreen(view);
    });
    return () => {
      live = false;
    };
  }, [adapter, status, attempt]);

  // After "mark handled", the button is gone, so focus moves to the row's new status.
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    statusCells.current.get(id)?.focus();
  });

  const onMark = async (row: FlagRow) => {
    if (pending.has(row.id)) return;
    setPending((p) => new Set(p).add(row.id));
    setRowProblem((r) => {
      const next = { ...r };
      delete next[row.id];
      return next;
    });
    const outcome = await mark(row.id);
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
    setScreen((s) => (s.kind === 'ok' ? { kind: 'ok', rows: withHandled(s.rows, row.id, outcome.handledAt) } : s));
    setAnnouncement(`marked handled: ${reasonLabel(row.reason)}, ${formatWhen(row.created_at, timeZone)}.`);
  };

  // A signed-in account with two-factor on that hasn't entered its code this sign-in is refused by the database (aal1).
  // Offer the code page, which comes back here (Task 301). Nobody else sees anything new.
  const [codeStep, setCodeStep] = useState(false);
  useEffect(() => {
    if (screen.kind !== 'refused' || sampleRows) return;
    let live = true;
    getSupabase().then((client) => needsCode(client?.auth)).then((value) => { if (live) setCodeStep(value); }, () => {});
    return () => {
      live = false;
    };
  }, [screen.kind, sampleRows]);

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
        <button type="button" className={`${control} mt-4`} onClick={() => setAttempt((n) => n + 1)}>
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
          <button type="button" className={`${control} mt-3`} onClick={() => setAttempt((n) => n + 1)}>
            try again
          </button>
        </div>
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
                              onClick={() => onMark(row)}
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
                          <span className="text-ink-soft">done</span>
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

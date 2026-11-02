import { useEffect, useId, useRef, useState } from 'react';
import { site } from '../config/site';
import { charactersLeft, checkReport, REASONS, reasonInWords, type FlagProblem, type FlagReport, type Reason } from './flag';

interface Props {
  page: string;
  itemId?: string;
  itemVersionId?: string;
  signedIn: boolean;
  send: (report: FlagReport) => Promise<'sent' | 'too-many' | 'failed'>;
  /** 'icon': the footer's flag icon opens the form in a panel above the bar (Task 115). */
  variant?: 'text' | 'icon';
}
const control = 'min-h-11 min-w-11 rounded-md border border-control px-4 py-2 text-ink disabled:opacity-50';

/** A changed page, item or account starts a fresh form before it can render another report's draft. */
export default function FlagForm(props: Props) {
  return <ReportForm key={JSON.stringify([props.page, props.itemId, props.itemVersionId, props.signedIn])} {...props} />;
}


/** A signed-out student can still report a problem by email while accounts are being set up. */
export function SignedOutReportHelp() {
  return <p className="text-ink">
    sign in to send a report, or email us at{' '}
    <a href={`mailto:${site.contactEmail}`} className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">
      {site.contactEmail}
    </a> instead.
  </p>;
}

function ReportForm({ page, itemId, itemVersionId, signedIn, send, variant = 'text' }: Props) {
  const icon = variant === 'icon';
  const id = useId();
  const panelId = `${id}-panel`, commentId = `${id}-comment`, countId = `${id}-count`;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | undefined>();
  const [comment, setComment] = useState('');
  const [problems, setProblems] = useState<FlagProblem[]>([]);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const trigger = useRef<HTMLButtonElement>(null), firstReason = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null), context = useRef<HTMLParagraphElement>(null), commentBox = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false), isOpen = useRef(false), mounted = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (open) (signedIn && !busy.current ? firstReason.current : panel.current)?.focus();
  }, [open, signedIn]);
  useEffect(() => {
    const field = problems[0]?.field;
    if (field) (field === 'reason' ? firstReason.current : field === 'comment' ? commentBox.current : context.current)?.focus();
  }, [problems]);

  const close = () => { isOpen.current = false; setOpen(false); trigger.current?.focus(); };
  const error = (field: FlagProblem['field']) => problems.find(problem => problem.field === field);
  const errorId = (field: FlagProblem['field']) => `${id}-${field}-error`;
  const problemText = (field: FlagProblem['field']) => error(field) && <p id={errorId(field)} className="mt-2 text-sm text-ink">{error(field)!.message}</p>;

  const submit = async () => {
    if (busy.current || !signedIn) return;
    const checked = checkReport({ page, itemId, itemVersionId, reason, comment });
    if (!checked.ok) { setProblems(checked.problems); return; }
    setProblems([]); setAnnouncement(''); busy.current = true; setPending(true);
    let result: 'sent' | 'too-many' | 'failed';
    try { result = await send(checked.report); } catch { result = 'failed'; }
    if (!mounted.current) return;
    busy.current = false; setPending(false);
    if (result === 'sent') {
      setReason(undefined); setComment(''); setProblems([]);
      setAnnouncement('thank you. your report is in.');
      if (isOpen.current) close();
    } else setAnnouncement(result === 'too-many' ? "you've sent a few reports this hour. please try again later." : "it didn't send. please try again.");
  };

  return <div className={icon ? 'relative text-ink' : 'max-w-full text-ink'} data-testid="flag-form">
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={panelId}
      className={icon ? 'inline-flex size-12 items-center justify-center rounded-pill text-ink hover:bg-surface' : control}
      aria-label={icon ? 'flag or comment' : undefined}
      onClick={() => { if (open) close(); else { setAnnouncement(''); setProblems([]); isOpen.current = true; setOpen(true); } }}>
      {icon
        ? <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false">
            <path d="M5 21V4M5 4h12l-3 4.5 3 4.5H5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        : 'flag or comment'}
    </button>
    {open && <div ref={panel} id={panelId} tabIndex={-1}
      className={icon
        ? 'absolute bottom-full left-0 z-10 mb-2 max-h-96 w-flag-panel overflow-y-auto rounded-md border border-line bg-page p-4 shadow-lift'
        : 'mt-3 rounded-md border border-line bg-page p-4'}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      {!signedIn ? <SignedOutReportHelp /> : <form noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={pending} aria-describedby={error('reason') ? errorId('reason') : undefined}>
          <legend className="font-medium">what's wrong?</legend>
          <div className="mt-2 grid gap-2">
            {REASONS.map((value, index) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-control px-3 py-2">
              <input ref={index === 0 ? firstReason : undefined} type="radio" name={`${id}-reason`} value={value} checked={reason === value}
                onChange={() => setReason(value)} aria-invalid={error('reason') ? true : undefined} className="size-5 shrink-0 accent-ink" />
              <span>{reasonInWords(value)}</span>
            </label>)}
          </div>
          {problemText('reason')}
        </fieldset>
        <label htmlFor={commentId} className="mt-4 block">anything to add? ({reason === 'other' ? 'required' : 'optional'})</label>
        <textarea ref={commentBox} id={commentId} value={comment} onChange={event => setComment(event.target.value)} required={reason === 'other'} readOnly={pending}
          aria-invalid={error('comment') ? true : undefined} aria-describedby={[countId, error('comment') ? errorId('comment') : ''].filter(Boolean).join(' ')}
          rows={4} className="mt-2 block min-h-11 w-full max-w-full rounded-md border border-control bg-page p-3 text-ink" />
        <p id={countId} className="mt-2 text-sm text-ink-soft">{charactersLeft(comment).toLocaleString('en-US')} characters left</p>
        {problemText('comment')}
        <p ref={context} tabIndex={-1} className="mt-4 break-all text-sm text-ink-soft"
          aria-describedby={(['page', 'itemId', 'itemVersionId'] as const).filter(field => error(field)).map(errorId).join(' ') || undefined}>
          this report includes this page's address ({page}){itemId !== undefined ? `, item ${itemId}` : ''}{itemVersionId !== undefined ? `, version ${itemVersionId}` : ''}.
        </p>
        {problemText('page')}{problemText('itemId')}{problemText('itemVersionId')}
        <button type="submit" aria-disabled={pending} className={`${control} mt-4 bg-button text-on-button aria-disabled:opacity-50`}>{pending ? 'sending…' : 'send'}</button>
      </form>}
      <button type="button" className={`${control} mt-3`} onClick={close}>close</button>
    </div>}
    <p aria-live="polite" aria-atomic="true" data-testid="flag-result"
      className={!icon ? 'mt-2 text-sm' : announcement && !open ? 'absolute bottom-full left-0 mb-2 w-flag-panel rounded-md border border-line bg-page px-3 py-2 text-sm' : 'sr-only'}>{announcement}</p>
  </div>;
}

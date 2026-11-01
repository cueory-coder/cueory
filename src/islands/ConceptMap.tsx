import { useMemo, useState } from 'react';
import { countsInWords, filterItems, parseItems, STATUS_ORDER, type ConceptFilter, type ConceptItem, type ConceptStatus } from './conceptmap.ts';

interface Props { items: ConceptItem[] }

/** The shape and the neighboring words both identify the status. Color carries no extra meaning. */
function StatusIcon({ status }: { status: ConceptStatus }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-6 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth={2} data-status-icon={status}>
    {status === 'got it' ? <path d="M5 12l4 4L19 6" /> : <>
      <circle cx={12} cy={12} r={8} />
      {status === 'learning' && <path d="M12 12V4a8 8 0 0 1 8 8Z" fill="currentColor" stroke="none" />}
      {status === 'getting there' && <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />}
    </>}
  </svg>;
}

export default function ConceptMap({ items }: Props) {
  const [filter, setFilter] = useState<ConceptFilter>('all');
  const parsed = useMemo(() => {
    try { return parseItems(items); } catch { return undefined; }
  }, [items]);
  if (!parsed) return <p role="alert">this concept map could not be loaded. please try again later.</p>;
  const visible = filterItems(parsed, filter);
  return <section aria-label="concept progress" className="min-w-0 max-w-full text-ink" data-testid="concept-map">
    <p className="text-sm text-ink-soft" data-testid="concept-counts">{countsInWords(parsed)}</p>
    <div className="mt-4 flex max-w-full flex-wrap gap-2" role="group" aria-label="show concepts">
      {(['all', ...STATUS_ORDER] as const).map((status) => <button
        type="button" key={status} aria-pressed={filter === status}
        className={`min-h-11 min-w-11 rounded-md border px-4 py-2 text-ink ${filter === status ? 'border-ink bg-surface font-medium underline decoration-2 underline-offset-4' : 'border-control bg-page'}`}
        onClick={() => setFilter(status)}
      >{status}</button>)}
    </div>
    <p className="mt-3 text-sm text-ink-soft" aria-live="polite" aria-atomic="true">{visible.length} {visible.length === 1 ? 'concept shown.' : 'concepts shown.'}</p>
    <ul className="mt-3 flex min-w-0 flex-col gap-3" aria-label="concepts">
      {visible.map((item) => <li key={item.concept} className="flex min-w-0 items-start gap-3 rounded-md border border-line p-4">
        <StatusIcon status={item.status} />
        <div className="min-w-0 break-words">
          <h2 className="text-lg font-medium">{item.concept}</h2>
          <p className="mt-1 text-sm font-medium">{item.status}</p>
          <p className="mt-2">{item.description}</p>
        </div>
      </li>)}
    </ul>
    {!visible.length && <p className="mt-3 text-sm text-ink-soft">no concepts have this status.</p>}
  </section>;
}

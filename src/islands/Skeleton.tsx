/**
 * Purely visual loading placeholders (Task 91).
 * One screen-reader status per group, not one announcement per shape.
 * Task 77 owns the `.skeleton` animation and reduced-motion styling.
 */
export type SkeletonKind = 'lines' | 'card' | 'ring';

interface Props {
  kind?: SkeletonKind;
  lines?: number;
  /** Keep a finished placeholder out of both the visible and accessible trees. */
  loading?: boolean;
}

export default function Skeleton({ kind = 'lines', lines = 3, loading = true }: Props) {
  // A completed request must not leave an old "loading" live region behind.
  if (!loading) return null;

  // Bound the size of a group even if a future caller passes unexpected input.
  const lineCount = Number.isFinite(lines) ? Math.max(1, Math.min(6, Math.trunc(lines))) : 3;

  return (
    <div role="status" aria-live="polite" data-skeleton-kind={kind} className="w-full">
      <span className="sr-only">loading</span>
      {kind === 'lines' && (
        <div aria-hidden="true" className="flex w-full flex-col gap-3">
          {Array.from({ length: lineCount }, (_, index) => (
            <span
              key={index}
              className={`skeleton block h-4 bg-surface ${index === lineCount - 1 ? 'w-2/3' : index === 0 ? 'w-5/6' : 'w-full'}`}
            />
          ))}
        </div>
      )}
      {kind === 'card' && (
        <div aria-hidden="true" className="rounded-lg border border-line bg-page p-5 shadow-card">
          <div className="skeleton h-28 w-full bg-surface" />
          <div className="mt-4 flex flex-col gap-3">
            <span className="skeleton block h-4 w-3/4 bg-surface" />
            <span className="skeleton block h-4 w-full bg-surface" />
            <span className="skeleton block h-4 w-2/3 bg-surface" />
          </div>
        </div>
      )}
      {kind === 'ring' && (
        <div aria-hidden="true" className="flex items-center gap-4">
          <div className="skeleton flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface">
            <span className="h-9 w-9 rounded-full bg-page" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <span className="skeleton block h-4 w-5/6 bg-surface" />
            <span className="skeleton block h-4 w-2/3 bg-surface" />
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { readResume, resumeName, type ResumeSnapshot } from '../scripts/resume';
import { browserStorage } from '../scripts/storage';

/**
 * A quiet, one-line link placed by the director just below BuildingNotice on
 * the home page. The destination study island reads the snapshot and restores
 * the exact item and answers. No network, login gate or tracking.
 */
export default function ContinueBar() {
  const [snapshot, setSnapshot] = useState<ResumeSnapshot | null>(null);

  useEffect(() => {
    const refresh = () => setSnapshot(readResume(browserStorage()));
    refresh();
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (!snapshot) return null;
  return <ContinueStrip snapshot={snapshot} />;
}

/** Separately rendered in unit checks, without browser storage. */
export function ContinueStrip({ snapshot }: { snapshot: ResumeSnapshot }) {
  const current = snapshot.itemIndex + 1;
  const title = resumeName(snapshot);
  return (
    <aside aria-label="continue studying" className="w-full bg-button text-on-button">
      <a
        href={snapshot.page}
        aria-label={'continue ' + title + ', question ' + current + ' of ' + snapshot.totalItems}
        className="mx-auto block max-w-page px-gutter py-2 text-on-button no-underline"
      >
        <span className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>continue · {title}</span>
          <span>{current}/{snapshot.totalItems} →</span>
        </span>
        <progress
          aria-label="saved study progress"
          className="mt-1 block h-1 w-full appearance-none overflow-hidden rounded-pill bg-button-hover [&::-webkit-progress-bar]:bg-button-hover [&::-webkit-progress-value]:bg-on-button [&::-moz-progress-bar]:bg-on-button"
          value={current}
          max={snapshot.totalItems}
        />
      </a>
    </aside>
  );
}


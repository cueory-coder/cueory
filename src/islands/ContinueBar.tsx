import { useEffect, useState } from 'react';
import { readResume, type ResumeSnapshot } from '../scripts/resume';
import { browserStorage } from '../scripts/storage';
import { continueBarView, type ContinueBarView } from './continuebar';

/**
 * A quiet, one-line link placed by the director just below BuildingNotice on
 * the home page. The destination study island restores the saved session.
 * No network, login gate or tracking.
 */
export default function ContinueBar() {
  const [view, setView] = useState<ContinueBarView | null>(null);

  useEffect(() => {
    let expiryTimer: number | undefined;
    const refresh = () => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
      let now: number;
      try { now = Date.now(); } catch { setView(null); return; }
      const snapshot = readResume(browserStorage(), now);
      const next = continueBarView(snapshot, new Date(now));
      setView(next);
      // A visible tab must not keep showing a session after its 14-day expiry.
      if (next) expiryTimer = window.setTimeout(refresh, Math.max(1, next.expiresAt - now));
    };
    const whenVisible = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, []);

  return view ? <ContinueStrip view={view} /> : null;
}

/**
 * Display-only component. The snapshot overload keeps the existing resume
 * renderer's public API for unit tests; the live island supplies a checked view.
 */
export function ContinueStrip(props: { view: ContinueBarView } | { snapshot: ResumeSnapshot }) {
  const view = 'view' in props
    ? props.view
    : continueBarView(props.snapshot, new Date(props.snapshot.savedAt));
  if (!view) return null;
  return (
    <aside aria-label="continue studying" className="w-full bg-button text-on-button">
      <a
        href={view.href}
        aria-label={view.accessibleLabel}
        className="mx-auto block min-h-11 max-w-page px-gutter py-2 text-on-button no-underline"
      >
        <span className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>continue · {view.title}</span>
          <span>{view.current}/{view.total} →</span>
        </span>
        <progress
          aria-label="saved study progress"
          className="mt-1 block h-1 w-full appearance-none overflow-hidden rounded-pill bg-button-hover [&::-webkit-progress-bar]:bg-button-hover [&::-webkit-progress-value]:bg-on-button [&::-moz-progress-bar]:bg-on-button"
          value={view.current}
          max={view.total}
        />
      </a>
    </aside>
  );
}

import { useState } from 'react';
import { OVERLAY_NOTE } from './sources';
import { initialState, liveText, selectView, type OverlayView } from './overlay';

interface Props {
  title: string;
  /** The React node that renders the healthy version of the drawing. */
  healthy: React.ReactNode;
  /** The React node that renders the "simplified for learning" version. */
  changed: React.ReactNode;
  /** Short label for the changed view button, e.g. "narrowed". */
  changedName: string;
}

/**
 * Disease-overlay frame (D-56). Shows a healthy drawing and a "simplified for learning" version.
 * Only one view is visible at a time; a crossfade transitions between them (instant with reduced motion).
 * The OVERLAY_NOTE ("simplified for learning") is always shown alongside the changed view.
 * A polite live region announces the active view for screen-reader users.
 */
export default function OverlayFrame({ title, healthy, changed, changedName }: Props) {
  const [state, setState] = useState(initialState);

  const setView = (view: OverlayView) => setState(selectView(view));

  return (
    <div className="space-y-4">
      {/* View buttons */}
      <fieldset>
        <legend className="sr-only">{title} — view</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={state.view === 'healthy'}
            onClick={() => setView('healthy')}
            className="min-h-11 min-w-11 rounded-pill border border-line px-4 py-2 text-sm aria-pressed:bg-button aria-pressed:text-on-button aria-pressed:border-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button"
          >
            healthy
          </button>
          <button
            type="button"
            aria-pressed={state.view === 'changed'}
            onClick={() => setView('changed')}
            className="min-h-11 min-w-11 rounded-pill border border-line px-4 py-2 text-sm aria-pressed:bg-button aria-pressed:text-on-button aria-pressed:border-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button"
          >
            {changedName}
          </button>
        </div>
      </fieldset>

      {/* Drawing area — one view visible at a time, crossfade transition */}
      <div className="relative w-full">
        {/* Healthy view */}
        <div
          aria-hidden={state.view !== 'healthy'}
          className={[
            'transition-opacity motion-reduce:transition-none',
            state.view === 'healthy' ? 'opacity-100' : 'pointer-events-none opacity-0 absolute inset-0',
          ].join(' ')}
        >
          {healthy}
        </div>

        {/* Changed view */}
        <div
          aria-hidden={state.view !== 'changed'}
          className={[
            'transition-opacity motion-reduce:transition-none',
            state.view === 'changed' ? 'opacity-100' : 'pointer-events-none opacity-0 absolute inset-0',
          ].join(' ')}
        >
          {changed}
          <p className="mt-2 text-sm text-ink-soft">{OVERLAY_NOTE}</p>
        </div>
      </div>

      {/* Polite live region — announces the active view */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {liveText(state, changedName)}
      </p>
    </div>
  );
}

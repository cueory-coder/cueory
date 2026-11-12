/**
 * Catches React render errors inside interactive parts so one failing island
 * can show a useful reload action without blanking unrelated page content.
 * React boundaries work in the browser, not during server-side rendering.
 */
import { Component, useState, type ReactNode } from 'react';
import { errorBoundaryView } from './errorboundary';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** React's component error boundary; errors are deliberately not stored in state. */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: unknown): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? <ErrorBoundaryFallback /> : this.props.children;
  }
}

/** Exported separately so its HTML can be checked with renderToString in unit tests. */
export function ErrorBoundaryFallback() {
  const view = errorBoundaryView(import.meta.env.PROD);
  return (
    <section
      data-error-fallback
      role="status"
      aria-label={view.title}
      className="mx-auto flex w-full max-w-prose flex-col items-center rounded-xl border border-line bg-page px-6 py-10 text-center shadow-card sm:px-10"
    >
      <h3 className="text-lg font-semibold text-ink">{view.title}</h3>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">{view.description}</p>
      <button
        type="button"
        className="lift press mt-6 inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-button px-6 py-3 text-sm font-semibold text-on-button"
        onClick={() => window.location.reload()}
      >
        {view.reloadLabel}
      </button>
    </section>
  );
}

/** Preview-only failure, intentionally isolated from production game islands. */
function SampleCrash(): never {
  throw new Error('[sample simulated render failure]');
}

export function ErrorBoundaryDemo() {
  // A preview must be safe to visit. Only a deliberate button action throws.
  const [triggered, setTriggered] = useState(false);
  return (
    <div data-error-boundary-demo>
      <ErrorBoundary>
        {triggered ? (
          <SampleCrash />
        ) : (
          <button
            type="button"
            data-error-demo-trigger
            className="lift press inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-button px-6 py-3 text-sm font-semibold text-on-button"
            onClick={() => setTriggered(true)}
          >
            show sample error
          </button>
        )}
      </ErrorBoundary>
    </div>
  );
}

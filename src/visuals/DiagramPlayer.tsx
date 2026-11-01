import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { advance, next, parseSteps, pause, play, previous, startSteps, stepInWords, type DiagramStep } from './steps';

interface Props {
  title: string;
  steps: DiagramStep[];
  children?: ReactNode;
}

const control = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';

function Board({ title, steps, children }: Props) {
  const [state, setState] = useState(startSteps);
  // Hide playback until the browser preference is known; manual controls are always safe.
  const [reducedMotion, setReducedMotion] = useState(true);
  const figure = useRef<HTMLElement>(null);
  const playControl = useRef<HTMLButtonElement>(null);
  const words = stepInWords(steps, state);
  const step = steps[state.index]!;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const followPreference = (matches: boolean) => {
      // The playback control is about to disappear. Keep keyboard focus in the player on its arrow-key surface.
      if (matches && document.activeElement === playControl.current) figure.current?.focus({ preventScroll: true });
      setReducedMotion(matches);
      if (matches) setState(pause);
    };
    const change = (event: MediaQueryListEvent) => followPreference(event.matches);

    followPreference(preference.matches);
    preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (reducedMotion || !state.playing) return;
    const timer = window.setTimeout(() => setState((current) => advance(current, steps)), step.durationMs);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, state.index, state.playing, step.durationMs, steps]);

  const key = (event: KeyboardEvent<HTMLElement>) => {
    // Arrow presses on a focused control belong to that control, not the figure.
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setState((current) => previous(current, steps));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setState((current) => next(current, steps));
    }
  };

  return (
    <figure ref={figure} aria-label={title} tabIndex={0} onKeyDown={key} className="min-w-0 max-w-full text-ink">
      <h2 className="text-lg font-medium">{title}</h2>
      <div
        data-step={step.id}
        data-step-index={state.index}
        className="mt-3 max-w-full overflow-hidden rounded-md border border-line bg-surface p-3"
      >
        {children}
      </div>
      <figcaption aria-live="polite" aria-atomic="true" className="mt-3 text-sm text-ink-soft">
        {words}
      </figcaption>
      <div className="mt-3 flex max-w-full flex-wrap gap-2">
        <button
          type="button"
          className={control}
          disabled={state.index === 0}
          onClick={() => setState((current) => previous(current, steps))}
        >
          previous
        </button>
        {!reducedMotion && <button
          ref={playControl}
          type="button"
          className={control}
          onClick={() => setState((current) => current.playing ? pause(current) : play(current, steps))}
        >
          {state.playing ? 'pause' : 'play'}
        </button>}
        <button
          type="button"
          className={control}
          disabled={state.index === steps.length - 1}
          onClick={() => setState((current) => next(current, steps))}
        >
          next
        </button>
      </div>
    </figure>
  );
}

/** A generic shell for SVG diagrams whose own CSS selects the current step. */
export default function DiagramPlayer(props: Props) {
  try {
    const steps = parseSteps(props.steps);
    return <Board {...props} key={JSON.stringify(steps)} steps={steps} />;
  } catch {
    return <p role="alert">this diagram could not be loaded. please try again later.</p>;
  }
}

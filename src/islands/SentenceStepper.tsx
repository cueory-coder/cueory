import { useEffect, useRef, useState } from 'react';
import { back, isDone, next, showAll, start } from './stepper';

interface Sentence {
  id: string;
  text: string;
}

interface Props {
  sentences: Sentence[];
}

/**
 * Reveals a lesson one atomic sentence at a time.
 * Without JavaScript, the page shows every sentence (see the <noscript> list in the page).
 */
export default function SentenceStepper({ sentences }: Props) {
  const [state, setState] = useState(() => start(sentences.length));
  const latestRef = useRef<HTMLLIElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    latestRef.current?.focus();
  }, [state.shown]);

  const visible = sentences.slice(0, state.shown);
  const done = isDone(state);

  return (
    <div>
      <ol className="space-y-stack" aria-live="polite">
        {visible.map((s, i) => (
          <li
            key={s.id}
            ref={i === visible.length - 1 ? latestRef : undefined}
            tabIndex={-1}
            className="text-lg"
          >
            {s.text}
          </li>
        ))}
      </ol>

      <p className="mt-stack text-sm text-ink-soft">
        Sentence {state.shown} of {state.total}
      </p>

      <div className="mt-stack flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setState(back)}
          disabled={state.shown <= 1}
          className="rounded-pill border border-line px-5 py-2.5 text-ink disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setState(next)}
          disabled={done}
          className="rounded-pill bg-accent px-5 py-2.5 text-on-accent hover:bg-accent-strong disabled:opacity-50"
        >
          Next sentence
        </button>
        {!done && (
          <button
            type="button"
            onClick={() => setState(showAll)}
            className="rounded-pill px-3 py-2.5 text-ink-soft underline"
          >
            Show all
          </button>
        )}
      </div>

      {done && <p className="mt-stack text-ink-soft">That's the whole lesson for now. More is coming soon.</p>}
    </div>
  );
}

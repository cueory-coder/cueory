import { useEffect, useRef, useState } from 'react';
import {
  applyStep, isDone, start, stepAnnouncement,
  type StepperAction, type StepperState,
} from './stepper';

interface Sentence {
  id: string;
  text: string;
}

interface Props {
  sentences: Sentence[];
}

/** Reveals a lesson one sentence at a time, without moving focus from the student's controls. */
export default function SentenceStepper({ sentences }: Props) {
  const [state, setState] = useState(() => start(sentences.length));
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef<StepperState>(state);
  const lastAction = useRef<StepperAction>('next');
  const visible = sentences.slice(0, state.shown);
  const done = isDone(state);

  useEffect(() => {
    const words = stepAnnouncement(previous.current, state, lastAction.current, sentences);
    previous.current = state;
    if (words !== null) setAnnouncement(words);
  }, [state, sentences]);

  const move = (action: StepperAction) => {
    lastAction.current = action;
    setState(current => applyStep(current, action));
  };

  // Keep the native buttons in place even on the last sentence.
  // aria-disabled announces the boundary while allowing keyboard focus to remain on the control.
  const control = 'min-h-11 min-w-11 rounded-pill px-5 py-2.5 aria-disabled:opacity-50';

  return (
    <div data-testid="sentence-stepper">
      {state.total > 0 ? (
        <ol className="space-y-stack" aria-live="off" data-testid="stepper-sentences">
          {visible.map(sentence => <li key={sentence.id} className="text-lg">{sentence.text}</li>)}
        </ol>
      ) : <p className="text-ink-soft">there are no sentences in this lesson yet.</p>}

      <p className="mt-stack text-sm text-ink-soft">
        sentence {state.shown} of {state.total}
      </p>

      {state.total > 0 && <div className="mt-stack flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => move('back')}
          aria-disabled={state.shown <= 1}
          className={`${control} border border-control bg-page text-ink`}
        >
          back
        </button>
        <button
          type="button"
          onClick={() => move('next')}
          aria-disabled={done}
          className={`${control} bg-button text-on-button hover:bg-button-hover`}
        >
          next sentence
        </button>
        <button
          type="button"
          onClick={() => move('show-all')}
          aria-disabled={done}
          className={`${control} border border-control bg-page text-ink underline`}
        >
          show all
        </button>
      </div>}

      <p className="sr-only" role="status" aria-label="lesson sentence update" aria-atomic="true">
        {announcement}
      </p>

      {done && state.total > 0 && (
        <p className="mt-stack text-ink-soft">that's the whole lesson for now. more is coming soon.</p>
      )}
    </div>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import {
  canCheck, choiceMarks, currentQuestion, currentResult, MARKS, next, pick, recordResult,
  retryMissed, startQuestions, summary, type Checker, type Question,
} from './questions';

interface Props { questions: Question[]; check: Checker }
const button = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

/** A new set gets a fresh session, including when props change while a check is pending. */
export default function QuestionsPlayer(props: Props) {
  return <Session key={JSON.stringify(props.questions)} {...props} />;
}

function Session({ questions, check }: Props) {
  const [state, setState] = useState(() => startQuestions(questions));
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [focusStep, setFocusStep] = useState(0);
  const request = useRef(0);
  const inFlight = useRef(false);
  const stem = useRef<HTMLLegendElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const id = useId();
  const question = currentQuestion(state);
  const answer = currentResult(state);
  const marks = answer ? choiceMarks(answer.picked, answer.key) : undefined;

  // Ignore late replies from a removed player or a replaced checker. A second click cannot send a second request.
  useEffect(() => {
    request.current++;
    inFlight.current = false;
    setWaiting(false);
    setError('');
    return () => { request.current++; };
  }, [check]);
  // Start reading above the choice marks and rationales; the live region announces the verdict.
  useEffect(() => { if (answer) stem.current?.focus(); }, [answer]);
  useEffect(() => {
    if (state.finished) end.current?.focus();
    else if (focusStep > 0) stem.current?.focus();
  }, [state.finished, focusStep]);

  const submit = async () => {
    if (!question || !canCheck(state) || inFlight.current) return;
    const token = ++request.current;
    inFlight.current = true;
    setWaiting(true);
    setError('');
    try {
      const checked = await check(question.id, [...state.picked]);
      if (token !== request.current) return;
      // Validate before updating state so a malformed response follows the same retry path as a rejected promise.
      const checkedState = recordResult(state, checked);
      setState(checkedState);
    } catch {
      if (token === request.current) setError("couldn't check that answer. try again.");
    } finally {
      if (token === request.current) {
        inFlight.current = false;
        setWaiting(false);
      }
    }
  };
  const advance = () => { setState(next(state)); setError(''); setFocusStep((step) => step + 1); };
  const message = error || (answer ? answer.correct ? 'right.' : 'not quite.' : '');

  return (
    <div className="text-ink">
      {question && (
        <>
          <p className="text-sm text-ink-soft">question {state.index + 1} of {state.questions.length}</p>
          <fieldset className="mt-4 min-w-0" disabled={waiting || !!answer} aria-describedby={question.type === 'sata' ? `${id}-instruction` : undefined}>
            <legend ref={stem} tabIndex={-1} className="w-full text-lg font-medium">{question.stem}</legend>
            {question.type === 'sata' && <p id={`${id}-instruction`} className="mt-2 text-sm text-ink-soft">select all that apply</p>}
            <div className="mt-4 flex flex-col gap-3">
              {question.choices.map((choice) => {
                const mark = marks?.[choice.id];
                const words = mark ? MARKS[mark] : undefined;
                return (
                  <div key={choice.id}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-control px-4 py-3">
                      <input className="mt-1 shrink-0" type={question.type === 'single' ? 'radio' : 'checkbox'} name={`${id}-answer`}
                        value={choice.id} checked={state.picked.includes(choice.id)}
                        onChange={() => { setState((previous) => pick(previous, choice.id)); setError(''); }} />
                      <span className="min-w-0 break-words">{choice.text}</span>
                    </label>
                    {words?.words && <p className="mt-2 text-sm"><span aria-hidden="true">{words.symbol} </span>{words.words}</p>}
                    {answer && <p className="mt-2 text-sm text-ink-soft">{answer.rationales[choice.id] ?? 'no rationale was returned for this choice.'}</p>}
                  </div>
                );
              })}
            </div>
          </fieldset>
          {!answer && <button type="button" className={`${button} mt-6`} disabled={!canCheck(state)} aria-disabled={waiting} onClick={() => void submit()}>{waiting ? 'checking…' : 'check'}</button>}
          {answer && (
            <div className="mt-6">
              <p className="text-lg font-medium">{answer.correct ? 'right.' : 'not quite.'}</p>
              <button type="button" className={`${button} mt-4`} onClick={advance}>next question</button>
            </div>
          )}
          {error && <p className="mt-4">{error}</p>}
        </>
      )}
      {state.finished && (
        <div ref={end} tabIndex={-1}>
          <p className="text-lg font-medium">{summary(state)}</p>
          {Object.values(state.results).some((item) => !item.correct) && (
            <button type="button" className={`${button} mt-4`} onClick={() => {
              setState(retryMissed(state)); setError(''); setFocusStep((step) => step + 1);
            }}>try the missed ones again</button>
          )}
        </div>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{message}</p>
    </div>
  );
}

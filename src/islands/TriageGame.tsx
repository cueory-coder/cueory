import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { dayLabel } from './daily';
import { dayNumber, puzzleForDay } from './pulse';
import {
  answerInWords,
  placedIn,
  placeName,
  places,
  placeSize,
  placeTerm,
  slipsLeftInWords,
  startTriage,
  termsLeft,
  triageShareText,
  type Place,
  type TriagePuzzle,
  type TriageState,
} from './triage';

interface Props {
  /** Sample puzzles (D-63): the page picks one for the visitor's own date, as pulse does. */
  puzzles: TriagePuzzle[];
}

const primaryButton = 'rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

/** A button pressed with Enter or Space fires a click with no pointer details: keyboard users get focus moved on. */
const fromKeyboard = (event: MouseEvent) => event.detail === 0;

/**
 * triage (D-63): sort the day's terms into three named groups, or "none of these" for the one that fits none. Pick a
 * term, then its group: buttons only, so it works by tap, click and keyboard, with no dragging. A right place shows the
 * term in its group with ✓; a slip is said in words. Rendered only in the browser (client:only); without JavaScript
 * the page shows its <noscript> note instead.
 */
export default function TriageGame({ puzzles }: Props) {
  const today = useMemo(() => new Date(), []);
  const day = useMemo(() => dayNumber(today), [today]);
  const puzzle = useMemo(() => puzzleForDay(puzzles, day), [puzzles, day]);
  const [state, setState] = useState<TriageState>(() =>
    startTriage(puzzle ?? { groups: [], oddOne: '' }, day),
  );
  const [picked, setPicked] = useState<string | undefined>();
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const firstPlace = useRef<HTMLButtonElement>(null);
  const tray = useRef<HTMLUListElement>(null);
  const result = useRef<HTMLDivElement>(null);
  /** Set when a keyboard user sorts a term: once the terms are drawn again, focus goes to the first one left. */
  const focusTray = useRef(false);

  // Runs right after each render, before the next key press can arrive, so focus never lands late.
  useLayoutEffect(() => {
    if (!focusTray.current) return;
    focusTray.current = false;
    tray.current?.querySelector('button')?.focus();
  });

  // When the round ends, focus moves to the result so it is read out, and the share button is next.
  useEffect(() => {
    if (state.status !== 'playing') result.current?.focus();
  }, [state.status]);

  if (!puzzle) return <p>no puzzle today.</p>;
  const playing = state.status === 'playing';
  const left = termsLeft(state);

  const pick = (term: string, event: MouseEvent) => {
    if (!playing) return;
    if (picked === term) {
      setPicked(undefined);
      setSaid(`${term} put back.`);
      return;
    }
    setPicked(term);
    setSaid(`${term} picked. now pick its group.`);
    if (fromKeyboard(event)) firstPlace.current?.focus();
  };

  const put = (place: Place, event: MouseEvent) => {
    if (!playing) return;
    if (!picked) {
      setSaid('pick a term first.');
      return;
    }
    const next = placeTerm(state, puzzle, picked, place);
    setState(next);
    const where = placeName(puzzle, place);
    if (next.slips > state.slips) {
      // A slip: the term stays picked, so it can go somewhere else.
      setSaid(
        next.status === 'out'
          ? `slip: ${picked} isn't in ${where}. out of slips.`
          : `slip: ${picked} isn't in ${where}. ${slipsLeftInWords(next)}.`,
      );
      return;
    }
    const stillLeft = termsLeft(next).length;
    setSaid(
      next.status === 'sorted'
        ? `${picked} goes in ${where}. all sorted.`
        : `${picked} goes in ${where}. ${stillLeft} ${stillLeft === 1 ? 'term' : 'terms'} left.`,
    );
    setPicked(undefined);
    if (next.status === 'playing' && fromKeyboard(event)) focusTray.current = true;
  };

  const share = async () => {
    const line = triageShareText(state, dayLabel(today));
    try {
      await navigator.clipboard.writeText(line);
      setCopied(`copied: ${line}`);
    } catch {
      setCopied(line);
    }
  };

  return (
    <div className="triage" data-testid="triage">
      <p className="text-sm text-ink-soft" data-testid="triage-status">
        {left.length} {left.length === 1 ? 'term' : 'terms'} to sort · {slipsLeftInWords(state)}
      </p>

      {playing && (
        <>
          <p className="mt-4" data-testid="triage-picked">
            {picked ? (
              <>
                <span className="font-medium">picked:</span> {picked}. now pick its group.
              </>
            ) : (
              'pick a term, then the group it goes in.'
            )}
          </p>
          <ul ref={tray} className="triage-tray mt-3" aria-label="terms to sort">
            {left.map((term) => (
              <li key={term}>
                <button
                  type="button"
                  className="triage-term"
                  aria-pressed={picked === term}
                  onClick={(event) => pick(term, event)}
                >
                  {term}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="triage-places mt-6" role="group" aria-label="groups">
        {places(puzzle).map((place, index) => {
          const name = placeName(puzzle, place);
          const inside = placedIn(state, place);
          const count = `${inside.length} of ${placeSize(puzzle, place)}`;
          return (
            <div key={String(place)} className={`triage-place${place === 'none' ? ' triage-place-none' : ''}`}>
              <button
                type="button"
                ref={index === 0 ? firstPlace : undefined}
                className="triage-place-button"
                aria-label={`${name}, ${count}${picked && playing ? `, put ${picked} here` : ''}`}
                onClick={(event) => put(place, event)}
                disabled={!playing}
              >
                <span className="triage-place-name">{name}</span>
                <span className="text-sm text-ink-soft">{count}</span>
                {picked && playing && <span className="w-full text-sm text-ink-soft">put {picked} here</span>}
              </button>
              {inside.length > 0 && (
                <ul className="triage-sorted" aria-label={`in ${name}`}>
                  {inside.map((term) => (
                    <li key={term}>
                      <span aria-hidden="true">✓ </span>
                      {term}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {!playing && (
        <div ref={result} tabIndex={-1} className="triage-result mt-6" data-testid="triage-result">
          <p className="text-lg font-medium">{state.status === 'sorted' ? 'sorted.' : 'out of slips.'}</p>
          {state.status === 'out' && (
            <>
              <p className="mt-1">here is where each term goes:</p>
              <ul className="mt-2 flex flex-col gap-1" data-testid="triage-answer">
                {answerInWords(puzzle).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-ink-soft">{triageShareText(state, dayLabel(today))}</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={share}>
            copy my result
          </button>
          {copied && <p className="mt-2 text-sm text-ink-soft">{copied}</p>}
          <p className="mt-4 text-sm text-ink-soft">a new puzzle comes tomorrow.</p>
        </div>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="triage-live">
        {said}
      </p>
    </div>
  );
}

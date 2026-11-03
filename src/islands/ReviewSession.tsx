import { useEffect, useRef, useState } from 'react';
import { answer, currentCard, sessionHistories, startSession, summaryInWords, type ReviewSessionCard, type SessionHistories } from './reviewsession';
import type { Review } from './review';
import type { ReviewSync, SyncOutcome } from './reviewsync';

interface Props {
  cards: ReviewSessionCard[];
  histories: SessionHistories;
  today: string;
  examDay?: string;
  onSave: (histories: SessionHistories) => void | Promise<void>;
  /** Signed in with published questions only (reviewsync.ts). Left out: the review stays on this device, as before. */
  sync?: ReviewSync;
}
const primary = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const secondary = 'min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink';

/** Histories are a starting snapshot. Parent save echoes must not restart an active session. */
export default function ReviewSession(props: Props) {
  // A keyed child may reset while an earlier snapshot is still being saved.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  return <Session key={JSON.stringify([props.cards, props.today, props.examDay])} {...props} saveQueue={saveQueue} />;
}

function Session({ cards, histories, today, examDay, onSave, sync, saveQueue }: Props & { saveQueue: { current: Promise<void> } }) {
  const [state, setState] = useState(() => startSession(cards, histories, today, examDay));
  const [revealed, setRevealed] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [syncError, setSyncError] = useState('');
  const face = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const answeredId = useRef<string | undefined>(undefined);
  const saveRequest = useRef(0);
  const syncRequest = useRef(0);
  const alive = useRef(true);
  const card = currentCard(state);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (focusRequest > 0) (card ? face : end).current?.focus();
  }, [focusRequest, card]);

  const save = (snapshot: SessionHistories) => {
    const token = ++saveRequest.current;
    setSaveError('');
    const failed = () => {
      if (alive.current && token === saveRequest.current) setSaveError("your progress couldn't be saved. it is still here for this review.");
    };
    // Keep asynchronous saves in order so an older snapshot cannot finish last.
    saveQueue.current = saveQueue.current.then(() => onSave(snapshot)).then(() => undefined, failed);
  };
  // The account copy (reviewsync.ts keeps unsaved rows and their order); only the newest outcome is shown.
  const syncSaved = (pending: Promise<SyncOutcome>) => {
    const token = ++syncRequest.current;
    setSyncError('');
    void pending.then((outcome) => {
      if (alive.current && token === syncRequest.current) setSyncError(outcome.ok ? '' : outcome.message);
    });
  };
  const record = (result: Review['result']) => {
    if (!card || !revealed || answeredId.current === card.id) return;
    answeredId.current = card.id;
    const updated = answer(state, result);
    setState(updated);
    setRevealed(false);
    setFocusRequest((request) => request + 1);
    save(sessionHistories(updated));
    if (sync) syncSaved(sync.record(card.id, updated.histories[card.id]!, updated.today, updated.examDay));
  };

  return (
    <div className="text-ink">
      <p className="text-sm text-ink-soft">{state.queue.length} {state.queue.length === 1 ? 'card' : 'cards'} to review today</p>
      {card ? (
        <>
          <div ref={face} tabIndex={-1} className="mt-4 min-w-0 rounded-md border border-line bg-surface px-6 py-6">
            <p className="text-sm text-ink-soft">card {state.pos + 1} of {state.queue.length}</p>
            <p className="mt-2 break-words text-xl">{card.front}</p>
            {revealed && <div className="mt-4"><p className="text-sm text-ink-soft">answer</p><p className="mt-2 break-words text-lg">{card.back}</p></div>}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {revealed ? <>
              <button type="button" className={primary} onClick={() => record('knew')}>know it</button>
              <button type="button" className={secondary} onClick={() => record('missed')}>still learning</button>
            </> : <button type="button" className={primary} onClick={() => {
              setRevealed(true); setFocusRequest((request) => request + 1);
            }}>show the answer</button>}
          </div>
        </>
      ) : <div ref={end} tabIndex={-1} className="mt-4 text-lg">{summaryInWords(state)}</div>}
      <p className="mt-4 text-sm" aria-live="polite" aria-atomic="true">{[saveError, syncError].filter(Boolean).join(' ')}</p>
      {(saveError || syncError) && <button type="button" className={secondary} onClick={() => {
        if (saveError) save(sessionHistories(state));
        if (syncError && sync) syncSaved(sync.retry());
        setFocusRequest((request) => request + 1);
      }}>try saving again</button>}
    </div>
  );
}

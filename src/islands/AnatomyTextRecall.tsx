import { useMemo, useRef, useState } from 'react';
import type { AnatomySystem } from './anatomylab';
import { nameSourceFor } from './anatomylab';
import {
  answerRecallChoice, answerRecallTyped, nextRecall, recallSettled, revealRecall, startRecall,
  type RecallCatalog, type RecallState,
} from './anatomyrecall';

const button = 'min-h-11 rounded-md border border-control px-3 py-2 text-sm text-ink';

/** Guided source-ID/name practice uses only the existing labels, without a renderer or model download. */
export default function AnatomyTextRecall({ systems, drafts }: { systems: readonly AnatomySystem[]; drafts: boolean }) {
  const [key, setKey] = useState(systems[0]?.key ?? '');
  const system = systems.find((entry) => entry.key === key) ?? systems[0];
  const [round, setRound] = useState<RecallState | null>(null);
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLParagraphElement>(null);
  const catalog = useMemo<RecallCatalog>(() => ({
    ids: system?.structures.map((entry) => entry.id) ?? [],
    names: new Map(system?.structures.map((entry) => [entry.id, entry.text]) ?? []),
    groups: new Map(system?.structures.map((entry) => [entry.id, entry.group]) ?? []),
  }), [system]);
  if (!system) return null;
  const settled = round ? recallSettled(round) : false;
  const targetName = round?.target ? catalog.names.get(round.target) ?? round.target : '';
  const focusInput = () => requestAnimationFrame(() => (input.current ?? question.current)?.focus());
  const begin = () => {
    setTyped('');
    setRound(startRecall(catalog.ids, catalog, Math.random));
    focusInput();
  };

  return (
    <section aria-label="source ID practice" className="space-y-3 rounded-lg border border-line p-4">
      <h2 className="text-lg text-ink">name it without the 3D view</h2>
      <p className="text-sm text-ink-soft">
        practise matching a source ID to its official name. each question is written in text;
        you can pick a name or type it. this does not identify a shape or assess anatomy knowledge.
        no 3D view or model download is needed.
      </p>
      <label className="block text-sm text-ink" htmlFor="anatomy-text-system">body system for text practice</label>
      <select id="anatomy-text-system" value={system.key}
        onChange={(event) => { setKey(event.target.value); setRound(null); setTyped(''); }}
        className="min-h-11 w-full rounded-md border border-control bg-page px-3 text-ink">
        {systems.map((entry) => <option key={entry.key} value={entry.key}>{entry.title}</option>)}
      </select>
      {drafts && system.status === 'draft' && !system.fixture && (
        <p className="text-sm text-ink-soft">draft · labels waiting for review</p>
      )}
      <p className="text-sm text-ink-soft">{nameSourceFor(system)}</p>
      {!round ? (
        <button ref={start} type="button" className={button} disabled={catalog.ids.length === 0} onClick={begin}>
          start text name it
        </button>
      ) : (
        <div className="space-y-3">
          <div role="status" className="space-y-2 text-ink">
            <p ref={question} tabIndex={-1} id="anatomy-text-question">
              {round.target ? <>what is the official name for source ID <span data-text-recall-id>{round.target}</span>?</>
                : 'round done: every source ID in this round has been asked.'}
            </p>
            {round.feedback?.kind === 'wrong' && <p data-text-feedback="wrong">✗ not this one: {round.feedback.answer}. try again, or show the name.</p>}
            {round.feedback?.kind === 'right' && <p data-text-feedback="right">✓ right: {targetName}.</p>}
            {round.feedback?.kind === 'shown' && <p data-text-feedback="shown">the name is: {targetName}.</p>}
          </div>
          {round.target && (
            <>
              {round.choices.length > 0 && (
                <fieldset className="space-y-2" aria-describedby="anatomy-text-question">
                  <legend className="text-sm text-ink-soft">pick the official name</legend>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {round.choices.map((id) => (
                      <button key={id} type="button" className={button} aria-disabled={settled}
                        onClick={() => setRound(answerRecallChoice(round, id, catalog))}>
                        {catalog.names.get(id) ?? id}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <form className="space-y-2" onSubmit={(event) => {
                event.preventDefault();
                setRound(answerRecallTyped(round, typed, catalog));
              }}>
                <label className="block text-sm text-ink" htmlFor="anatomy-text-answer">type the official name</label>
                <input ref={input} id="anatomy-text-answer" value={typed} readOnly={settled}
                  aria-describedby="anatomy-text-question" onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off" spellCheck={false} maxLength={200}
                  className="min-h-11 w-full rounded-md border border-control bg-page px-3 text-ink" />
                <button type="submit" className={button} aria-disabled={settled || typed.trim() === ''}>check text answer</button>
              </form>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} aria-disabled={settled} onClick={() => { if (!settled) setRound(revealRecall(round)); }}>show the name</button>
                <button type="button" className={button} onClick={() => {
                  setTyped('');
                  setRound(nextRecall(round, catalog, Math.random));
                  focusInput();
                }}>next source ID</button>
              </div>
            </>
          )}
          {!round.target && <button type="button" className={button} onClick={begin}>start text round again</button>}
          <button type="button" className={button} onClick={() => {
            setRound(null); setTyped(''); requestAnimationFrame(() => start.current?.focus());
          }}>stop text practice</button>
        </div>
      )}
      <p className="text-sm text-ink-soft">guided practice, without a score. names stay on this page and are not saved.</p>
    </section>
  );
}

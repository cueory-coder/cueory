import { useEffect, useState } from 'react';
import {
  ideasForLength,
  pickIdeaForLength,
  shuffleIdeasForLength,
  type BreakIdea,
  type BreakLengthChoice,
} from './breakideas';

/** Sample text only. Choices remain in memory; nothing is saved or sent. */
export default function BreakIdeasList({ ideas }: { ideas: readonly BreakIdea[] }) {
  const [list, setList] = useState(() => [...ideas]);
  const [length, setLength] = useState<BreakLengthChoice>('any');
  const [selected, setSelected] = useState<BreakIdea | null>(null);
  const [lastPickedId, setLastPickedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const visible = ideasForLength(list, length);
  const heading = length === 'any' ? 'all the ideas' : `ideas for a ${length} break`;

  const chooseLength = (next: BreakLengthChoice) => {
    setLength(next);
    setSelected(null);
    setNotice(next === 'any' ? 'showing ideas for any break.' : `showing ideas for a ${next} break.`);
    // Keep the last picked ID so switching lengths cannot immediately repeat a shared idea.
  };

  const shuffle = () => {
    setList(current => shuffleIdeasForLength(current, length, Math.random));
    setNotice('the list is shuffled. all the same ideas are here in a new order.');
  };

  const showOne = () => {
    const idea = pickIdeaForLength(ideas, length, lastPickedId, Math.random);
    setSelected(idea);
    if (idea) setLastPickedId(idea.id);
    setNotice(idea ? `one idea: ${idea.text}` : 'there are no break ideas for this length yet.');
  };

  const lengthButton = 'min-h-11 min-w-11 rounded-pill border border-control px-5 py-2.5 disabled:opacity-60';

  return <div className="text-ink">
    <div role="group" aria-labelledby="break-length-heading">
      <h2 id="break-length-heading" className="text-lg font-bold">how much time do you have?</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {(['any', 'short', 'long'] as const).map(value => (
          <button key={value} type="button" disabled={!ready} aria-pressed={length === value}
            className={`${lengthButton} ${length === value ? 'bg-button text-on-button' : 'bg-page text-ink'}`}
            onClick={() => chooseLength(value)}>
            {value === 'any' ? 'any break' : `${value} break`}
          </button>
        ))}
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={!ready || visible.length === 0} onClick={showOne}
        className="min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-60">
        show me one
      </button>
      <button type="button" disabled={!ready || visible.length < 2} onClick={shuffle}
        className="min-h-11 rounded-pill border border-control bg-page px-5 py-2.5 text-ink disabled:opacity-60">
        shuffle the ideas
      </button>
    </div>
    <p className="sr-only" role="status" aria-label="break idea update" aria-atomic="true">{notice}</p>
    {selected && <section className="mt-6 rounded-lg border border-control bg-surface p-6" aria-labelledby="one-idea-heading">
      <h2 id="one-idea-heading" className="text-sm font-bold">one idea to try</h2>
      <p className="mt-2 text-xl" data-testid="picked-break-idea">{selected.text}</p>
      <button type="button" onClick={showOne}
        className="mt-4 min-h-11 rounded-pill border border-control bg-page px-5 py-2.5 text-ink">
        another idea
      </button>
    </section>}
    <h2 id="break-list-heading" className="mt-8 text-lg font-bold">{heading}</h2>
    {visible.length > 0 ? <ul aria-labelledby="break-list-heading" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map(idea => <li key={idea.id} className="rounded-lg border border-line bg-surface p-5">{idea.text}</li>)}
    </ul> : <p className="mt-4">{ideas.length === 0
      ? 'there are no break ideas here yet.'
      : 'there are no break ideas for this length yet. choose another length.'}</p>}
  </div>;
}

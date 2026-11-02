import { useEffect, useState } from 'react';
import { pickIdea, type BreakIdea } from './breakideas';
import { order } from './cards';

/** Public sample text only. Choices stay in memory; nothing is saved or sent. */
export default function BreakIdeasList({ ideas }: { ideas: readonly BreakIdea[] }) {
  const [list, setList] = useState(() => [...ideas]);
  const [selected, setSelected] = useState<BreakIdea | null>(null);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const shuffle = () => {
    const shuffled = order(list.map((_, index) => index), true).map(index => list[index]!);
    // A shuffle can draw the current order. Still give the student a visibly fresh list.
    if (shuffled.length > 1 && shuffled.every((idea, index) => idea.id === list[index]!.id)) {
      shuffled.push(shuffled.shift()!);
    }
    setList(shuffled);
    setNotice('the list is shuffled. all the same ideas are here in a new order.');
  };

  const showOne = () => {
    const idea = pickIdea(ideas, selected?.id, Math.random);
    setSelected(idea);
    setNotice(idea ? `one idea: ${idea.text}` : 'there are no break ideas here yet.');
  };

  return <div className="text-ink">
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={!ready || ideas.length === 0} onClick={showOne}
        className="min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-60">
        show me one
      </button>
      <button type="button" disabled={!ready || list.length < 2} onClick={shuffle}
        className="min-h-11 rounded-pill border border-control bg-page px-5 py-2.5 text-ink disabled:opacity-60">
        shuffle the ideas
      </button>
    </div>
    <p className="sr-only" role="status" aria-label="break idea update" aria-atomic="true">{notice}</p>
    {selected && <section className="mt-6 rounded-lg border border-control bg-surface p-6" aria-labelledby="one-idea-heading">
      <h2 id="one-idea-heading" className="text-sm font-bold">one idea to try</h2>
      <p className="mt-2 text-xl" data-testid="picked-break-idea">{selected.text}</p>
    </section>}
    <h2 id="break-list-heading" className="mt-8 text-lg font-bold">all the ideas</h2>
    {list.length > 0 ? <ul aria-labelledby="break-list-heading" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map(idea => <li key={idea.id} className="rounded-lg border border-line bg-surface p-5">{idea.text}</li>)}
    </ul> : <p className="mt-4">there are no break ideas here yet.</p>}
  </div>;
}

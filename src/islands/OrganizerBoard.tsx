import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { canCheck, check, isDone, parseSet, placeItem, resultInWords, startOrganizer, summary, type OrganizerSet } from './organizer';

interface Props { set: OrganizerSet }
interface Drag { id: string; pointer: number; x: number; y: number; active: boolean }
const control = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink';
const card = `${control} shadow-card lift press`;
const chip = 'min-h-11 min-w-11 rounded-pill border border-control bg-surface px-4 py-2 text-ink lift press';

function Board({ set }: Props) {
  const seed = useRef(Date.now() >>> 0);
  const [state, setState] = useState(() => startOrganizer(set, seed.current));
  const [picked, setPicked] = useState<string>();
  const [said, setSaid] = useState('');
  const [hovered, setHovered] = useState<string>();
  const [dragged, setDragged] = useState<string>();
  const drag = useRef<Drag | null>(null);
  const ignoreClick = useRef(false);
  const focusItem = useRef<string | undefined>(undefined);
  const itemButtons = useRef(new Map<string, HTMLButtonElement>());
  const previousLocked = useRef<string[]>([]);
  const progressFill = useRef<HTMLDivElement>(null);
  const firstGroup = useRef<HTMLButtonElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const help = useId();
  const done = isDone(state);

  useLayoutEffect(() => {
    if (focusItem.current) itemButtons.current.get(focusItem.current)?.focus();
    focusItem.current = undefined;
  });
  useLayoutEffect(() => {
    progressFill.current?.style.setProperty('--progress', String(set.items.length ? state.locked.length / set.items.length : 0));
  }, [state.locked.length, set.items.length]);
  useEffect(() => { if (done) result.current?.focus(); }, [done]);

  // A newly checked correct item settles in place. Reduced-motion users get an opacity-only fade.
  useEffect(() => {
    const fresh = state.locked.filter((id) => !previousLocked.current.includes(id));
    previousLocked.current = state.locked;
    if (!fresh.length) return;
    const rootStyles = getComputedStyle(document.documentElement);
    const durationValue = rootStyles.getPropertyValue('--duration-base').trim();
    const amount = Number.parseFloat(durationValue);
    const duration = durationValue.endsWith('ms') ? amount : durationValue.endsWith('s') ? amount * 1000 : 0;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const easing = rootStyles.getPropertyValue('--ease-soft').trim() || 'ease';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames: Keyframe[] = reduced
      ? [{ opacity: 0.75 }, { opacity: 1 }]
      : [{ opacity: 0.75, transform: 'scale(0.97)' }, { opacity: 1, transform: 'scale(1)' }];
    for (const id of fresh) itemButtons.current.get(id)?.animate(frames, { duration, easing });
  }, [state.locked]);

  const moveItem = (id: string, place: string) => {
    if (state.locked.includes(id)) return;
    const item = set.items.find((candidate) => candidate.id === id)!;
    const destination = place === 'tray' ? 'the tray' : set.groups.find((group) => group.id === place)?.name;
    if (!destination) return;
    const next = placeItem(state, id, place);
    focusItem.current = id;
    setState(next);
    setPicked(undefined);
    setSaid(next === state ? `${item.text} is already in ${destination}.` : `${item.text} moved to ${destination}.`);
  };

  const choose = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    if (ignoreClick.current) { ignoreClick.current = false; return; }
    if (state.locked.includes(id)) return;
    const next = picked === id ? undefined : id;
    setPicked(next);
    setSaid(next ? `${set.items.find((item) => item.id === id)!.text} picked. choose a group or the tray.` : 'item put back.');
    if (next && event.detail === 0) firstGroup.current?.focus();
  };

  const shortcut = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !/^[0-4]$/.test(event.key)) return;
    event.preventDefault();
    const index = Number(event.key) - 1;
    const destination = index < 0 ? 'tray' : set.groups[index]?.id;
    if (destination) moveItem(id, destination);
  };

  const dropPlace = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-place]')?.dataset.dropPlace;
  const pointerDown = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || state.locked.includes(id)) return;
    drag.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, active: false };
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) >= 8) {
      current.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragged(current.id);
      setSaid('item picked up. release it over a group or the tray.');
    }
    if (current.active) { event.preventDefault(); setHovered(dropPlace(event.clientX, event.clientY)); }
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    if (current.active) {
      ignoreClick.current = true;
      // Moving between panels remounts the button, so there may be no generated click to consume this flag.
      window.setTimeout(() => { ignoreClick.current = false; }, 0);
      const destination = dropPlace(event.clientX, event.clientY);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (destination) moveItem(current.id, destination);
      else setSaid('move cancelled. the item stayed where it was.');
    }
    setDragged(undefined); setHovered(undefined);
  };

  const destination = (place: string) => {
    if (picked) moveItem(picked, place);
    else setSaid('pick an item first.');
  };

  const itemsAt = (place: string) => state.order.filter((id) => state.positions[id] === place).map((id) => {
    const item = set.items.find((candidate) => candidate.id === id)!;
    const right = state.locked.includes(id);
    const returned = place === 'tray' && state.last?.returned.includes(id);
    return <li key={id}>
      <button
        ref={(element) => { if (element) itemButtons.current.set(id, element); else itemButtons.current.delete(id); }}
        type="button" aria-pressed={right ? undefined : picked === id} aria-disabled={right || undefined}
        aria-describedby={help} data-item={id}
        className={`${right ? `${control} bg-surface shadow-card` : card} w-full select-none break-words text-left ${picked === id || dragged === id ? 'bg-surface outline outline-2 outline-ink' : ''}`}
        onClick={(event) => choose(id, event)} onKeyDown={(event) => shortcut(event, id)}
        onPointerDown={(event) => pointerDown(event, id)} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={() => { drag.current = null; setDragged(undefined); setHovered(undefined); }}
      >
        {item.text}
        {right && <span className="mt-1 block text-sm">✓ right</span>}
        {picked === id && <span className="mt-1 block text-sm text-ink-soft">selected</span>}
        {returned && <span className="mt-1 block text-sm">back in the tray to try again</span>}
      </button>
    </li>;
  });

  const restart = () => {
    const next = startOrganizer(set, ++seed.current);
    focusItem.current = next.order[0];
    setState(next); setPicked(undefined); setSaid('all items are back in the tray.');
  };

  return <section aria-label="organizer" data-testid="organizer">
    <h2 className="text-lg font-medium">{set.title}</h2>
    <p id={help} className="mt-2 text-sm text-ink-soft">pick an item, then a group or the tray. on an item, press 1 to {set.groups.length} for a group, or 0 for the tray. you can also drag with a mouse. check when you are ready.</p>
    <p className="mt-4 text-sm text-ink-soft">{state.locked.length} of {set.items.length} sorted correctly</p>
    <div
      role="progressbar" aria-label="organizer progress" aria-valuemin={0} aria-valuemax={set.items.length}
      aria-valuenow={state.locked.length} aria-valuetext={`${state.locked.length} of ${set.items.length} sorted correctly`}
      className="progress-track mt-2"
    >
      <div ref={progressFill} className="progress-fill" aria-hidden="true" />
    </div>
    <div className="mt-4 min-w-0 rounded-md border border-line p-3" data-drop-place="tray">
      <h3><button type="button" className={`${chip} w-full break-words text-left font-medium ${hovered === 'tray' ? 'outline outline-2 outline-ink' : ''}`} onClick={() => destination('tray')}>0. tray</button></h3>
      <ul className="mt-3 flex min-w-0 flex-col gap-2" aria-label="tray">{itemsAt('tray')}</ul>
      {state.order.every((id) => state.positions[id] !== 'tray') && <p className="mt-2 text-sm text-ink-soft">the tray is empty.</p>}
    </div>
    <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
      {set.groups.map((group, index) => <div key={group.id} className="min-w-0 rounded-md border border-line p-3" data-drop-place={group.id}>
        <h3><button ref={index === 0 ? firstGroup : undefined} type="button" className={`${chip} w-full break-words text-left font-medium ${hovered === group.id ? 'outline outline-2 outline-ink' : ''}`} onClick={() => destination(group.id)}>{index + 1}. {group.name}</button></h3>
        <ul className="mt-3 flex min-w-0 flex-col gap-2" aria-label={group.name}>{itemsAt(group.id)}</ul>
      </div>)}
    </div>
    {!done && <button type="button" className={`${control} press mt-4 disabled:opacity-50`} disabled={!canCheck(state)} onClick={() => { const next = check(state, set); setState(next); setPicked(undefined); setSaid(resultInWords(next)); }}>check</button>}
    <p className="mt-3 text-sm text-ink-soft" aria-live="polite" aria-atomic="true" data-testid="organizer-live">{said}</p>
    {done && <div ref={result} tabIndex={-1} className="mt-4 rounded-md border border-control p-4" data-testid="organizer-result">
      <p className="font-medium">{summary(state)}</p>
      <button type="button" className={`${control} press mt-3`} onClick={restart}>sort again</button>
    </div>}
  </section>;
}

export default function OrganizerBoard({ set }: Props) {
  try {
    const parsed = parseSet(set);
    return <Board key={JSON.stringify(parsed)} set={parsed} />;
  } catch { return <p role="alert">this set could not be loaded. please try again later.</p>; }
}

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { attachResumeLifecycle, clearResume, readResume, saveResume, type ResumeDraft, type ResumeSnapshot } from '../scripts/resume';
import { browserStorage } from '../scripts/storage';
import ResumePrompt from './ResumePrompt';
import { canCheck, check, checkOutcome, isDone, parseSet, placeItem, startOrganizer, summary, type OrganizerSet } from './organizer';

/** `page` is this page's own address, for the saved place (Task 300: every lesson has its own organizer page). */
interface Props { set: OrganizerSet; page?: string }
interface Drag { id: string; pointer: number; x: number; y: number; active: boolean }
const control = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink';
const card = `${control} shadow-card lift press`;
const chip = 'min-h-11 min-w-11 rounded-pill border border-control bg-surface px-4 py-2 text-ink lift press';

const ORGANIZER_PAGE = '/learn/study-skills/organizer';

/** Save only placements the student submitted and the checker locked. */
function organizerDraft(state: ReturnType<typeof startOrganizer>, set: OrganizerSet, page: string): ResumeDraft {
  return {
    tool: 'organizer', page, module: set.id, step: `checks-${state.tries}`,
    itemIndex: Math.min(state.locked.length, set.items.length - 1), totalItems: set.items.length,
    answers: Object.fromEntries(state.locked.map(id => [id, state.positions[id]!])),
    timer: null, phase: isDone(state) ? 'results' : 'working',
  };
}

/** Recheck each saved student placement using the same rule as the live board. */
function restoreOrganizer(set: OrganizerSet, seed: number, snapshot: ResumeSnapshot, page: string) {
  if (snapshot.tool !== 'organizer' || snapshot.page !== page ||
      snapshot.module !== set.id || snapshot.totalItems !== set.items.length) return null;
  const matched = /^checks-([1-9]\d*)$/.exec(snapshot.step ?? '');
  if (!matched) return null;
  const attempts = Number(matched[1]);
  if (!Number.isSafeInteger(attempts) || attempts > 10000) return null;
  let state = startOrganizer(set, seed);
  for (const [id, group] of Object.entries(snapshot.answers)) {
    if (typeof group !== 'string' || !set.items.some(item => item.id === id) ||
        !set.groups.some(candidate => candidate.id === group)) return null;
    state = placeItem(state, id, group);
    state = check(state, set);
    if (!state.locked.includes(id)) return null;
  }
  const restored = { ...state, tries: attempts, last: null };
  const draft = organizerDraft(restored, set, page);
  if (draft.itemIndex !== snapshot.itemIndex || draft.phase !== snapshot.phase ||
      Object.keys(draft.answers).length !== Object.keys(snapshot.answers).length) return null;
  return restored;
}

function Board({ set, page = ORGANIZER_PAGE }: Props) {
  const seed = useRef(Date.now() >>> 0);
  const [state, setState] = useState(() => startOrganizer(set, seed.current));
  const [resumePending, setResumePending] = useState(() => {
    const stored = readResume(browserStorage());
    return stored?.tool === 'organizer' && stored.page === page;
  });
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
  const latestDraft = useRef<ResumeDraft | null>(null);
  useEffect(() => attachResumeLifecycle(browserStorage(), () => latestDraft.current), []);
  const firstGroup = useRef<HTMLButtonElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const checkFocus = useRef<'feedback' | 'summary' | null>(null);
  const help = useId();
  const done = isDone(state);

  useLayoutEffect(() => {
    if (focusItem.current) itemButtons.current.get(focusItem.current)?.focus();
    focusItem.current = undefined;
  });
  useLayoutEffect(() => {
    progressFill.current?.style.setProperty('--progress', String(set.items.length ? state.locked.length / set.items.length : 0));
  }, [state.locked.length, set.items.length]);
  // After checking, focus the result words so keyboard and screen-reader users hear them.
  // A complete round keeps its existing summary focus.
  useLayoutEffect(() => {
    if (checkFocus.current === 'feedback') feedback.current?.focus();
    if (checkFocus.current === 'summary') result.current?.focus();
    checkFocus.current = null;
  }, [state.last, done]);
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
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;
    const frames: Keyframe[] = [{ opacity: 0.75, transform: 'scale(0.97)' }, { opacity: 1, transform: 'scale(1)' }];
    const animations: Animation[] = [];
    for (const id of fresh) {
      const animation = itemButtons.current.get(id)?.animate(frames, { duration, easing });
      if (animation) animations.push(animation);
    }
    const cancel = () => { for (const animation of animations) animation.cancel(); };
    const changed = () => { if (motion.matches) cancel(); };
    motion.addEventListener('change', changed);
    return () => {
      motion.removeEventListener('change', changed);
      cancel();
    };
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
    setResumePending(false);
    latestDraft.current = null;
    clearResume(browserStorage());
    previousLocked.current = [];
    const next = startOrganizer(set, ++seed.current);
    focusItem.current = next.order[0];
    setState(next); setPicked(undefined); setSaid('all items are back in the tray.');
  };

  const continueSaved = (snapshot: ResumeSnapshot) => {
    const restored = restoreOrganizer(set, seed.current, snapshot, page);
    if (!restored) {
      restart();
      return;
    }
    // Restoring already checked placements is not a new check or animation.
    previousLocked.current = restored.locked;
    latestDraft.current = organizerDraft(restored, set, page);
    setResumePending(false);
    focusItem.current = undefined;
    setState(restored);
    setPicked(undefined);
    setSaid(`${restored.locked.length} of ${set.items.length} sorted items restored.`);
  };

  const checkAndSave = () => {
    const outcome = checkOutcome(state, set);
    if (outcome.next !== state) checkFocus.current = outcome.focus;
    setState(outcome.next);
    setPicked(undefined);
    setSaid(outcome.message);
    if (outcome.next !== state) {
      const draft = organizerDraft(outcome.next, set, page);
      latestDraft.current = draft;
      saveResume(browserStorage(), draft);
    }
  };

  return <section aria-label="organizer" data-testid="organizer">
    <ResumePrompt page={page} onContinue={continueSaved} onStartOver={restart} />
    {/* Keep the board inactive until a saved session is continued or discarded. */}
    <div inert={resumePending}>
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
    {!done && <button type="button" className={`${control} press mt-4 disabled:opacity-50`} disabled={!canCheck(state)} onClick={checkAndSave}>check</button>}
    <p ref={feedback} tabIndex={-1} className="mt-3 text-sm text-ink-soft" aria-live="polite" aria-atomic="true" data-testid="organizer-live">{said}</p>
    {done && <div ref={result} tabIndex={-1} className="mt-4 rounded-md border border-control p-4" data-testid="organizer-result">
      <p className="font-medium">{summary(state)}</p>
      <button type="button" className={`${control} press mt-3`} onClick={restart}>sort again</button>
    </div>}
    </div>
  </section>;
}

export default function OrganizerBoard({ set, page }: Props) {
  try {
    const parsed = parseSet(set);
    return <Board key={JSON.stringify(parsed)} set={parsed} page={page} />;
  } catch { return <p role="alert">this set could not be loaded. please try again later.</p>; }
}

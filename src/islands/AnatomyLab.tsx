import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { LabColors, LabScene, LoadResult } from './anatomyscene';
import { checkTriangleBudget } from './bodyviewer-logic';
import {
  BODYPARTS3D_CREDIT_LEAD,
  BODYPARTS3D_LICENSE_NAME,
  BODYPARTS3D_LICENSE_URL,
  EXPORT_SIZES,
  answerQuiz,
  creditFor,
  exportFileName,
  groupStructures,
  labelsToShow,
  layoutLabels,
  nameSourceFor,
  nextQuiz,
  pictureCreditFor,
  releaseNoteFor,
  onlyThis,
  revealQuiz,
  startQuiz,
  toggleHidden,
  type AnatomySystem,
  type ExportSize,
  type PlacedLabel,
  type QuizState,
} from './anatomylab';

interface Props {
  systems: AnatomySystem[];
  /** The tests' fixture system, shown first and only when the address has ?fixture (never on the live site's build). */
  fixture?: AnatomySystem | null;
  /** True on builds that show drafts: draft systems then carry the "draft · labels waiting for review" note. */
  drafts: boolean;
}

type Phase = 'cover' | 'opening' | 'open' | 'error';
type SystemLoad = { state: 'loading' } | { state: 'ready'; result: LoadResult } | { state: 'error'; message: string };

const primaryButton =
  'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-60';
const secondaryButton =
  'min-h-11 min-w-11 rounded-pill border border-control px-4 py-2 text-sm text-ink aria-pressed:border-button aria-pressed:bg-button aria-pressed:text-on-button disabled:opacity-60';
const iconButton = 'min-h-11 min-w-11 rounded-pill border border-control px-3 text-ink';

const STEP = Math.PI / 24; // 7.5° a press
const ZOOM_IN = 0.85;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The label overlay's font, matching the label's text-sm class (15px Lato). */
function measureLabel(font: string): (s: string) => number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return (s) => s.length * 8;
  ctx.font = `400 15px ${font}`;
  return (s) => ctx.measureText(s).width;
}

/**
 * The anatomy lab (Task 178): one body system at a time, its structures listed by their official names, picking in 3D
 * or from the list, labels with leader lines, a "find it" quiz and picture export for Christian's posts and videos.
 * Nothing from three.js loads before the student taps "open the anatomy lab". Rendered client:only.
 */
export default function AnatomyLab({ systems: baseSystems, fixture, drafts }: Props) {
  const systems = useMemo(() => {
    const wantsFixture = fixture && new URLSearchParams(window.location.search).has('fixture');
    // The fixture comes first, so the tests open it whatever real systems the build also has.
    return wantsFixture ? [fixture, ...baseSystems] : baseSystems;
  }, [baseSystems, fixture]);

  const [phase, setPhase] = useState<Phase>('cover');
  const [openError, setOpenError] = useState('');
  const [systemKey, setSystemKey] = useState(systems[0]?.key ?? '');
  const [load, setLoad] = useState<SystemLoad>({ state: 'loading' });
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [labelsOn, setLabelsOn] = useState(false);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [transparent, setTransparent] = useState(false);
  const [exporting, setExporting] = useState<ExportSize | null>(null);
  const [exportNote, setExportNote] = useState('');
  const [announce, setAnnounce] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LabScene | null>(null);
  const colorsRef = useRef<LabColors | null>(null);
  const readColorsRef = useRef<(() => LabColors) | null>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const activePointers = useRef(new Set<number>());
  const labelIdsRef = useRef<string[]>([]);
  const measureRef = useRef<((s: string) => number) | null>(null);
  const setPlacedRef = useRef<((labels: PlacedLabel[]) => void) | null>(null);

  const system = systems.find((s) => s.key === systemKey) ?? systems[0];
  const names = useMemo(() => new Map(system?.structures.map((s) => [s.id, s.text]) ?? []), [system]);
  const found = load.state === 'ready' ? load.result.found : [];
  const foundSet = useMemo(() => new Set(found), [found]);
  const visible = useMemo(() => found.filter((id) => !hidden.has(id)), [found, hidden]);
  const groups = useMemo(() => groupStructures(system?.structures ?? [], query), [system, query]);
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);
  const labelIds = useMemo(
    () => (labelsOn && !quiz ? labelsToShow(visible, selected) : []),
    [labelsOn, quiz, visible, selected],
  );
  labelIdsRef.current = labelIds;

  // ── Labels follow the camera: re-laid out after every frame the scene draws ──────────────────────────────────────
  const updateLabels = useCallback(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    const ids = labelIdsRef.current;
    const setPlaced = setPlacedRef.current;
    if (!setPlaced) return;
    if (!scene || !canvas || ids.length === 0) {
      setPlaced([]);
      return;
    }
    const measure = measureRef.current ?? (measureRef.current = measureLabel(colorsRef.current?.font ?? 'sans-serif'));
    const anchors = scene.project(ids).map((point) => ({
      ...point,
      width: Math.ceil(measure(names.get(point.id) ?? '')) + 20,
      height: 30,
    }));
    const model = scene.extent();
    setPlaced(
      layoutLabels(anchors, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        offset: 16,
        ...(model ? { columns: { left: model.x, right: model.x + model.width } } : {}),
      }),
    );
  }, [names]);
  const updateLabelsRef = useRef(updateLabels);
  updateLabelsRef.current = updateLabels;
  useEffect(() => updateLabels(), [labelIds, updateLabels]);

  // ── Open: load three.js and the scene module only now ─────────────────────────────────────────────────────────────
  const open = useCallback(async () => {
    setPhase('opening');
    setOpenError('');
    try {
      const { createLabScene, readColors } = await import('./anatomyscene');
      // Wait a frame so React has put the canvas on the page (the timeout covers background tabs, which get no frames).
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
        setTimeout(resolve, 250);
      });
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('The 3D view could not start.');
      readColorsRef.current = () => readColors();
      colorsRef.current = readColors();
      sceneRef.current = createLabScene({
        canvas,
        reducedMotion: prefersReducedMotion(),
        colors: colorsRef.current,
        onRender: () => updateLabelsRef.current(),
      });
      setPhase('open');
    } catch (err) {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setOpenError(err instanceof Error ? err.message : 'The anatomy lab could not open.');
      setPhase('error');
    }
  }, []);

  // ── Load the chosen system (and only it); the scene disposes the previous one ────────────────────────────────────
  useEffect(() => {
    if (phase !== 'open' || !system) return;
    const scene = sceneRef.current;
    if (!scene) return;
    let current = true;
    setLoad({ state: 'loading' });
    setHidden(new Set());
    setSelected(null);
    setQuiz(null);
    scene
      .load(system.model.file, system.structures.map((s) => s.id))
      .then((result) => {
        if (!current || !result) return;
        setLoad({ state: 'ready', result });
        setAnnounce(`${system.title}: ${result.found.length} structures loaded.`);
      })
      .catch((err: unknown) => {
        if (!current) return;
        setLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      current = false;
    };
  }, [phase, system]);

  useEffect(() => {
    if (load.state === 'ready') sceneRef.current?.setAppearance({ hidden, selected });
  }, [hidden, selected, load]);

  useEffect(() => () => sceneRef.current?.dispose(), []);

  useEffect(() => {
    if (phase === 'open') canvasRef.current?.focus();
  }, [phase]);

  // ── Theme: Daytime / Evening, from the device or the footer's pick ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'open') return;
    const refresh = () => {
      const read = readColorsRef.current;
      if (!read) return;
      colorsRef.current = read();
      measureRef.current = null;
      sceneRef.current?.setColors(colorsRef.current);
    };
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      mq.removeEventListener('change', refresh);
      observer.disconnect();
    };
  }, [phase]);

  // ── Picking ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const pickStructure = useCallback(
    (id: string | null) => {
      if (quiz && quiz.target) {
        if (!id) return;
        const next = answerQuiz(quiz, id);
        setQuiz(next);
        setSelected(id);
        return;
      }
      setSelected((current) => (id === null ? null : current === id ? current : id));
      if (id) setAnnounce(`selected ${names.get(id) ?? id}`);
    },
    [quiz, names],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointers.current.add(e.pointerId);
    pointerRef.current =
      activePointers.current.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false } : null;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = pointerRef.current;
    if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    const p = pointerRef.current;
    pointerRef.current = null;
    if (!p || p.id !== e.pointerId || p.moved) return; // a drag or a pinch turns the view; only a tap picks
    const id = sceneRef.current?.pick(e.clientX, e.clientY) ?? null;
    pickStructure(id);
  };
  const onPointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    pointerRef.current = null;
  };

  const onCanvasKey = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    switch (e.key) {
      case 'ArrowLeft': scene.orbit(-STEP, 0); break;
      case 'ArrowRight': scene.orbit(STEP, 0); break;
      case 'ArrowUp': scene.orbit(0, -STEP); break;
      case 'ArrowDown': scene.orbit(0, STEP); break;
      case '+': case '=': scene.zoom(ZOOM_IN); break;
      case '-': case '_': scene.zoom(1 / ZOOM_IN); break;
      default: return;
    }
    e.preventDefault();
  };

  // ── Quiz ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const quizPool = visible;
  const toggleQuiz = () => {
    if (quiz) {
      setQuiz(null);
      setSelected(null);
      return;
    }
    setSelected(null);
    setQuiz(startQuiz(quizPool, Math.random));
  };

  // ── Export ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const exportPicture = async (size: ExportSize) => {
    const scene = sceneRef.current;
    if (!scene || !system) return;
    setExporting(size);
    setExportNote('');
    try {
      // The labels on screen, or else the selected structure's name.
      const ids = labelIds.length ? labelIds : selected && !hidden.has(selected) ? [selected] : [];
      const blob = await scene.exportPicture({
        size,
        transparent,
        title: system.title,
        credit: pictureCreditFor(system),
        labels: ids.map((id) => ({ id, text: names.get(id) ?? id })),
      });
      const fileName = exportFileName(system.key, selected ? (names.get(selected) ?? null) : null, size);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExportNote(`saved ${fileName}`);
    } catch (err) {
      setExportNote(`could not save the picture: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(null);
    }
  };

  if (!system) return <p className="text-ink-soft">no body systems yet.</p>;

  if (phase === 'cover') {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={open}
          className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface px-5 py-3 text-ink hover:bg-button-hover hover:text-on-button"
        >
          <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 3L21 8.5V15.5L12 21L3 15.5V8.5L12 3Z" />
            <path d="M12 3V21M3 8.5L12 14L21 8.5" />
          </svg>
          open the anatomy lab
        </button>
        <p className="text-sm text-ink-soft">loads the 3D viewer, then one body system at a time.</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-lg bg-surface p-4 text-sm" role="alert">
        <p>The anatomy lab could not open.</p>
        {openError && <p className="mt-1 text-ink-soft">{openError}</p>}
      </div>
    );
  }

  const selectedName = selected ? (names.get(selected) ?? selected) : null;
  const selectedGroup = selected ? system.structures.find((s) => s.id === selected)?.group : undefined;
  const budget = load.state === 'ready' ? checkTriangleBudget(load.result.triangles) : null;
  const ready = load.state === 'ready';
  const targetName = quiz?.target ? (names.get(quiz.target) ?? quiz.target) : null;

  return (
    <div className="space-y-6">
      <p className="sr-only" aria-live="polite">{announce}</p>

      {systems.length > 1 && (
        <fieldset>
          <legend className="text-sm text-ink-soft">body system</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {systems.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={s.key === system.key}
                onClick={() => setSystemKey(s.key)}
                className={secondaryButton}
              >
                {s.title}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {drafts && system.status === 'draft' && (
        <p className="rounded-md border border-line px-3 py-2 text-sm text-ink">draft · labels waiting for review</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="relative">
            <canvas
              ref={canvasRef}
              tabIndex={0}
              role="img"
              aria-label={`3D model: ${system.title}`}
              aria-describedby="anatomy-lab-help"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onKeyDown={onCanvasKey}
              className="block aspect-square w-full rounded-lg border border-line bg-page md:aspect-video"
              style={{ touchAction: 'none' }}
            />
            <LabelOverlay setterRef={setPlacedRef} names={names} onMount={updateLabels} />
            {(phase === 'opening' || load.state === 'loading') && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface">
                <span className="text-sm text-ink-soft">loading {system.title}…</span>
              </div>
            )}
            {load.state === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface p-4" role="alert">
                <p className="text-sm text-ink">
                  Could not load {system.title}. <span className="text-ink-soft">{load.message}</span>
                </p>
              </div>
            )}
          </div>
          <p id="anatomy-lab-help" className="sr-only">
            Turn the model by dragging or with the arrow keys; zoom by pinching, scrolling or pressing plus and minus.
            Tap a structure to select it. The list of structures does the same as tapping in 3D.
          </p>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="view">
            <button type="button" className={iconButton} aria-label="turn left" onClick={() => sceneRef.current?.orbit(-STEP, 0)}>←</button>
            <button type="button" className={iconButton} aria-label="turn right" onClick={() => sceneRef.current?.orbit(STEP, 0)}>→</button>
            <button type="button" className={iconButton} aria-label="tilt up" onClick={() => sceneRef.current?.orbit(0, -STEP)}>↑</button>
            <button type="button" className={iconButton} aria-label="tilt down" onClick={() => sceneRef.current?.orbit(0, STEP)}>↓</button>
            <button type="button" className={iconButton} aria-label="zoom in" onClick={() => sceneRef.current?.zoom(ZOOM_IN)}>+</button>
            <button type="button" className={iconButton} aria-label="zoom out" onClick={() => sceneRef.current?.zoom(1 / ZOOM_IN)}>−</button>
            <button type="button" className={secondaryButton} onClick={() => sceneRef.current?.resetView()}>reset view</button>
            <button type="button" className={secondaryButton} disabled={!ready} onClick={() => setHidden(new Set())}>show all</button>
            <button
              type="button"
              className={secondaryButton}
              aria-pressed={labelsOn}
              disabled={!ready || quiz !== null}
              onClick={() => setLabelsOn((on) => !on)}
            >
              labels
            </button>
          </div>
          {labelsOn && !quiz && visible.length > labelIds.length && (
            <p className="text-sm text-ink-soft">
              {selected ? 'with this many structures showing, only the selected one is labeled.' : 'with this many structures showing, select one to label it.'}
            </p>
          )}

          <div className="space-y-1 text-sm text-ink-soft">
            <p>
              {system.fixture ? (
                creditFor(system)
              ) : (
                <>
                  {BODYPARTS3D_CREDIT_LEAD}{' '}
                  <a className="underline" href={BODYPARTS3D_LICENSE_URL} rel="license noopener">{BODYPARTS3D_LICENSE_NAME}</a>
                </>
              )}
            </p>
            <p>{releaseNoteFor(system)}</p>
            {budget && <p className="text-ink">{budget}</p>}
            {ready && load.result.missing.length > 0 && (
              <p>{load.result.missing.length} listed structures aren't in this model file.</p>
            )}
          </div>

          {selectedName && !quiz && (
            <section className="rounded-lg border border-line bg-surface p-4" aria-labelledby="anatomy-name-card">
              <h2 id="anatomy-name-card" className="text-lg text-ink">{selectedName}</h2>
              {selectedGroup && <p className="text-sm text-ink-soft">{selectedGroup}</p>}
              <p className="mt-1 text-sm text-ink-soft">{nameSourceFor(system)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={secondaryButton} onClick={() => setHidden(onlyThis(found, selected!))}>
                  show only this
                </button>
                <button type="button" className={secondaryButton} onClick={() => setHidden((h) => toggleHidden(h, selected!))}>
                  {hidden.has(selected!) ? 'show it' : 'hide it'}
                </button>
                <button type="button" className={secondaryButton} onClick={() => setSelected(null)}>clear selection</button>
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-line p-4" aria-labelledby="anatomy-quiz-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="anatomy-quiz-heading" className="text-lg text-ink">find it</h2>
              <button type="button" className={secondaryButton} aria-pressed={quiz !== null} disabled={!ready || quizPool.length === 0} onClick={toggleQuiz}>
                {quiz ? 'stop the quiz' : 'start the quiz'}
              </button>
            </div>
            {quiz && (
              <div className="space-y-3">
                <div aria-live="polite" className="space-y-2">
                  {targetName ? (
                    <p className="text-ink">
                      find: <strong>{targetName}</strong>
                    </p>
                  ) : (
                    <p className="text-ink">round done: {quiz.right} of {quiz.answered} right the first time.</p>
                  )}
                  {quiz.feedback?.kind === 'right' && (
                    <p className="text-ink" data-feedback="right"><span aria-hidden="true">✓ </span>right: {targetName}.</p>
                  )}
                  {quiz.feedback?.kind === 'wrong' && (
                    <p className="text-ink" data-feedback="wrong">
                      <span aria-hidden="true">✗ </span>not this one: you picked {names.get(quiz.feedback.picked) ?? quiz.feedback.picked}. try again, or tap show me.
                    </p>
                  )}
                  {quiz.feedback?.kind === 'shown' && <p className="text-ink" data-feedback="shown">here it is: {targetName}.</p>}
                </div>
                <p className="text-sm text-ink-soft">score: {quiz.right} of {quiz.answered}</p>
                <div className="flex flex-wrap gap-2">
                  {quiz.target ? (
                    <>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={quiz.feedback?.kind === 'shown' || quiz.feedback?.kind === 'right'}
                        onClick={() => {
                          setQuiz(revealQuiz(quiz));
                          setSelected(quiz.target);
                        }}
                      >
                        show me
                      </button>
                      <button
                        type="button"
                        className={primaryButton}
                        onClick={() => {
                          setSelected(null);
                          setQuiz(nextQuiz(quiz, quizPool, Math.random));
                        }}
                      >
                        next
                      </button>
                    </>
                  ) : (
                    <button type="button" className={primaryButton} onClick={() => setQuiz(startQuiz(quizPool, Math.random))}>
                      start again
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <fieldset className="space-y-3 rounded-lg border border-line p-4">
            <legend className="px-1 text-sm text-ink-soft">export a picture</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EXPORT_SIZES) as ExportSize[]).map((size) => (
                <button key={size} type="button" className={secondaryButton} disabled={!ready || exporting !== null} onClick={() => exportPicture(size)}>
                  {EXPORT_SIZES[size].label}
                </button>
              ))}
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-5" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              transparent background
            </label>
            <p className="text-sm text-ink-soft" aria-live="polite">{exporting ? 'drawing the picture…' : exportNote}</p>
          </fieldset>
        </div>

        <section className="space-y-3" aria-labelledby="anatomy-list-heading">
          <h2 id="anatomy-list-heading" className="text-lg text-ink">structures</h2>
          <label className="block text-sm text-ink-soft" htmlFor="anatomy-search">find a structure</label>
          <input
            id="anatomy-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 w-full rounded-md border border-control bg-page px-3 text-ink"
            autoComplete="off"
          />
          <p className="text-sm text-ink-soft" aria-live="polite">
            {shownCount === 1 ? '1 structure' : `${shownCount} structures`}
          </p>
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.group ?? '—'}>
                {group.group && <h3 className="text-sm text-ink-soft">{group.group}</h3>}
                <ul className="mt-1 space-y-1">
                  {group.items.map((item) => {
                    const inModel = foundSet.has(item.id);
                    const isHidden = hidden.has(item.id);
                    return (
                      <li key={item.id} className="flex items-stretch gap-1">
                        <button
                          type="button"
                          aria-pressed={selected === item.id}
                          disabled={!ready || !inModel}
                          onClick={() => pickStructure(item.id)}
                          className="min-h-11 min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-left text-sm text-ink aria-pressed:border-button aria-pressed:bg-button aria-pressed:text-on-button disabled:opacity-60"
                        >
                          {item.text}
                          {isHidden && <span> (hidden)</span>}
                          {ready && !inModel && <span> (not in this model)</span>}
                        </button>
                        {inModel && (
                          <button
                            type="button"
                            aria-label={`${isHidden ? 'show' : 'hide'} ${item.text}`}
                            onClick={() => setHidden((h) => toggleHidden(h, item.id))}
                            className="min-h-11 min-w-14 rounded-md border border-line px-2 text-sm text-ink"
                          >
                            {isHidden ? 'show' : 'hide'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The labels over the 3D view, with leader lines. It keeps its own state so following the camera every frame redraws
 * only the labels, never the structure list. Positions go through React's style property, which the browser applies
 * through the CSSOM (allowed by our content security policy; a style="" attribute in the HTML would not be).
 */
function LabelOverlay({
  setterRef,
  names,
  onMount,
}: {
  setterRef: MutableRefObject<((labels: PlacedLabel[]) => void) | null>;
  names: ReadonlyMap<string, string>;
  onMount: () => void;
}) {
  const [placed, setPlaced] = useState<PlacedLabel[]>([]);
  useEffect(() => {
    setterRef.current = setPlaced;
    onMount();
    return () => {
      setterRef.current = null;
    };
  }, [setterRef, onMount]);
  if (placed.length === 0) return null;
  return (
    // The names are in the structure list too, so screen readers skip this copy.
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" data-testid="anatomy-labels" aria-hidden="true">
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        {placed.map((p) => (
          <g key={p.id}>
            <line x1={p.anchorX} y1={p.anchorY} x2={p.lineX} y2={p.lineY} className="stroke-ink" strokeWidth={1.5} />
            <circle cx={p.anchorX} cy={p.anchorY} r={3} className="fill-ink" />
          </g>
        ))}
      </svg>
      {placed.map((p) => (
        <span
          key={p.id}
          className="absolute flex items-center whitespace-nowrap rounded-md border border-line bg-page px-2 text-sm text-ink"
          style={{ left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${p.height}px` }}
        >
          {names.get(p.id)}
        </span>
      ))}
    </div>
  );
}

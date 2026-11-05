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
import { createGeneration, createOnDemandLoader, filesForLayer, fileReadyForStructureStatus, knownMissingStructureIds, idsForFiles, initialLayerPlan, firstLayer, layerNeedsReveal, needsBulkLayerConfirmation, visibilityAfterLayerDownload, lazyPeel, lazyRestore, PartialLoadError, revealTargetPlan, showAllPlan, structureLoadNote, type OnDemandLoader } from './anatomylazy';
import type { LabColors, LabScene, LoadResult } from './anatomyscene';
import { STRUCTURE_PAGE_SIZE, visibleStructureGroups } from './anatomy-list-window';
import { anatomyTriangleNote } from './anatomybudget';
import { createOpenAttemptGate } from './anatomyopen';
import {
  WHOLE_BODY_KEY,
  systemsForView,
  type Layer,
  layerShown,
  layersOf,
  unavailableLayersNote,
  nextToPeel,
  nextToRestore,
  toggleLayer,
} from './anatomylayers';
import {
  BODYPARTS3D_CREDIT_LEAD,
  BODYPARTS3D_LICENSE_NAME,
  BODYPARTS3D_LICENSE_URL,
  BEHIND_MARK,
  TEXT_FALLBACK_BATCH,
  EXPORT_SIZES,
  answerQuiz,
  anatomyFailureMessage,
  creditFor,
  exportFileName,
  groupStructures,
  labelLines,
  labelsToShow,
  leftOutNote,
  nameSourceFor,
  nextQuiz,
  pictureCreditFor,
  placeLabels,
  releaseNoteFor,
  onlyThis,
  revealQuiz,
  revealedQuizTarget,
  startQuiz,
  textFallbackItems,
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

/** A label on the 3D view: its box, and its name's lines (with "(behind)" for a structure hidden from this side). */
type OverlayLabel = PlacedLabel & Pick<ReturnType<typeof labelLines>, 'lines' | 'mark'>;

/** The label box's measurements, read from the same token-backed classes the label is drawn with. */
interface LabelMetrics {
  fontPx: number;
  line: number;
  padX: number;
  padY: number;
  borderX: number;
}

function readLabelMetrics(): LabelMetrics {
  const probe = document.createElement('span');
  probe.className = 'invisible absolute border px-2 py-1 text-sm leading-normal';
  probe.textContent = 'x';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const fontPx = parseFloat(style.fontSize) || 15;
  const metrics = {
    fontPx,
    line: parseFloat(style.lineHeight) || fontPx * 1.5,
    padX: parseFloat(style.paddingLeft) || 0,
    padY: parseFloat(style.paddingTop) || 0,
    borderX: parseFloat(style.borderLeftWidth) || 0,
  };
  probe.remove();
  return metrics;
}

/** The notes under the view about labels: which found no room, and what "(behind)" means. */
function labelNotes(names: ReadonlyMap<string, string>, leftOut: readonly string[], anyBehind: boolean): string[] {
  const notes: string[] = [];
  const missing = leftOutNote(leftOut.map((id) => names.get(id) ?? id));
  if (missing) notes.push(`${missing} turn or zoom the model, or hide some structures, to make room.`);
  if (anyBehind) notes.push(`a label marked ${BEHIND_MARK} names a structure hidden behind others from this side: turn the model to see it.`);
  return notes;
}

/** The label overlay's font, at the size the label's text-sm class resolves to. */
function measureLabel(font: string, fontPx: number): (s: string) => number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return (s) => s.length * (fontPx / 2);
  ctx.font = `400 ${fontPx}px ${font}`;
  return (s) => ctx.measureText(s).width;
}

/**
 * The anatomy lab (Task 178): one body system at a time, its structures listed by their official names, picking in 3D
 * or from the list, labels with leader lines, a "find it" quiz and picture export for Christian's posts and videos.
 * Nothing from three.js loads before the student taps "open the anatomy lab". Rendered client:only.
 */
export default function AnatomyLab({ systems: baseSystems, fixture, drafts }: Props) {
  const [phase, setPhase] = useState<Phase>('cover');
  const [textLimit, setTextLimit] = useState(TEXT_FALLBACK_BATCH);
  const systems = useMemo(() => {
    const wantsFixture = fixture && new URLSearchParams(window.location.search).has('fixture');
    // Build the combined catalog after an open attempt, including when 3D fails and students need the text fallback.
    // It is never duplicated in the unopened page's hydration data. Keep the fixture first.
    return systemsForView(baseSystems, phase === 'open' || phase === 'error', wantsFixture ? fixture : null);
  }, [baseSystems, fixture, phase]);
  const [systemKey, setSystemKey] = useState(systems[0]?.key ?? '');
  const [load, setLoad] = useState<SystemLoad>({ state: 'loading' });
  const [initialRetry, setInitialRetry] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [listLimit, setListLimit] = useState(STRUCTURE_PAGE_SIZE);
  const [labelsOn, setLabelsOn] = useState(false);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [transparent, setTransparent] = useState(false);
  const [exporting, setExporting] = useState<ExportSize | null>(null);
  const [exportNote, setExportNote] = useState('');
  const [announce, setAnnounce] = useState('');
  const [labelNote, setLabelNote] = useState<string[]>([]);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [layerError, setLayerError] = useState<{ layer: string; message: string; retry: () => void } | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(0);
  const [bulkPrompt, setBulkPrompt] = useState<{ systemKey: string; files: number } | null>(null);
  const generation = useMemo(() => createGeneration(), []);
  const openGate = useMemo(() => createOpenAttemptGate(), []);
  // Every explicit show/hide choice supersedes the visibility effect of earlier downloads.
  const visibilityIntent = useMemo(() => createGeneration(), []);
  const loaderRef = useRef<OnDemandLoader<LoadResult> | null>(null);

  const fallbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showAllButtonRef = useRef<HTMLButtonElement>(null);
  const confirmBulkButtonRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<LabScene | null>(null);
  const colorsRef = useRef<LabColors | null>(null);
  const readColorsRef = useRef<(() => LabColors) | null>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const activePointers = useRef(new Set<number>());
  const nextListFocusId = useRef<string | null>(null);
  const nextListItemRef = useRef<HTMLLIElement | null>(null);
  const labelIdsRef = useRef<string[]>([]);

  // A pending confirmation belongs only to the current system's models.
  useEffect(() => setBulkPrompt(null), [systemKey]);
  useEffect(() => {
    if (bulkPrompt?.systemKey === systemKey) confirmBulkButtonRef.current?.focus();
  }, [bulkPrompt, systemKey]);
  const setPlacedRef = useRef<((labels: OverlayLabel[]) => void) | null>(null);
  const labelNoteRef = useRef('');
  const measureRef = useRef<{ font: string; measure: (s: string) => number; metrics: LabelMetrics } | null>(null);

  const system = systems.find((s) => s.key === systemKey) ?? systems[0];
  const names = useMemo(() => new Map(system?.structures.map((s) => [s.id, s.text]) ?? []), [system]);
  const found = load.state === 'ready' ? load.result.found : [];
  const foundSet = useMemo(() => new Set(found), [found]);
  const visible = useMemo(() => found.filter((id) => !hidden.has(id)), [found, hidden]);
  const groups = useMemo(() => groupStructures(system?.structures ?? [], query), [system, query]);
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);
  const listedGroups = useMemo(() => visibleStructureGroups(groups, listLimit), [groups, listLimit]);
  const listedCount = Math.min(shownCount, listLimit);
  // After expanding, keyboard focus moves to the first new row, even if its 3D file is not loaded yet.
  useEffect(() => {
    if (nextListFocusId.current === null) return;
    nextListItemRef.current?.focus();
    nextListFocusId.current = null;
  }, [listLimit]);
  // The whole-body view fetches a layer's model files only when the student gets to it (src/islands/anatomylazy.ts).
  const lazy = system?.key === WHOLE_BODY_KEY && !!system.model.layerFiles;
  const layers = useMemo(
    () => (lazy ? layersOf(system?.structures ?? []) : layersOf(system?.structures ?? [], foundSet)),
    [lazy, system, foundSet],
  );
  const revealedTarget = revealedQuizTarget(quiz);
  const peelPlan = lazy ? lazyPeel(layers, hidden) : null;
  const toPeel = lazy ? (peelPlan ? peelPlan.show : null) : nextToPeel(layers, hidden);
  const toRestore = lazy ? lazyRestore(layers, hidden) : nextToRestore(layers, hidden);
  const layerGapNote = system?.key === WHOLE_BODY_KEY ? unavailableLayersNote(system.structures) : null;
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
    // Always tell the scene which labels are wanted (none too), so it checks what the camera sees only when needed.
    const points = scene && canvas ? scene.project(ids) : [];
    const showNotes = (notes: string[]) => {
      const key = notes.join('\n');
      if (key !== labelNoteRef.current) {
        labelNoteRef.current = key;
        setLabelNote(notes);
      }
    };
    if (!scene || !canvas || ids.length === 0) {
      setPlaced([]);
      showNotes([]);
      return;
    }
    const font = colorsRef.current?.font ?? 'sans-serif';
    if (measureRef.current?.font !== font) {
      const metrics = readLabelMetrics();
      measureRef.current = { font, measure: measureLabel(font, metrics.fontPx), metrics };
    }
    const { measure, metrics } = measureRef.current;
    const maxText = Math.min(240, Math.max(120, canvas.clientWidth * 0.42));
    const text = new Map<string, ReturnType<typeof labelLines>>();
    const anchors = points.map((point) => {
      const lines = labelLines(names.get(point.id) ?? point.id, point.behind, maxText, measure);
      text.set(point.id, lines);
      const count = lines.lines.length + (lines.mark === 'line' ? 1 : 0);
      return {
        ...point,
        width: Math.ceil(lines.width) + 2 * (metrics.padX + metrics.borderX) + 2,
        height: Math.ceil(count * metrics.line + 2 * metrics.padY),
      };
    });
    const model = scene.extent();
    const layout = placeLabels(anchors, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      offset: 16,
      ...(model ? { columns: { left: model.x, right: model.x + model.width } } : {}),
    });
    setPlaced(layout.placed.map((label) => ({ ...label, lines: text.get(label.id)!.lines, mark: text.get(label.id)!.mark })));
    // Labels off the edge of the view count as left out too, so a missing name is never silent.
    const projected = new Set(points.map((point) => point.id));
    const leftOut = [...ids.filter((id) => !projected.has(id)), ...layout.leftOut];
    showNotes(labelNotes(names, leftOut, layout.placed.some((label) => label.behind)));
  }, [names]);
  const updateLabelsRef = useRef(updateLabels);
  updateLabelsRef.current = updateLabels;
  useEffect(() => updateLabels(), [labelIds, updateLabels]);

  // ── Open: load three.js and the scene module only now ─────────────────────────────────────────────────────────────
  const open = useCallback(async () => {
    // A rapid double activation must not mount two WebGL renderers or OrbitControls on one canvas.
    if (sceneRef.current) return;
    const attempt = openGate.begin();
    if (attempt === null) return;
    // Clear stale model and interaction state before showing a retry canvas.
    // Otherwise a previously loaded structure can appear usable before the new GLB request starts.
    setLoad({ state: 'loading' });
    setSelected(null);
    setQuiz(null);
    setPending(new Set());
    setLayerError(null);
    setFilesLoaded(0);
    setExporting(null);
    setExportNote('');
    setAnnounce('');
    setPhase('opening');
    try {
      const { createLabScene, readColors } = await import('./anatomyscene');
      if (!openGate.isCurrent(attempt)) return;
      // Wait a frame so React has put the canvas on the page (the timeout covers background tabs, which get no frames).
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
        setTimeout(resolve, 250);
      });
      // Navigating away during the import or frame wait must not construct a WebGL scene afterwards.
      if (!openGate.isCurrent(attempt)) return;
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('The 3D view could not start.');
      readColorsRef.current = () => readColors();
      colorsRef.current = readColors();
      const scene = createLabScene({
        canvas,
        reducedMotion: prefersReducedMotion(),
        colors: colorsRef.current,
        onRender: () => updateLabelsRef.current(),
      });
      if (!openGate.isCurrent(attempt)) {
        scene.dispose();
        return;
      }
      sceneRef.current = scene;
      setPhase('open');
    } catch {
      if (!openGate.isCurrent(attempt)) return;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      // The original WebGL or network exception may contain internal paths and URLs.
      setPhase('error');
    } finally {
      // A failed opening can be retried, but stale completions can never release a newer attempt.
      openGate.finish(attempt);
    }
  }, [openGate]);

  // ── Load the chosen system (and only it); the scene disposes the previous one ────────────────────────────────────
  useEffect(() => {
    if (phase !== 'open' || !system) return;
    const scene = sceneRef.current;
    if (!scene) return;
    let current = true;
    // Drop the previous system's model and any layer still downloading before anything else (loading state follows).
    loaderRef.current?.retire();
    loaderRef.current = null;
    generation.bump();
    visibilityIntent.bump();
    setExporting(null);
    setExportNote('');
    scene.clear();
    setLoad({ state: 'loading' });
    setSelected(null);
    setQuiz(null);
    setPending(new Set());
    setLayerError(null);
    loaderRef.current = null;
    const wholeLayers = system.key === WHOLE_BODY_KEY && system.model.layerFiles ? layersOf(system.structures) : null;
    // Files can hold structures in several layers. Map all of their IDs now, while showing only the first layer.
    const initial = wholeLayers ? initialLayerPlan(system, wholeLayers) : null;
    setHidden(initial?.hidden ?? new Set());
    // Do not count an initial GLB as loaded until the scene confirms it has decoded successfully.
    setFilesLoaded(0);
    scene
      .load(initial?.files ?? (system.model.files ?? system.model.file), initial?.ids ?? system.structures.map((s) => s.id))
      .then((result) => {
        if (!current || !result) return;
        if (initial) {
          // Apply the first-layer visibility before the React ready-state effect runs.
          scene.setAppearance({ hidden: initial.hidden, selected: null });
          const loader = createOnDemandLoader<LoadResult>((url) => {
            const ids = idsForFiles(system, wholeLayers!, [url]);
            return scene.add(url, ids).then((r) => {
              if (!r || !current) throw new Error('The view changed while this layer downloaded.');
              return r;
            });
          });
          for (const url of initial.files) loader.markLoaded(url);
          loaderRef.current = loader;
          // Count actual cached GLBs after the initial lazy batch completes.
          setFilesLoaded(loader.loadedCount());
        } else {
          // The eager path also counts its model files, but only after successful decoding.
          setFilesLoaded((system.model.files ?? [system.model.file]).length);
        }
        setLoad({ state: 'ready', result });
        setAnnounce(`${system.title}: ${result.found.length} structures loaded.`);
      })
      .catch((err: unknown) => {
        if (!current) return;
        setLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      current = false;
      loaderRef.current?.retire();
    };
  }, [phase, system, initialRetry]);

  /** Shows a layer, fetching its model files first if the student has not got to it yet; `then` hides another after. */
  const reveal = useCallback(
    (layer: Layer, hideAfter?: Layer) => {
      const loader = loaderRef.current;
      if (!system || !loader) return;
      const run = () => {
        const intent = visibilityIntent.token();
        setLayerError(null);
        setPending((p) => new Set(p).add(layer.id));
        const take = (results: LoadResult[]) => {
          setFilesLoaded(loader.loadedCount());
          setLoad((prev) =>
            prev.state !== 'ready'
              ? prev
              : {
                  state: 'ready',
                  result: {
                    found: [...prev.result.found, ...results.flatMap((r) => r.found)],
                    missing: prev.result.missing.filter((id) => !results.some((r) => r.found.includes(id))),
                    triangles: prev.result.triangles + results.reduce((n, r) => n + r.triangles, 0),
                  },
                },
          );
        };
        loader
          .ensure(filesForLayer(system, layer.id))
          .then((results) => {
            if (loader.isRetired()) return; // the system changed while this layer downloaded
            take(results);
            // Geometry and structure counts always update. An older download must not
            // overwrite a newer "show only this", hide or layer choice.
            setHidden((h) => visibilityAfterLayerDownload(
              h, layer.ids, hideAfter?.ids ?? [], visibilityIntent.isCurrent(intent),
            ));
            if (visibilityIntent.isCurrent(intent)) {
              setAnnounce(hideAfter ? `peeled away ${hideAfter.id}, showing ${layer.id}` : `${layer.id} loaded and shown`);
            }
          })
          .catch((err: unknown) => {
            if (loader.isRetired()) return;
            // Files that did arrive are already in the scene: count them, so their structures are listed and quizzable.
            if (err instanceof PartialLoadError) take(err.results as LoadResult[]);
            if (visibilityIntent.isCurrent(intent)) {
              setLayerError({
                layer: layer.id,
                message: anatomyFailureMessage('layer', err),
                retry: () => { visibilityIntent.bump(); run(); },
              });
            }
          })
          .finally(() => loader.isRetired() || setPending((p) => new Set([...p].filter((id) => id !== layer.id))));
      };
      run();
    },
    [system, visibilityIntent],
  );

  /** Execute show all only after any phone confirmation, preserving newer visibility intent. */
  const showAllNow = () => {
    visibilityIntent.bump();
    const loader = loaderRef.current;
    if (!lazy || !system || !loader) {
      setHidden(new Set());
      return;
    }
    const plan = showAllPlan(layers, hidden, (id) => filesForLayer(system, id), (url) => loader.isLoaded(url));
    setHidden((h) => {
      const next = new Set(h);
      for (const id of plan.unhide) next.delete(id);
      return next;
    });
    for (const layer of plan.fetch) reveal(layer);
  };

  /** A phone's first tap must not trigger many additional GLB downloads. */
  const showAll = () => {
    const loader = loaderRef.current;
    if (lazy && system && loader) {
      const plan = showAllPlan(layers, hidden, (id) => filesForLayer(system, id), (url) => loader.isLoaded(url));
      const missingFiles = new Set(
        plan.fetch.flatMap((layer) => filesForLayer(system, layer.id).filter((url) => !loader.isLoaded(url))),
      );
      const phone = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
      if (needsBulkLayerConfirmation(phone, missingFiles.size)) {
        setBulkPrompt({ systemKey: system.key, files: missingFiles.size });
        return;
      }
    }
    setBulkPrompt(null);
    showAllNow();
  };

  const finishBulkPrompt = (confirm: boolean) => {
    const valid = bulkPrompt?.systemKey === system?.key && load.state === 'ready'
      && loaderRef.current !== null && !loaderRef.current.isRetired();
    setBulkPrompt(null);
    if (confirm && valid) showAllNow();
    showAllButtonRef.current?.focus();
  };

  // Once the correct target is found or revealed, it must remain visible and selected.
  // A learner can hide a structure before answering, or later hide its whole layer.
  useEffect(() => {
    if (!revealedTarget) return;
    setHidden((current) => {
      if (!current.has(revealedTarget)) return current;
      const next = new Set(current);
      next.delete(revealedTarget);
      return next;
    });
    setSelected((current) => (current === revealedTarget ? current : revealedTarget));
  }, [revealedTarget, hidden, selected]);

  useEffect(() => {
    if (load.state === 'ready') sceneRef.current?.setAppearance({ hidden, selected });
  }, [hidden, selected, load]);

  // Mobile devices may lose their WebGL context after the scene is open.
  // Retire GPU work immediately, but keep the accessible structure-name catalog available.
  useEffect(() => {
    if (phase !== 'open') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onContextLost = (event: Event) => {
      event.preventDefault();
      activePointers.current.clear();
      pointerRef.current = null;
      generation.bump();
      visibilityIntent.bump();
      loaderRef.current?.retire();
      loaderRef.current = null;
      const lostScene = sceneRef.current;
      sceneRef.current = null;
      try {
        lostScene?.dispose();
      } catch {
        // A lost GPU resource may throw during disposal. Text access must still work.
      }
      setExporting(null);
      setExportNote('');
      setPending(new Set());
      setLayerError(null);
      setPhase('error');
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    return () => canvas.removeEventListener('webglcontextlost', onContextLost);
  }, [phase, generation, visibilityIntent]);

  useEffect(() => () => {
    openGate.cancel();
    sceneRef.current?.dispose();
    sceneRef.current = null;
  }, [openGate]);

  useEffect(() => {
    if (phase === 'open') canvasRef.current?.focus();
    if (phase === 'error') fallbackHeadingRef.current?.focus();
  }, [phase]);

  // ── Theme: Daytime / Evening, from the device or the footer's pick ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'open') return;
    const refresh = () => {
      const read = readColorsRef.current;
      if (!read) return;
      colorsRef.current = read();
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
        // Once the answer is shown or found, further clicks must not move the highlight off the target.
        if (quiz.feedback?.kind === 'shown' || quiz.feedback?.kind === 'right') return;
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
    // In quizzes, choose the nearest hit rather than favoring a previous selection.
    const id = sceneRef.current?.pick(e.clientX, e.clientY, quiz === null) ?? null;
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
    const mine = generation.token();
    setExporting(size);
    setExportNote('');
    try {
      // The labels on screen, or else the selected structure's name.
      const ids = labelIds.length ? labelIds : selected && !hidden.has(selected) ? [selected] : [];
      const { blob, leftOut, behind } = await scene.exportPicture({
        size,
        transparent,
        title: system.title,
        credit: pictureCreditFor(system),
        labels: ids.map((id) => ({ id, text: names.get(id) ?? id })),
      });
      if (!generation.isCurrent(mine)) return; // the system changed while the picture was drawn
      const fileName = exportFileName(system.key, selected && !hidden.has(selected) ? (names.get(selected) ?? null) : null, size);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExportNote([`saved ${fileName}.`, ...labelNotes(names, leftOut, behind.length > 0)].join(' '));
    } catch (err) {
      if (!generation.isCurrent(mine)) return;
      setExportNote(anatomyFailureMessage('picture', err));
    } finally {
      if (generation.isCurrent(mine)) setExporting(null);
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
    const rows = textFallbackItems(groups, textLimit);
    return (
      <div className="space-y-6">
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <div role="alert">
            <h2 ref={fallbackHeadingRef} tabIndex={-1} className="text-lg text-ink">
              the 3D anatomy lab could not open.
            </h2>
          </div>
          <p className="text-sm text-ink-soft">you can still search the original structure names below.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={secondaryButton} onClick={() => void open()}>try 3D again</button>
            <a href="/learn" className="inline-flex min-h-11 items-center text-sm underline">browse the lessons</a>
          </div>
        </div>

        {systems.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-sm text-ink-soft">body system</legend>
            <div className="flex flex-wrap gap-2">
              {systems.map((choice) => (
                <button key={choice.key} type="button" className={secondaryButton}
                  aria-pressed={choice.key === system.key}
                  onClick={() => { setSystemKey(choice.key); setQuery(''); setTextLimit(TEXT_FALLBACK_BATCH); }}>
                  {choice.title}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <section aria-labelledby="anatomy-text-fallback-heading" className="space-y-3">
          <h2 id="anatomy-text-fallback-heading" className="text-lg text-ink">structure names: {system.title}</h2>
          {drafts && system.status === 'draft' && (
            <p className="rounded-md border border-line px-3 py-2 text-sm text-ink">
              draft · labels waiting for review
            </p>
          )}
          <p className="text-sm text-ink-soft">{nameSourceFor(system)}</p>
          <div className="space-y-1 text-sm text-ink-soft" data-testid="anatomy-fallback-attribution">
            <p>
              {system.fixture ? (
                creditFor(system)
              ) : (
                <>
                  {BODYPARTS3D_CREDIT_LEAD}{' '}
                  <a className="underline" href={BODYPARTS3D_LICENSE_URL} rel="license noopener">
                    {BODYPARTS3D_LICENSE_NAME}
                  </a>
                </>
              )}
            </p>
            <p>{releaseNoteFor(system)}</p>
          </div>
          <label className="block text-sm text-ink" htmlFor="anatomy-fallback-search">find a structure</label>
          <input id="anatomy-fallback-search" type="search" value={query} autoComplete="off"
            onChange={(event) => { setQuery(event.target.value); setTextLimit(TEXT_FALLBACK_BATCH); }}
            className="min-h-11 w-full rounded-md border border-control bg-page px-3 text-ink"
          />
          <p role="status" className="text-sm text-ink-soft">
            showing {rows.length} of {shownCount} matching structures
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-ink-soft">no structure names match this search.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((item) => (
                <li key={item.id} className="rounded-md border border-line px-3 py-2 text-sm text-ink">
                  {item.text}
                  {item.group && <span className="block text-ink-soft">{item.group}</span>}
                </li>
              ))}
            </ul>
          )}
          {rows.length < shownCount && (
            <button type="button" className={secondaryButton}
              onClick={() => setTextLimit((limit) => limit + TEXT_FALLBACK_BATCH)}>
              show {Math.min(TEXT_FALLBACK_BATCH, shownCount - rows.length)} more structures
            </button>
          )}
        </section>
      </div>
    );
  }

  const selectedName = selected ? (names.get(selected) ?? selected) : null;
  const selectedGroup = selected ? system.structures.find((s) => s.id === selected)?.group : undefined;
  const budget = load.state === 'ready' ? anatomyTriangleNote(load.result.triangles, filesLoaded, lazy) : null;
  const ready = load.state === 'ready';
  // A completed download is not yet part of the found-ID set while a layer batch settles.
  const fileIntegratedForStatus = (url: string) =>
    fileReadyForStructureStatus(loaderRef.current?.isLoaded(url) ?? false, pending.size);
  // Check all eligible model files before reporting a missing structure.
  const missingCount = !ready
    ? 0
    : lazy
      ? knownMissingStructureIds(
          system.structures,
          foundSet,
          (layerId) => filesForLayer(system, layerId),
          system.model.files ?? [system.model.file],
          fileIntegratedForStatus,
        ).length
      : load.result.missing.length;
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
                onClick={() => {
                  if (s.key === system.key) return;
                  // Invalidate a pending PNG before React's system-change effect runs.
                  generation.bump();
                  nextListFocusId.current = null;
                  setListLimit(STRUCTURE_PAGE_SIZE);
                  // A search for one system must not make the next system appear to have no structures.
                  setQuery('');
                  setSystemKey(s.key);
                }}
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
              className="block aspect-square w-full rounded-lg border border-line bg-page md:aspect-lab-view"
              style={{ touchAction: 'none' }}
            />
            <LabelOverlay setterRef={setPlacedRef} onMount={updateLabels} />
            {(phase === 'opening' || load.state === 'loading') && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface">
                <span className="text-sm text-ink-soft">loading {system.title}…</span>
              </div>
            )}
            {load.state === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-surface p-4 text-center">
                <p role="alert" className="text-sm text-ink">could not load {system.title}. check the connection and try again.</p>
                <button type="button" className={secondaryButton} onClick={() => setInitialRetry((count) => count + 1)}>
                  try loading again
                </button>
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
            <button ref={showAllButtonRef} type="button" className={secondaryButton} disabled={!ready} onClick={showAll}>show all</button>
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
          {bulkPrompt?.systemKey === system.key && (
            <div
              role="group"
              aria-label="confirm loading every body layer"
              className="space-y-3 rounded-lg border border-line bg-surface p-4"
              data-testid="anatomy-bulk-confirm"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  finishBulkPrompt(false);
                }
              }}
            >
              <p role="status" className="text-sm text-ink">
                showing every layer would download {bulkPrompt.files} more 3D model files. on a phone, this can slow
                the view or make it stop responding. choose whether to continue.
              </p>
              <div className="flex flex-wrap gap-2">
                <button ref={confirmBulkButtonRef} type="button" className={primaryButton} onClick={() => finishBulkPrompt(true)}>
                  load every layer
                </button>
                <button type="button" className={secondaryButton} onClick={() => finishBulkPrompt(false)}>
                  keep current view
                </button>
              </div>
            </div>
          )}
          {layers.length > 1 && (
            <fieldset className="space-y-3 rounded-lg border border-line p-4">
              <legend className="px-1 text-sm text-ink-soft">layers, skin to bone</legend>
              <div className="flex flex-wrap gap-2">
                {layers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    className={secondaryButton}
                    aria-pressed={layerShown(layer, hidden)}
                    disabled={!ready || pending.has(layer.id)}
                    onClick={() => {
                      if (pending.has(layer.id)) return;
                      visibilityIntent.bump();
                      if (lazy && layerNeedsReveal(
                        layer, hidden, filesForLayer(system, layer.id), (url) => loaderRef.current?.isLoaded(url) ?? false,
                      )) reveal(layer);
                      else setHidden((h) => toggleLayer(h, layer));
                    }}
                  >
                    {layer.id} ({layer.ids.length}){pending.has(layer.id) ? ', loading' : ''}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={!ready || !toPeel || pending.size > 0}
                  onClick={() => {
                    if (!toPeel || pending.size > 0) return;
                    visibilityIntent.bump();
                    if (peelPlan) {
                      reveal(peelPlan.show, peelPlan.hide);
                      return;
                    }
                    setHidden((h) => toggleLayer(h, toPeel));
                    setAnnounce(`peeled away ${toPeel.id}`);
                  }}
                >
                  peel a layer{toPeel ? `: ${toPeel.id}` : ''}
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={!ready || !toRestore || pending.size > 0}
                  onClick={() => {
                    if (!toRestore || pending.size > 0) return;
                    visibilityIntent.bump();
                    if (lazy) reveal(toRestore);
                    else setHidden((h) => toggleLayer(h, toRestore));
                    setAnnounce(`put back ${toRestore.id}`);
                  }}
                >
                  put a layer back{toRestore ? `: ${toRestore.id}` : ''}
                </button>
              </div>
              {layerGapNote && (
                <p className="text-sm text-ink-soft" data-testid="anatomy-layer-gaps">
                  {layerGapNote}
                </p>
              )}
              {system.key === WHOLE_BODY_KEY && (
                <p className="text-sm text-ink-soft" data-testid="anatomy-files">
                  the whole body starts with the outer layer only; each deeper layer downloads when you open it.
                  model files loaded: {filesLoaded} of {system.model.files?.length ?? 0}.
                </p>
              )}
              {pending.size > 0 && (
                <p role="status" className="text-sm text-ink" data-testid="anatomy-layer-loading">
                  loading {[...pending].join(', ')}…
                </p>
              )}
              {layerError && (
                <div role="alert" className="space-y-2 rounded-md border border-line px-3 py-2 text-sm text-ink">
                  <p>
                    Could not load {layerError.layer}. <span className="text-ink-soft">{layerError.message}</span>
                  </p>
                  <button type="button" className={secondaryButton} onClick={layerError.retry}>
                    try {layerError.layer} again
                  </button>
                </div>
              )}
            </fieldset>
          )}
          {labelsOn && !quiz && visible.length > labelIds.length && (
            <p className="text-sm text-ink-soft">
              {selected ? 'with this many structures showing, only the selected one is labeled.' : 'with this many structures showing, select one to label it.'}
            </p>
          )}
          {labelNote.length > 0 && (
            <div className="space-y-1 text-sm text-ink-soft" data-testid="anatomy-label-note">
              {labelNote.map((note) => <p key={note}>{note}</p>)}
            </div>
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
            {budget && <p className="text-ink" data-testid="anatomy-budget-note">{budget}</p>}
            {ready && missingCount > 0 && (
              <p data-testid="anatomy-missing-count">
                {missingCount} listed structures were not found in the loaded model files.
              </p>
            )}
          </div>

          {selectedName && !quiz && (
            <section className="rounded-lg border border-line bg-surface p-4" aria-labelledby="anatomy-name-card">
              <h2 id="anatomy-name-card" className="text-lg text-ink">{selectedName}</h2>
              {selectedGroup && <p className="text-sm text-ink-soft">{selectedGroup}</p>}
              <p className="mt-1 text-sm text-ink-soft">{nameSourceFor(system)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={secondaryButton} onClick={() => { visibilityIntent.bump(); setHidden(onlyThis(system.structures.map((s) => s.id), selected!)); }}>
                  show only this
                </button>
                <button type="button" className={secondaryButton} onClick={() => { visibilityIntent.bump(); setHidden((h) => toggleHidden(h, selected!)); }}>
                  {hidden.has(selected!) ? 'show it' : 'hide it'}
                </button>
                <button type="button" className={secondaryButton} onClick={() => setSelected(null)}>clear selection</button>
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-line p-4" aria-labelledby="anatomy-quiz-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="anatomy-quiz-heading" className="text-lg text-ink">find it</h2>
              <button type="button" className={secondaryButton} aria-pressed={quiz !== null} disabled={!ready || (quiz === null && quizPool.length === 0)} onClick={toggleQuiz}>
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
                          visibilityIntent.bump();
                          setQuiz(revealQuiz(quiz));
                          setSelected(quiz.target);
                          // The target may have been hidden by the student (or its layer peeled away): put it back.
                          const target = quiz.target;
                          if (!target) return;
                          const loader = loaderRef.current;
                          const plan = revealTargetPlan(
                            layers,
                            hidden,
                            target,
                            (id) => (lazy && system ? filesForLayer(system, id) : []),
                            (url) => loader?.isLoaded(url) ?? true,
                            foundSet,
                          );
                          if (plan.fetch) reveal(plan.fetch);
                          else setHidden((h) => {
                            const next = new Set(h);
                            for (const id of plan.unhide) next.delete(id);
                            return next;
                          });
                        }}
                      >
                        show me
                      </button>
                      <button
                        type="button"
                        className={primaryButton}
                        onClick={() => {
                          visibilityIntent.bump();
                          const next = nextQuiz(quiz, Math.random);
                          setSelected(null);
                          setQuiz(next);
                          // A learner may have hidden a future target during the round, or an earlier peel may still be finishing.
                          // Make that target visible before asking them to find it, superseding pending peels.
                          const target = next.target;
                          if (target) setHidden((current) => {
                            if (!current.has(target)) return current;
                            const shown = new Set(current);
                            shown.delete(target);
                            return shown;
                          });
                        }}
                      >
                        next
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={primaryButton}
                        disabled={quizPool.length === 0}
                        onClick={() => setQuiz(startQuiz(quizPool, Math.random))}
                      >
                        start again
                      </button>
                      {quizPool.length === 0 && (
                        <p className="text-sm text-ink-soft">show a structure to start another round.</p>
                      )}
                    </>
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
            onChange={(e) => {
              nextListFocusId.current = null;
              setListLimit(STRUCTURE_PAGE_SIZE);
              setQuery(e.target.value);
            }}
            className="min-h-11 w-full rounded-md border border-control bg-page px-3 text-ink"
            autoComplete="off"
          />
          <p className="text-sm text-ink-soft" aria-live="polite">
            {listedCount < shownCount
              ? `showing ${listedCount} of ${shownCount} structures`
              : shownCount === 1 ? '1 structure' : `${shownCount} structures`}
          </p>
          <div className="space-y-4">
            {listedGroups.map((group) => (
              <div key={group.group ?? '—'}>
                {group.group && <h3 className="text-sm text-ink-soft">{group.group}</h3>}
                <ul className="mt-1 space-y-1">
                  {group.items.map((item) => {
                    const inModel = foundSet.has(item.id);
                    const isHidden = hidden.has(item.id);
                    const loadNote = structureLoadNote(
                      item, foundSet, lazy, (id) => filesForLayer(system, id),
                      system.model.files ?? [], fileIntegratedForStatus,
                    );
                    return (
                      <li
                        key={item.id}
                        ref={nextListFocusId.current === item.id ? nextListItemRef : undefined}
                        tabIndex={nextListFocusId.current === item.id ? -1 : undefined}
                        className="flex items-stretch gap-1"
                      >
                        <button
                          type="button"
                          aria-pressed={selected === item.id}
                          disabled={!ready || !inModel}
                          onClick={() => pickStructure(item.id)}
                          className="min-h-11 min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-left text-sm text-ink aria-pressed:border-button aria-pressed:bg-button aria-pressed:text-on-button disabled:opacity-60"
                        >
                          {item.text}
                          {isHidden && inModel && <span> (hidden)</span>}
                          {ready && !inModel && loadNote && <span> ({loadNote})</span>}
                        </button>
                        {inModel && (
                          <button
                            type="button"
                            aria-label={`${isHidden ? 'show' : 'hide'} ${item.text}`}
                            disabled={revealedTarget === item.id}
                            onClick={() => { visibilityIntent.bump(); setHidden((h) => toggleHidden(h, item.id)); }}
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
            {listedCount < shownCount && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  nextListFocusId.current = groups.flatMap((group) => group.items)[listedCount]?.id ?? null;
                  setListLimit((current) => current + STRUCTURE_PAGE_SIZE);
                }}
              >
                show {Math.min(STRUCTURE_PAGE_SIZE, shownCount - listedCount)} more structures
              </button>
            )}
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
  onMount,
}: {
  setterRef: MutableRefObject<((labels: OverlayLabel[]) => void) | null>;
  onMount: () => void;
}) {
  const [placed, setPlaced] = useState<OverlayLabel[]>([]);
  useEffect(() => {
    setterRef.current = setPlaced;
    onMount();
    return () => {
      setterRef.current = null;
    };
  }, [setterRef, onMount]);
  if (placed.length === 0) return null;
  return (
    // The names are in the structure list too, so screen readers skip this copy. A label whose structure is hidden
    // behind others from this side says "(behind)" and has a dashed line, box and hollow dot: never color alone.
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" data-testid="anatomy-labels" aria-hidden="true">
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        {placed.map((p) => (
          <g key={p.id} data-behind={p.behind ? '' : undefined}>
            <line
              x1={p.anchorX}
              y1={p.anchorY}
              x2={p.lineX}
              y2={p.lineY}
              className={p.behind ? 'stroke-ink-soft' : 'stroke-ink'}
              strokeWidth={1.5}
              strokeDasharray={p.behind ? '5 4' : undefined}
            />
            <circle
              cx={p.anchorX}
              cy={p.anchorY}
              r={3}
              className={p.behind ? 'fill-page stroke-ink-soft' : 'fill-ink'}
              strokeWidth={p.behind ? 1.5 : undefined}
            />
          </g>
        ))}
      </svg>
      {placed.map((p) => (
        <span
          key={p.id}
          data-behind={p.behind ? '' : undefined}
          className={`absolute flex flex-col justify-center rounded-md border bg-page px-2 text-sm leading-normal whitespace-nowrap text-ink ${p.behind ? 'border-dashed border-ink-soft' : 'border-line'}`}
          style={{ left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${p.height}px` }}
        >
          {p.lines.map((line, i) => (
            <span key={i} className="block">
              {line}
              {p.mark === 'inline' && i === p.lines.length - 1 && <span className="text-ink-soft"> {BEHIND_MARK}</span>}
            </span>
          ))}
          {p.mark === 'line' && <span className="block text-ink-soft">{BEHIND_MARK}</span>}
        </span>
      ))}
    </div>
  );
}

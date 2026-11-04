/**
 * Pure logic for the anatomy lab (Task 178). No three.js, no DOM: everything here is unit tested
 * (tests/unit/anatomylab.test.ts). The three.js side is src/islands/anatomyscene.ts, loaded only after the student taps
 * "open the anatomy lab".
 *
 * Data contract (Task 177): one source file per body system, `content/visuals/anatomy-<system>.json`, with the Visual
 * shape from src/visuals/sources.ts plus `model: { file, release, via? }`. Each label's `id` is the name of a mesh node
 * in the system's .glb (a BodyParts3D structure id such as FMA7204) and its `text` is BodyParts3D's official name,
 * shown exactly as written (CLAUDE.md rule 5).
 */

import { LAYERS, isLayer, type LayerId } from './anatomylayers';

// ---------------------------------------------------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------------------------------------------------

export interface AnatomyStructure {
  /** The mesh node's name in the .glb, e.g. "FMA7204". */
  id: string;
  /** The official name, exactly as the source file gives it. */
  text: string;
  group?: string;
  /** Its layer for peeling (skin … skeleton), from the source file, which takes it from BodyParts3D's hierarchy. */
  layer?: LayerId;
}

/** What the island gets for one body system: only what it shows (sources stay at build time). */
export interface AnatomySystem {
  /** "heart", from the file name anatomy-heart.json. */
  key: string;
  title: string;
  status: 'draft' | 'approved';
  /** `files`: the whole-body view loads several systems' models together (src/islands/anatomylayers.ts). */
  model: { file: string; files?: string[]; release: string; via?: string; layerFiles?: Record<string, string[]>; fileIds?: Record<string, string[]> };
  structures: AnatomyStructure[];
  /** The automated tests' fixture: shapes made in code, not anatomy and not from BodyParts3D. */
  fixture?: boolean;
}

/** The credit under every 3D view and on every exported picture (BodyParts3D is CC BY 4.0; we recolor and simplify). */
export const BODYPARTS3D_CREDIT_LEAD =
  '3D model: Cueory, adapted from BodyParts3D, © The Database Center for Life Science licensed under';
/** The license's name, linked to BODYPARTS3D_LICENSE_URL under the 3D view. */
export const BODYPARTS3D_LICENSE_NAME = 'CC Attribution 4.0 International';
export const BODYPARTS3D_CREDIT = `${BODYPARTS3D_CREDIT_LEAD} ${BODYPARTS3D_LICENSE_NAME}`;
export const BODYPARTS3D_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const FIXTURE_CREDIT = 'test shapes made in code for automated tests: not anatomy, not from BodyParts3D';

export function creditFor(system: Pick<AnatomySystem, 'fixture'>): string {
  return system.fixture ? FIXTURE_CREDIT : BODYPARTS3D_CREDIT;
}

/**
 * The line about the model's release, under the 3D view and on every exported picture. A draft says so, so a picture of
 * a draft model is never mistaken for a reviewed one: "draft model, built from BodyParts3D 3.0 (2011-09-15)".
 */
export function releaseNoteFor(system: Pick<AnatomySystem, 'status' | 'model' | 'fixture'>): string {
  return system.status === 'draft' && !system.fixture
    ? `draft model, built from ${system.model.release}`
    : `model release: ${system.model.release}`;
}

/** The full credit drawn at the bottom of an exported picture: the credit, then the release note. */
export function pictureCreditFor(system: Pick<AnatomySystem, 'status' | 'model' | 'fixture'>): string {
  return `${creditFor(system)} · ${releaseNoteFor(system)}`;
}

/**
 * The picture can use a browser fallback font if a self-hosted face fails.
 * A rejected FontFaceSet.load() (or one that throws) must never prevent
 * drawing the model, its title, labels and mandatory source credit.
 */
export async function preparePictureFonts(
  declarations: readonly string[],
  load: (declaration: string) => Promise<unknown>,
  maxWaitMs = 1_500,
): Promise<void> {
  // A font request can stay pending indefinitely. Give both faces a short
  // chance to load, then let Canvas use a fallback so exporting still works.
  // allSettled also observes late rejections after the deadline.
  const finished = Promise.allSettled(
    declarations.map((declaration) => Promise.resolve().then(() => load(declaration))),
  ).then(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      finished,
      new Promise<void>((resolve) => { timer = setTimeout(resolve, maxWaitMs); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * The selected mesh is opaque while other structures become translucent.
 * When two visible meshes overlap under the pointer, prefer the selected one
 * if the ray actually crosses its geometry. Otherwise choose the nearest hit.
 * The quiz disables this preference so earlier picks cannot bias answers.
 */
export function pickedStructure(
  hitsNearestFirst: readonly string[],
  selected: string | null,
): string | null {
  if (selected && hitsNearestFirst.includes(selected)) return selected;
  return hitsNearestFirst[0] ?? null;
}

/**
 * Never put loader or renderer exception text in student-facing messages.
 * Browser and network errors can contain raw URLs, file paths and internal details.
 */
export function anatomyFailureMessage(kind: 'layer' | 'picture', _cause: unknown): string {
  return kind === 'layer'
    ? 'please try this layer again. if it still fails, choose another body system.'
    : 'could not save the picture. please try again.';
}

/** Where a structure's name comes from, shown on its name card. */
export function nameSourceFor(system: Pick<AnatomySystem, 'fixture'>): string {
  return system.fixture ? 'name from the test fixture' : 'name from the BodyParts3D parts list';
}

/** "content/visuals/anatomy-skeleton-axial.json" → "skeleton-axial"; null for any other file. */
export function systemKeyFromPath(path: string): string | null {
  const match = /(?:^|\/)anatomy-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(path);
  return match ? match[1]! : null;
}

const STRUCTURE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
// The synthetic fixture has a preview-only route. Every real source manifest
// must point to the GLB generated for its own anatomy-<system>.json file.
const FIXTURE_MODEL_FILE = '/preview/anatomy-fixture/fixture.glb';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
}

/**
 * Reads one anatomy source file. Throws a plain message naming the file when it doesn't fit the contract, so the build
 * stops instead of showing a broken lab.
 */
export function parseAnatomyFile(json: unknown, path: string, options: { fixture?: boolean } = {}): AnatomySystem {
  const key = systemKeyFromPath(path);
  const fail = (what: string): never => {
    throw new Error(`${path}: ${what}`);
  };
  if (!key) fail('an anatomy file is named anatomy-<system>.json');
  if (!isRecord(json)) fail('the file must hold one JSON object');
  const file = json as Record<string, unknown>;
  // Refuse unrelated visual kinds and sources bound to the wrong anatomy model.
  if (file['id'] !== `anatomy-${key}`) fail('"id" must match the anatomy source filename');
  if (file['kind'] !== 'model') fail('"kind" must be "model"');
  if (!text(file['title'], 120)) fail('"title" must be a short line of text');
  const status = file['status'];
  if (status !== 'draft' && status !== 'approved') fail('"status" must be "draft" or "approved"');
  const model = file['model'];
  if (!isRecord(model)) fail('"model" must be { file, release }');
  const m = model as Record<string, unknown>;
  // Accept an exact per-system GLB or the explicit synthetic fixture, never
  // an arbitrary public path or another system's 3D model.
  const expectedModel = options.fixture ? FIXTURE_MODEL_FILE : `/models/anatomy/${key}.glb`;
  if (m['file'] !== expectedModel) fail(`"model.file" must be ${expectedModel}`);
  if (!text(m['release'], 80)) fail('"model.release" must name the model release');
  if (m['via'] !== undefined && !text(m['via'], 200)) fail('"model.via", when given, must be a short line of text');
  const labels = file['labels'];
  if (!Array.isArray(labels) || labels.length === 0) fail('"labels" must list at least one structure');
  const seen = new Set<string>();
  const structures: AnatomyStructure[] = (labels as unknown[]).map((label, index) => {
    if (!isRecord(label)) return fail(`label ${index + 1} must be an object`);
    const id = label['id'];
    if (typeof id !== 'string' || !STRUCTURE_ID.test(id)) return fail(`label ${index + 1} needs an "id" like FMA7204`);
    if (seen.has(id)) return fail(`two labels have the id "${id}"`);
    seen.add(id);
    if (!text(label['text'], 200)) return fail(`label "${id}" needs its official name in "text"`);
    if (!text(label['source'], 120)) return fail(`label "${id}" needs a "source"`);
    const group = label['group'];
    if (group !== undefined && !text(group, 120)) return fail(`label "${id}": "group", when given, must be text`);
    const layer = label['layer'];
    if (layer !== undefined && !isLayer(layer)) return fail(`label "${id}": "layer", when given, is one of ${LAYERS.join(', ')}`);
    const structure: AnatomyStructure = { id, text: label['text'] as string };
    if (typeof group === 'string') structure.group = group;
    if (isLayer(layer)) structure.layer = layer;
    return structure;
  });
  const out: AnatomySystem = {
    key: key!,
    title: file['title'] as string,
    status: status as AnatomySystem['status'],
    model: { file: m['file'] as string, release: m['release'] as string },
    structures,
  };
  if (typeof m['via'] === 'string') out.model.via = m['via'];
  if (options.fixture) out.fixture = true;
  return out;
}

/** Systems in a stable order: by title, then key. */
export function sortSystems(systems: readonly AnatomySystem[]): AnatomySystem[] {
  return [...systems].sort((a, b) => a.title.localeCompare(b.title, 'en') || a.key.localeCompare(b.key, 'en'));
}

// ---------------------------------------------------------------------------------------------------------------------
// The draft gate (D-56: a draft never reaches the live site)
// ---------------------------------------------------------------------------------------------------------------------

/** The build variables the gate reads. Cloudflare Workers Builds injects WORKERS_CI=1 and WORKERS_CI_BRANCH. */
export interface BuildEnv {
  WORKERS_CI?: string | undefined;
  WORKERS_CI_BRANCH?: string | undefined;
  /** Explicit opt-in for local and test builds (the Playwright config sets it); never set on a deployed build. */
  CUEORY_ANATOMY_DRAFTS?: string | undefined;
}

/** The live site's branch (wrangler.jsonc: production branch `main`). */
export const PRODUCTION_BRANCH = 'main';

/**
 * May this build show drafts? Workers Builds (WORKERS_CI=1) builds every branch: drafts only when it names a branch and
 * that branch isn't `main`. A Workers build that doesn't say which branch counts as the live site, so a missing
 * variable can never leak drafts. Fails closed: any other build (a plain `npm run build`, an uploaded dist/) excludes
 * drafts unless CUEORY_ANATOMY_DRAFTS=1 says so on purpose.
 */
export function draftsAllowed(env: BuildEnv): boolean {
  if (env.WORKERS_CI !== '1') return env.CUEORY_ANATOMY_DRAFTS === '1';
  const rawBranch = env.WORKERS_CI_BRANCH?.trim();
  // Cloudflare normally supplies a short branch name. A full Git ref for
  // refs/heads/main must also be recognized as production.
  const branch = rawBranch?.startsWith('refs/heads/')
    ? rawBranch.slice('refs/heads/'.length)
    : rawBranch;
  return Boolean(branch) && branch !== PRODUCTION_BRANCH;
}

/** The systems a build may show: approved ones always, drafts only where `draftsAllowed`. */
export function systemsForBuild(systems: readonly AnatomySystem[], env: BuildEnv): AnatomySystem[] {
  const drafts = draftsAllowed(env);
  return systems.filter((system) => system.status === 'approved' || drafts);
}

export interface LabData {
  /** The body systems this build shows, in picker order. */
  systems: AnatomySystem[];
  /** The tests' fixture system: only in builds that may show drafts, and only shown with ?fixture in the address. */
  fixture: AnatomySystem | null;
  /** True when this build shows drafts (and so their "draft · labels waiting for review" note). */
  drafts: boolean;
}

/**
 * Everything the anatomy lab page hands to the island, decided at build time. On the live site's build nothing that
 * isn't approved is returned, so no draft name ever reaches the page's HTML.
 */
export function labDataForBuild(
  files: Readonly<Record<string, unknown>>,
  fixtureJson: unknown,
  env: BuildEnv,
): LabData {
  const drafts = draftsAllowed(env);
  const parsed = Object.entries(files)
    .filter(([path]) => systemKeyFromPath(path) !== null)
    .map(([path, json]) => parseAnatomyFile(json, path));
  return {
    systems: sortSystems(systemsForBuild(parsed, env)),
    fixture: drafts ? parseAnatomyFile(fixtureJson, 'tests/fixtures/anatomy-fixture.json', { fixture: true }) : null,
    drafts,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Structure list: search and grouping
// ---------------------------------------------------------------------------------------------------------------------

/** Lowercase, accents removed, runs of spaces and punctuation collapsed, so "Left  ventricle" finds "left ventricle". */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when every word of the query starts a word of the name, in any order: "cube b" finds "fixture cube B". */
export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const words = normalizeSearch(name).split(' ');
  return q.split(' ').every((part) => words.some((word) => word.startsWith(part)));
}

export interface StructureGroup {
  /** The group's name, or null for structures without one. */
  group: string | null;
  items: AnatomyStructure[];
}

/** The list as shown: groups in the order they first appear, items in file order, filtered by the search. */
export function groupStructures(structures: readonly AnatomyStructure[], query = ''): StructureGroup[] {
  const groups = new Map<string | null, AnatomyStructure[]>();
  for (const structure of structures) {
    if (!matchesSearch(structure.text, query)) continue;
    const key = structure.group ?? null;
    const list = groups.get(key);
    if (list) list.push(structure);
    else groups.set(key, [structure]);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

/** Keep a text-only fallback usable on phones even with a large whole-body catalog. */
export const TEXT_FALLBACK_BATCH = 40;

/** The first `limit` matching names, preserving group order; searching still checks the entire catalog. */
export function textFallbackItems(groups: readonly StructureGroup[], limit: number): AnatomyStructure[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return [];
  const entries: AnatomyStructure[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (entries.length >= limit) return entries;
      entries.push(item);
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------------------------------------------------

export function toggleHidden(hidden: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(hidden);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** A hidden selected structure remains named in the UI, but cannot dim the structures still visible. */
export function visibleSelection(selected: string | null, hidden: ReadonlySet<string>): string | null {
  return selected !== null && !hidden.has(selected) ? selected : null;
}

/** "show only this": every other structure hidden. */
export function onlyThis(all: readonly string[], id: string): Set<string> {
  return new Set(all.filter((other) => other !== id));
}

/** The most labels drawn at once; with more structures visible, only the selected one is labeled. */
export const MAX_LABELS = 12;

export function labelsToShow(
  visible: readonly string[],
  selected: string | null,
  max: number = MAX_LABELS,
): string[] {
  if (visible.length <= max) return [...visible];
  return selected && visible.includes(selected) ? [selected] : [];
}

// ---------------------------------------------------------------------------------------------------------------------
// "Find it" quiz
// ---------------------------------------------------------------------------------------------------------------------

export interface QuizState {
  /** The eligible structure IDs fixed when this round starts, even if visibility changes. */
  pool: string[];
  /** The structure to find, or null when every structure in the round has been asked. */
  target: string | null;
  /** Targets already asked this round, in order (the current one included). */
  asked: string[];
  /** Questions answered (first pick, or "show me" before any pick). */
  answered: number;
  /** Questions whose first pick was right. */
  right: number;
  /** The last pick's result for the current question, or "shown" after "show me". */
  feedback: null | { kind: 'right' | 'wrong'; picked: string } | { kind: 'shown' };
  /** True once the current question has counted towards the score. */
  scored: boolean;
}

/** The target must stay visible once its answer is shown or found, even if layer controls are used. */
export function revealedQuizTarget(state: Pick<QuizState, 'target' | 'feedback'> | null): string | null {
  if (!state?.target) return null;
  return state.feedback?.kind === 'right' || state.feedback?.kind === 'shown' ? state.target : null;
}

/** Picks the next target among `pool`, never one already asked this round. `random` returns [0, 1). */
export function pickQuizTarget(pool: readonly string[], asked: readonly string[], random: () => number): string | null {
  const left = pool.filter((id) => !asked.includes(id));
  if (left.length === 0) return null;
  const index = Math.min(left.length - 1, Math.floor(random() * left.length));
  return left[index]!;
}

export function startQuiz(pool: readonly string[], random: () => number): QuizState {
  // Snapshot the eligible structures for the full round. Visibility changes belong to the next round.
  const roundPool = [...new Set(pool)];
  const target = pickQuizTarget(roundPool, [], random);
  return { pool: roundPool, target, asked: target ? [target] : [], answered: 0, right: 0, feedback: null, scored: false };
}

/** The student picked `picked` (in 3D or the list). Only the first pick of a question counts towards the score. */
export function answerQuiz(state: QuizState, picked: string): QuizState {
  if (!state.target || state.feedback?.kind === 'shown' || state.feedback?.kind === 'right') return state;
  const isRight = picked === state.target;
  const counts = !state.scored;
  return {
    ...state,
    answered: state.answered + (counts ? 1 : 0),
    right: state.right + (counts && isRight ? 1 : 0),
    scored: true,
    feedback: { kind: isRight ? 'right' : 'wrong', picked },
  };
}

/** "show me": reveals the target; an unanswered question counts as answered, not right. */
export function revealQuiz(state: QuizState): QuizState {
  if (!state.target) return state;
  return { ...state, answered: state.answered + (state.scored ? 0 : 1), scored: true, feedback: { kind: 'shown' } };
}

/** "next": pick from the round's original pool, even if visible structures changed since it started. */
export function nextQuiz(state: QuizState, random: () => number): QuizState {
  const target = pickQuizTarget(state.pool, state.asked, random);
  return {
    ...state,
    // Skipping a question with "next" before answering it counts it as answered, not right.
    answered: state.answered + (state.target && !state.scored ? 1 : 0),
    target,
    asked: target ? [...state.asked, target] : state.asked,
    feedback: null,
    scored: false,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Labels with leader lines: overlap avoidance
// ---------------------------------------------------------------------------------------------------------------------

export interface LabelAnchor {
  id: string;
  /** Where the leader line starts: a visible point of the structure (or its center), in pixels from the view's top left. */
  x: number;
  y: number;
  /** The label's box size in pixels. */
  width: number;
  height: number;
  /** True when no part of the structure can be seen from the camera (another structure is in front of it). */
  behind?: boolean;
}

export interface PlacedLabel {
  id: string;
  anchorX: number;
  anchorY: number;
  /** The label box's top left. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the leader line meets the label box (the middle of its near side). */
  lineX: number;
  lineY: number;
  /** The structure is hidden behind others from this side: the label is drawn marked "(behind)". */
  behind: boolean;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Space kept clear at the view's edges. */
  margin?: number;
  /** Horizontal distance from the anchor to the label box. */
  offset?: number;
  /** Space kept between two labels. */
  gap?: number;
  /**
   * The model's left and right edges on screen: labels go outside them (in a column on each side) so they cover as
   * little of the model as possible, as far as the view's edges allow.
   */
  columns?: { left: number; right: number };
}

export interface LabelLayout {
  placed: PlacedLabel[];
  /** The labels that found no room, so the student can be told which names are missing (in the order asked). */
  leftOut: string[];
}

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

/**
 * Places labels in two columns, one each side of the model (or of the view's middle). Each label goes to the side of
 * its anchor; inside a column the labels keep their anchors' top-to-bottom order and are pushed apart just enough not
 * to overlap, so a column holds as many labels as its height allows. When a column is too full, the label whose
 * anchor is nearest the middle moves to the other column if that has room; only when both are full is a label left
 * out (the lowest one), and `leftOut` names it. Labels are never drawn on top of each other, and the result doesn't
 * depend on the input order.
 */
export function placeLabels(anchors: readonly LabelAnchor[], options: LayoutOptions): LabelLayout {
  const { width, height, margin = 8, offset = 28, gap = 4, columns } = options;
  const top = margin;
  const bottom = height - margin;
  const room = bottom - top;
  const mid = columns ? (columns.left + columns.right) / 2 : width / 2;
  const byOrder = (a: LabelAnchor, b: LabelAnchor) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const usable = anchors
    .filter((a) => Number.isFinite(a.x) && Number.isFinite(a.y))
    .filter((a) => a.width + 2 * margin <= width && a.height + 2 * margin <= height)
    .sort(byOrder);
  const side = { left: usable.filter((a) => a.x < mid), right: usable.filter((a) => a.x >= mid) };
  const need = (list: LabelAnchor[]) => list.reduce((sum, a) => sum + a.height, 0) + gap * Math.max(0, list.length - 1);
  for (const [here, there] of [['left', 'right'], ['right', 'left']] as const) {
    while (need(side[here]) > room) {
      // Move the label nearest the middle across, if it fits there; otherwise leave out the lowest one.
      const nearest = [...side[here]].sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid) || byOrder(a, b))[0]!;
      if (need([...side[there], nearest]) <= room) {
        side[here] = side[here].filter((a) => a !== nearest);
        side[there] = [...side[there], nearest].sort(byOrder);
      } else {
        side[here].pop();
      }
    }
  }
  const clampX = (x: number, w: number) => Math.max(margin, Math.min(width - margin - w, x));
  const placed: PlacedLabel[] = [];
  for (const where of ['left', 'right'] as const) {
    const list = side[where];
    // Top to bottom: each label at its anchor's height, or just below the one above.
    const ys: number[] = [];
    list.forEach((a, i) => {
      const want = a.y - a.height / 2;
      ys.push(Math.max(top, want, i > 0 ? ys[i - 1]! + list[i - 1]!.height + gap : top));
    });
    // Bottom to top: pull labels back up where the column ran past the bottom.
    for (let i = list.length - 1; i >= 0; i--) {
      const limit = i === list.length - 1 ? bottom - list[i]!.height : ys[i + 1]! - gap - list[i]!.height;
      ys[i] = Math.min(ys[i]!, limit);
    }
    list.forEach((a, i) => {
      const x =
        where === 'right'
          ? clampX(Math.max(a.x, columns?.right ?? a.x) + offset, a.width)
          : clampX(Math.min(a.x, columns?.left ?? a.x) - offset - a.width, a.width);
      const y = ys[i]!;
      const onRight = x + a.width / 2 >= a.x;
      placed.push({
        id: a.id,
        anchorX: a.x,
        anchorY: a.y,
        x,
        y,
        width: a.width,
        height: a.height,
        lineX: onRight ? x : x + a.width,
        lineY: y + a.height / 2,
        behind: a.behind === true,
      });
    });
  }
  // A label pushed against the view's edge can reach into the other column: leave out the lower of any such pair.
  placed.sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1));
  const kept: PlacedLabel[] = [];
  for (const label of placed) {
    if (!kept.some((other) => overlaps(label, other, gap))) kept.push(label);
  }
  const keptIds = new Set(kept.map((label) => label.id));
  const leftOut = anchors.map((a) => a.id).filter((id, i, all) => !keptIds.has(id) && all.indexOf(id) === i);
  return { placed: kept, leftOut };
}

/** The placed labels only (see `placeLabels`). */
export function layoutLabels(anchors: readonly LabelAnchor[], options: LayoutOptions): PlacedLabel[] {
  return placeLabels(anchors, options).placed;
}

/**
 * The line under the view (and after "saved …") naming labels that found no room, so a missing name is never silent:
 * "no room to label: lower lobe of right lung." Empty when every label fits.
 */
export function leftOutNote(names: readonly string[]): string {
  return names.length === 0 ? '' : `no room to label: ${names.join('; ')}.`;
}

/** What a label marked "(behind)" says, on screen and on pictures. */
export const BEHIND_MARK = '(behind)';

/**
 * A label's lines: the official name wrapped to `maxWidth`, then "(behind)" when the structure is hidden behind others,
 * on the last line if it fits there or on a line of its own. `width` is the widest line.
 */
export function labelLines(
  name: string,
  behind: boolean,
  maxWidth: number,
  measure: (s: string) => number,
): { lines: string[]; mark: 'none' | 'inline' | 'line'; width: number } {
  const lines = wrapText(name, maxWidth, measure);
  let mark: 'none' | 'inline' | 'line' = 'none';
  let width = Math.max(0, ...lines.map(measure));
  if (behind) {
    const last = lines[lines.length - 1] ?? '';
    const inline = measure(`${last} ${BEHIND_MARK}`);
    if (inline <= Math.max(maxWidth, width)) {
      mark = 'inline';
      width = Math.max(width, inline);
    } else {
      mark = 'line';
      width = Math.max(width, measure(BEHIND_MARK));
    }
  }
  return { lines, mark, width };
}

// ---------------------------------------------------------------------------------------------------------------------
// Which labeled structures the camera can see (an ID picture: every structure drawn flat in its own color)
// ---------------------------------------------------------------------------------------------------------------------

/** The color a structure is drawn in for the ID picture: its index + 1 in red, green and blue bytes (0 = nothing). */
export function encodeId(index: number): [number, number, number] {
  const n = index + 1;
  return [n & 255, (n >> 8) & 255, (n >> 16) & 255];
}

export interface VisibilityTarget {
  /** The structure's index, as given to encodeId. */
  index: number;
  /** Its center, projected into the ID picture (pixels from the top left). */
  x: number;
  y: number;
}

export interface VisibleAnchor {
  /** False when fewer than `minPixels` of the structure's pixels can be seen: it is behind other structures. */
  visible: boolean;
  /** Where its label's line should start: the center when that is visible, else a visible point of it near its middle. */
  x: number;
  y: number;
}

/**
 * Reads an ID picture (RGBA bytes, as WebGL's readPixels gives them: rows from the bottom up) and finds, for each
 * labeled structure, whether any of it can be seen and a good visible point for its label's leader line.
 */
export function findVisibleAnchors(
  pixels: Uint8Array,
  width: number,
  height: number,
  targets: ReadonlyMap<string, VisibilityTarget>,
  minPixels = 3,
): Map<string, VisibleAnchor> {
  const at = (x: number, y: number) => {
    const i = ((height - 1 - y) * width + x) * 4;
    return pixels[i]! | (pixels[i + 1]! << 8) | (pixels[i + 2]! << 16);
  };
  const out = new Map<string, VisibleAnchor>();
  const pending = new Map<number, {
    id: string;
    count: number;
    sx: number;
    sy: number;
    t: VisibilityTarget;
    centerVisible: boolean;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>();
  for (const [id, t] of targets) {
    const cx = Math.round(t.x);
    const cy = Math.round(t.y);
    const centerVisible = cx >= 0 && cy >= 0 && cx < width && cy < height && at(cx, cy) === t.index + 1;
    // Count pixels even when the projected center is visible. The minimum
    // visible area must be the same for center hits and off-center structures.
    pending.set(t.index + 1, {
      id, count: 0, sx: 0, sy: 0, t, centerVisible,
      minX: width, maxX: -1, minY: height, maxY: -1,
    });
  }
  if (pending.size === 0) return out;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = pending.get(at(x, y));
      if (p) {
        p.count++;
        p.sx += x;
        p.sy += y;
        // Center-visible labels never need the nearest-pixel fallback.
        if (!p.centerVisible) {
          if (x < p.minX) p.minX = x;
          if (x > p.maxX) p.maxX = x;
          if (y < p.minY) p.minY = y;
          if (y > p.maxY) p.maxY = y;
        }
      }
    }
  }
  for (const [code, p] of pending) {
    if (p.count === 0 || p.count < minPixels) {
      out.set(p.id, { visible: false, x: p.t.x, y: p.t.y });
      continue;
    }
    // Preserve the exact projected center when enough pixels are visible.
    if (p.centerVisible) {
      out.set(p.id, { visible: true, x: p.t.x, y: p.t.y });
      continue;
    }
    const mx = Math.round(p.sx / p.count);
    const my = Math.round(p.sy / p.count);
    if (at(mx, my) === code) {
      out.set(p.id, { visible: true, x: mx, y: my });
      continue;
    }
    // For a curved or disconnected structure, the centroid can land in
    // empty space. Search only its occupied bounding rectangle, not the
    // entire ID picture again for every such structure. The scan order and
    // nearest-pixel tie-break remain unchanged.
    let best = { x: mx, y: my, d: Infinity };
    for (let y = p.minY; y <= p.maxY; y++) {
      for (let x = p.minX; x <= p.maxX; x++) {
        if (at(x, y) !== code) continue;
        const d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < best.d) best = { x, y, d };
      }
    }
    out.set(p.id, { visible: true, x: best.x, y: best.y });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Exported pictures
// ---------------------------------------------------------------------------------------------------------------------

export type ExportSize = 'phone' | 'wide' | 'square';

export const EXPORT_SIZES: Readonly<Record<ExportSize, { width: number; height: number; label: string }>> = {
  phone: { width: 1080, height: 1920, label: 'phone 1080×1920' },
  wide: { width: 1920, height: 1080, label: 'wide 1920×1080' },
  square: { width: 1080, height: 1080, label: 'square 1080×1080' },
};

/** "Right Kidney (organ)" → "right-kidney-organ". At most 60 characters, never empty unless the name has no letters. */
export function slugify(value: string): string {
  return normalizeSearch(value).replace(/ /g, '-').slice(0, 60).replace(/-+$/, '');
}

/** cueory-<system>[-<structure-name-slug>]-<phone|wide|square>.png */
export function exportFileName(systemKey: string, structureName: string | null, size: ExportSize): string {
  const system = slugify(systemKey) || 'anatomy';
  const structure = structureName ? slugify(structureName) : '';
  return `cueory-${system}${structure ? `-${structure}` : ''}-${size}.png`;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Room kept free for labels at each side of an exported picture, as a share of the picture's width. */
export interface LabelRoom {
  left: number;
  right: number;
}

/** Space around the model in an exported picture, as a share of the picture's width and height. */
export const EXPORT_PAD = { x: 0.04, y: 0.05 };
/** At most this share of a picture's width goes to the label columns together, so the model always keeps some. */
const MOST_LABEL_ROOM = 0.66;

/**
 * The part of the student's view an exported picture shows, in screen pixels: the visible model (clipped to what is on
 * screen), scaled to fill the picture's free space, which is the picture minus a little padding and minus the label
 * columns on the sides that have labels. The camera's position and angle stay the student's; only the crop changes
 * (three.js's setViewOffset), so a tall system fills a phone picture from top to bottom instead of sitting small in
 * the middle. With nothing on screen, the whole view is used.
 */
export function exportRegion(
  extent: Rect | null,
  view: { width: number; height: number },
  exportAspect: number,
  room: LabelRoom = { left: 0, right: 0 },
): Rect {
  let r: Rect = { x: 0, y: 0, width: view.width, height: view.height };
  if (extent) {
    const x0 = Math.max(0, extent.x);
    const y0 = Math.max(0, extent.y);
    const x1 = Math.min(view.width, extent.x + extent.width);
    const y1 = Math.min(view.height, extent.y + extent.height);
    if (x1 > x0 && y1 > y0) r = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  let left = Math.max(0, room.left);
  let right = Math.max(0, room.right);
  if (left + right > MOST_LABEL_ROOM) {
    const k = MOST_LABEL_ROOM / (left + right);
    left *= k;
    right *= k;
  }
  /** The share of the picture's width the model may use. */
  const share = 1 - left - right - 2 * EXPORT_PAD.x;
  const width = Math.max(r.width / share, (r.height / (1 - 2 * EXPORT_PAD.y)) * exportAspect, 1e-6);
  const height = width / exportAspect;
  // The model sits in the middle of its share, between the label columns.
  const x = r.x - (left + EXPORT_PAD.x) * width - (share * width - r.width) / 2;
  const y = r.y + r.height / 2 - height / 2;
  return { x, y, width, height };
}

/**
 * How much of an exported picture's width each label column needs: its widest label plus `extra` (the leader line's
 * offset and the margin), as a share of `pictureWidth`; 0 for a side with no label. A label goes to the side of the
 * model's middle (`mid`) that its anchor is on, as in `placeLabels`.
 */
export function labelRoomFor(
  anchors: ReadonlyArray<{ x: number; width: number }>,
  mid: number,
  pictureWidth: number,
  extra: number,
): LabelRoom {
  const widest = (list: ReadonlyArray<{ width: number }>) => list.reduce((most, a) => Math.max(most, a.width), 0);
  const share = (w: number) => (w > 0 ? (w + extra) / pictureWidth : 0);
  return { left: share(widest(anchors.filter((a) => a.x < mid))), right: share(widest(anchors.filter((a) => a.x >= mid))) };
}

/** Splits text into lines no wider than `maxWidth`, by words. `measure` gives a string's width. */
export function wrapText(value: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measure(candidate) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The title band of a saved picture, measured with the same font used by the canvas renderer. */
export interface PictureTitleLayout {
  lines: string[];
  lineHeight: number;
  /** The y-coordinate where the 3D picture may begin, after the title and its padding. */
  top: number;
  /** Also passed to canvas fillText so even an unusually long unbroken word stays inside the picture. */
  maxWidth: number;
}

/**
 * A long system title must not run off the right edge of a saved phone, square or wide picture.
 * Every wrapped line gets vertical space above the 3D view. The canvas renderer constrains single
 * words longer than the available width with fillText's maxWidth (without truncating the text).
 */
export function pictureTitleLayout(
  title: string,
  pictureWidth: number,
  padding: number,
  fontSize: number,
  leading: number,
  measure: (value: string) => number,
): PictureTitleLayout {
  const maxWidth = Math.max(1, pictureWidth - 2 * padding);
  const lines = wrapText(title, maxWidth, measure);
  const lineHeight = Math.max(1, Math.round(fontSize * leading));
  return {
    lines,
    lineHeight,
    top: padding + lines.length * lineHeight + Math.round(padding / 2),
    maxWidth,
  };
}

/** Room around the model in the lab's starting view: 1.08 leaves 4% at the tighter edges. */
export const FIT_MARGIN = 1.08;

/**
 * Camera distance, from the box's center, that fits a box of `size` (width, height, depth) seen from the front, with a
 * little room around it. Fitting the box rather than its bounding sphere lets tall, thin systems fill the view.
 */
export function fitDistance(size: { x: number; y: number; z: number }, fovDeg: number, aspect: number): number {
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * Math.max(aspect, 1e-3);
  const fit = Math.max(size.y / 2 / tanV, size.x / 2 / tanH, 1e-6);
  return fit * FIT_MARGIN + size.z / 2;
}

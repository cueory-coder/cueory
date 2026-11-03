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

// ---------------------------------------------------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------------------------------------------------

export interface AnatomyStructure {
  /** The mesh node's name in the .glb, e.g. "FMA7204". */
  id: string;
  /** The official name, exactly as the source file gives it. */
  text: string;
  group?: string;
}

/** What the island gets for one body system: only what it shows (sources stay at build time). */
export interface AnatomySystem {
  /** "heart", from the file name anatomy-heart.json. */
  key: string;
  title: string;
  status: 'draft' | 'approved';
  model: { file: string; release: string; via?: string };
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
/** A same-site address of a .glb: starts with one slash, plain path characters only, no `..`. */
const MODEL_FILE = /^\/(?!\/)[A-Za-z0-9/_-]+(?:\.[A-Za-z0-9_-]+)*\.glb$/;

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
  if (!text(file['title'], 120)) fail('"title" must be a short line of text');
  const status = file['status'];
  if (status !== 'draft' && status !== 'approved') fail('"status" must be "draft" or "approved"');
  const model = file['model'];
  if (!isRecord(model)) fail('"model" must be { file, release }');
  const m = model as Record<string, unknown>;
  if (typeof m['file'] !== 'string' || !MODEL_FILE.test(m['file']) || m['file'].includes('..')) {
    fail('"model.file" must be this site\'s address of a .glb, such as /models/anatomy/heart.glb');
  }
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
    const structure: AnatomyStructure = { id, text: label['text'] as string };
    if (typeof group === 'string') structure.group = group;
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
}

/** The live site's branch (wrangler.jsonc: production branch `main`). */
export const PRODUCTION_BRANCH = 'main';

/**
 * May this build show drafts? Workers Builds (WORKERS_CI=1) builds every branch: drafts only when it names a branch and
 * that branch isn't `main`. A Workers build that doesn't say which branch counts as the live site, so a missing
 * variable can never leak drafts. Builds outside Workers Builds (a laptop, GitHub CI) never deploy, so they show drafts.
 */
export function draftsAllowed(env: BuildEnv): boolean {
  if (env.WORKERS_CI !== '1') return true;
  const branch = env.WORKERS_CI_BRANCH?.trim();
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

// ---------------------------------------------------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------------------------------------------------

export function toggleHidden(hidden: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(hidden);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
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

/** Picks the next target among `pool`, never one already asked this round. `random` returns [0, 1). */
export function pickQuizTarget(pool: readonly string[], asked: readonly string[], random: () => number): string | null {
  const left = pool.filter((id) => !asked.includes(id));
  if (left.length === 0) return null;
  const index = Math.min(left.length - 1, Math.floor(random() * left.length));
  return left[index]!;
}

export function startQuiz(pool: readonly string[], random: () => number): QuizState {
  const target = pickQuizTarget(pool, [], random);
  return { target, asked: target ? [target] : [], answered: 0, right: 0, feedback: null, scored: false };
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

/** "next": a new target from the pool, never repeating this round; null target when the round is done. */
export function nextQuiz(state: QuizState, pool: readonly string[], random: () => number): QuizState {
  const target = pickQuizTarget(pool, state.asked, random);
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
  /** The structure's projected center, in pixels from the view's top left. */
  x: number;
  y: number;
  /** The label's box size in pixels. */
  width: number;
  height: number;
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

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a, gap: number): boolean {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

/**
 * Places each label beside its anchor (or outside the model's columns), on the side away from the view's middle, then slides it up or down (or to the
 * other side) until it overlaps no label placed before it. Labels that can't fit anywhere are left out, never drawn on
 * top of each other. Anchors are placed top to bottom, so the result doesn't depend on the input order.
 */
export function layoutLabels(anchors: readonly LabelAnchor[], options: LayoutOptions): PlacedLabel[] {
  const { width, height, margin = 8, offset = 28, gap = 4, columns } = options;
  const placed: PlacedLabel[] = [];
  const sorted = [...anchors]
    .filter((a) => Number.isFinite(a.x) && Number.isFinite(a.y))
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1));
  for (const anchor of sorted) {
    if (anchor.width + 2 * margin > width || anchor.height + 2 * margin > height) continue;
    const preferRight = anchor.x >= width / 2;
    const sides = preferRight ? (['right', 'left'] as const) : (['left', 'right'] as const);
    const clampX = (x: number) => Math.max(margin, Math.min(width - margin - anchor.width, x));
    const clampY = (y: number) => Math.max(margin, Math.min(height - margin - anchor.height, y));
    const step = anchor.height + gap;
    const tries: number[] = [0];
    for (let k = 1; k * step <= height; k++) tries.push(k * step, -k * step);
    let done = false;
    for (const delta of tries) {
      for (const side of sides) {
        const right = Math.max(anchor.x, columns?.right ?? anchor.x) + offset;
        const left = Math.min(anchor.x, columns?.left ?? anchor.x) - offset - anchor.width;
        const x = clampX(side === 'right' ? right : left);
        const wantY = anchor.y - anchor.height / 2 + delta;
        const y = clampY(wantY);
        if (Math.abs(y - wantY) > 0.5 && delta !== 0) continue; // ran off the edge: try the next distance
        const box = { x, y, width: anchor.width, height: anchor.height };
        if (placed.some((other) => overlaps(box, other, gap))) continue;
        const onRight = x + anchor.width / 2 >= anchor.x;
        placed.push({
          id: anchor.id,
          anchorX: anchor.x,
          anchorY: anchor.y,
          ...box,
          lineX: onRight ? x : x + anchor.width,
          lineY: y + anchor.height / 2,
        });
        done = true;
        break;
      }
      if (done) break;
    }
  }
  return placed;
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

/**
 * The part of the student's view an exported picture shows, in screen pixels: the visible model (clipped to what is on
 * screen), with room around it (more at the sides when labels are drawn), stretched to the picture's shape. The camera's
 * position and angle stay the student's; only the crop changes (three.js's setViewOffset), so the model fills the
 * picture instead of sitting small in the middle of a tall frame. With nothing on screen, the whole view is used.
 */
export function exportRegion(
  extent: Rect | null,
  view: { width: number; height: number },
  exportAspect: number,
  labels: boolean,
): Rect {
  const screen = { x: 0, y: 0, width: view.width, height: view.height };
  let r = screen;
  if (extent) {
    const x0 = Math.max(0, extent.x);
    const y0 = Math.max(0, extent.y);
    const x1 = Math.min(view.width, extent.x + extent.width);
    const y1 = Math.min(view.height, extent.y + extent.height);
    if (x1 > x0 && y1 > y0) r = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  const floor = Math.max(r.width, r.height, 1) * 0.04;
  const padX = Math.max(floor, r.width * (labels ? 0.35 : 0.1));
  const padY = Math.max(floor, r.height * 0.08);
  let width = r.width + 2 * padX;
  let height = r.height + 2 * padY;
  if (width / height < exportAspect) width = height * exportAspect;
  else height = width / exportAspect;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
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

/**
 * Camera distance, from the box's center, that fits a box of `size` (width, height, depth) seen from the front, with a
 * little room around it. Fitting the box rather than its bounding sphere lets tall, thin systems fill the view.
 */
export function fitDistance(size: { x: number; y: number; z: number }, fovDeg: number, aspect: number): number {
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * Math.max(aspect, 1e-3);
  const fit = Math.max(size.y / 2 / tanV, size.x / 2 / tanH, 1e-6);
  return fit * 1.12 + size.z / 2;
}

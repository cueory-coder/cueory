/**
 * Pure logic for "label it", image occlusion (ROADMAP Task 4c), kept separate so it can be unit tested.
 *
 * The labels on a diagram are covered. The student uncovers them one at a time (or all at once) and marks each
 * uncovered label "know it" or "still learning". When every label in the round is marked, the next round covers
 * again only the "still learning" ones, like cards.ts. Labels are referred to by their id.
 */

export interface LabelImage {
  src: string;
  alt: string;
  /** The image's own size in pixels, so the page can keep its aspect ratio. */
  width: number;
  height: number;
  /** Who made the image and under what licence. No credit means no image (Task 4c). */
  credit: string;
}

/** One covered label. Its box is in percentages of the image: x and y are the top-left corner. */
export interface Label {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelSet {
  id: string;
  image: LabelImage;
  labels: Label[];
}

export type Mark = 'know' | 'learning';

export interface LabelItState {
  /** Ids of the labels covered at the start of this round, in reading order. */
  round: string[];
  /** Ids uncovered so far this round. */
  revealed: string[];
  /** How each uncovered label was marked this round. Only uncovered labels have a mark. */
  marks: Record<string, Mark>;
  /** Ids marked "know it" in earlier rounds. They stay uncovered and are not asked again. */
  known: string[];
  /** 1 for the first round, then 2, 3, … */
  roundNumber: number;
}

/* ---------- Parsing ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isPercent = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const isSize = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Rounding slack for boxes measured to a few decimals, so 33.33 + 66.67 still fits. */
const EDGE = 1e-9;

/**
 * Checks a label set and returns it, or throws one plain-English error naming the first problem found.
 * Every box must sit inside the image, ids must be unique, and every label needs text. The image needs a credit.
 */
export function parseSet(data: unknown): LabelSet {
  if (!isRecord(data)) throw new Error('A label set must be an object with an id, an image and labels.');
  if (!isText(data.id)) throw new Error('The label set needs an id.');
  const where = `Label set "${data.id}"`;

  const image = data.image;
  if (!isRecord(image)) throw new Error(`${where} needs an image.`);
  if (!isText(image.src)) throw new Error(`${where}: the image needs a src.`);
  if (!isText(image.alt)) throw new Error(`${where}: the image needs alt text.`);
  if (!isSize(image.width) || !isSize(image.height)) {
    throw new Error(`${where}: the image needs a width and height in pixels, both above 0.`);
  }
  if (!isText(image.credit)) throw new Error(`${where}: the image needs a credit line. No credit means no image.`);

  if (!Array.isArray(data.labels) || data.labels.length === 0) throw new Error(`${where} needs at least one label.`);

  const seen = new Set<string>();
  const labels = data.labels.map((raw: unknown, i): Label => {
    const at = `${where}, label ${i + 1}`;
    if (!isRecord(raw)) throw new Error(`${at} must be an object.`);
    if (!isText(raw.id)) throw new Error(`${at} needs an id.`);
    if (seen.has(raw.id)) throw new Error(`${where}: the label id "${raw.id}" is used more than once.`);
    seen.add(raw.id);
    if (!isText(raw.text)) throw new Error(`${at} ("${raw.id}") needs text.`);
    for (const key of ['x', 'y', 'w', 'h'] as const) {
      if (!isPercent(raw[key])) throw new Error(`${at} ("${raw.id}"): ${key} must be a percentage from 0 to 100.`);
    }
    const { x, y, w, h } = raw as Record<'x' | 'y' | 'w' | 'h', number>;
    if (w === 0 || h === 0) throw new Error(`${at} ("${raw.id}"): the box needs a width and height above 0.`);
    if (x + w > 100 + EDGE || y + h > 100 + EDGE) {
      throw new Error(`${at} ("${raw.id}"): the box runs past the edge of the image.`);
    }
    return { id: raw.id, text: raw.text, x, y, w, h };
  });

  return {
    id: data.id,
    image: { src: image.src, alt: image.alt, width: image.width, height: image.height, credit: image.credit },
    labels,
  };
}

/* ---------- Reading order and words ---------- */

/** Labels top to bottom, then left to right, by the top-left corner of their boxes. Ties keep the file's order. */
export function readingOrder(labels: readonly Label[]): Label[] {
  return labels
    .map((label, i) => ({ label, i }))
    .sort((a, b) => a.label.y - b.label.y || a.label.x - b.label.x || a.i - b.i)
    .map(({ label }) => label);
}

/**
 * What a cover says to screen readers and in the list. A covered label gives only its number, never its text.
 * `number` is the label's place in reading order, starting at 1.
 */
export function coverWords(number: number, label: Pick<Label, 'text'>, uncovered: boolean): string {
  return uncovered ? `label ${number}: ${label.text}` : `label ${number}, covered`;
}

/* ---------- Study ---------- */

/** A first round with every label covered, in reading order. */
export function start(set: LabelSet): LabelItState {
  return { round: readingOrder(set.labels).map((l) => l.id), revealed: [], marks: {}, known: [], roundNumber: 1 };
}

export function isCovered(state: LabelItState, id: string): boolean {
  return state.round.includes(id) && !state.revealed.includes(id);
}

/** Uncover one label. Ignores labels that aren't covered. */
export function reveal(state: LabelItState, id: string): LabelItState {
  if (!isCovered(state, id)) return state;
  return { ...state, revealed: [...state.revealed, id] };
}

/** Uncover every label in this round. */
export function revealAll(state: LabelItState): LabelItState {
  return { ...state, revealed: [...state.revealed, ...state.round.filter((id) => !state.revealed.includes(id))] };
}

/** Cover every label in this round again. Their marks go too, because only an uncovered label can have a mark. */
export function coverAll(state: LabelItState): LabelItState {
  return { ...state, revealed: [], marks: {} };
}

/** Mark an uncovered label in this round. A covered label can't be marked; marking again changes the mark. */
export function mark(state: LabelItState, id: string, value: Mark): LabelItState {
  if (!state.round.includes(id) || !state.revealed.includes(id)) return state;
  return { ...state, marks: { ...state.marks, [id]: value } };
}

/** True once every label in the round has a mark. */
export function isRoundOver(state: LabelItState): boolean {
  return state.round.every((id) => state.marks[id] !== undefined);
}

/** True when the round is over and nothing is left to learn. */
export function isDone(state: LabelItState): boolean {
  return isRoundOver(state) && state.round.every((id) => state.marks[id] === 'know');
}

/** The next round: only the "still learning" labels, covered again, in reading order. */
export function nextRound(state: LabelItState): LabelItState {
  const learning = state.round.filter((id) => state.marks[id] === 'learning');
  const knownNow = state.round.filter((id) => state.marks[id] === 'know');
  return {
    round: learning,
    revealed: [],
    marks: {},
    known: [...state.known, ...knownNow],
    roundNumber: state.roundNumber + 1,
  };
}

export interface Summary {
  /** Labels in this round marked "know it". */
  know: number;
  /** Labels in this round marked "still learning". */
  learning: number;
  /** Labels in this round not marked yet, covered or not. */
  unmarked: number;
  /** Labels in this round still covered. */
  covered: number;
  /** Labels in this round. */
  total: number;
  /** Labels known from earlier rounds. */
  knownBefore: number;
}

export function summary(state: LabelItState): Summary {
  const marks = state.round.map((id) => state.marks[id]);
  const know = marks.filter((m) => m === 'know').length;
  const learning = marks.filter((m) => m === 'learning').length;
  return {
    know,
    learning,
    unmarked: state.round.length - know - learning,
    covered: state.round.length - state.revealed.length,
    total: state.round.length,
    knownBefore: state.known.length,
  };
}

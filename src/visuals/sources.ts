/**
 * The visuals kit's source files (Task 6, D-56, docs/VISUALS.md). A visual shows only what a cited open source states:
 * every label and every depiction points to a source, which gives the book's exact words, the section and the page
 * address. The build (src/content.config.ts) runs `visualProblems` on every file in content/visuals, and the unit tests
 * also check each file's lesson ids against the lesson map.
 *
 * Plain functions with no Astro or browser imports, so they can be unit tested.
 */

/** A book the kit may quote. Any other book is refused, including OpenStax while it is on hold (D-57). */
export interface AllowedBook {
  /** How a source file names the book. */
  book: string;
  /** Every page address must start with this. */
  urlPrefix: string;
  license: string;
  licenseUrl: string;
  /** Shown with every visual that quotes the book, linked to `licenseUrl`. */
  credit: string;
}

export const allowedBooks: readonly AllowedBook[] = [
  {
    // WisTech Open's page for the book (checked 1 Nov 2026): "Nursing Fundamentals, 2nd Edition", edited by Dr.
    // Elizabeth Christman and Kim Ernstmeyer, CC BY 4.0, read online at wtcs.pressbooks.pub. Its terms: "You must give
    // appropriate credit to WisTech Open, provide a link to the license, and indicate if changes were made." The credit
    // below does all three ("adapted" says we changed it). Only the book's text is quoted: its figures carry their own
    // licenses, so they are never copied.
    book: 'Open RN Nursing Fundamentals 2e',
    urlPrefix: 'https://wtcs.pressbooks.pub/nursingfundamentals/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    credit:
      'Words adapted from Nursing Fundamentals, 2nd Edition, edited by Kim Ernstmeyer and Elizabeth Christman (WisTech Open), CC BY 4.0.',
  },
];

export type VisualKind = 'diagram' | 'model' | 'overlay';
export type VisualStatus = 'draft' | 'approved';

export interface VisualSource {
  id: string;
  /** The book's exact words, copied from the page, never paraphrased. */
  quote: string;
  book: string;
  section: string;
  url: string;
  license: string;
  /** The day the words were copied from the page, as YYYY-MM-DD. */
  retrieved: string;
}

/** A word or phrase shown on the drawing. */
export interface VisualLabel {
  id: string;
  text: string;
  source: string;
}

/** Something the drawing shows without words: a shape, an arrow, a direction of movement, a number. */
export interface VisualDepiction {
  id: string;
  what: string;
  source: string;
}

export interface Visual {
  id: string;
  title: string;
  kind: VisualKind;
  lessonIds: readonly string[];
  status: VisualStatus;
  labels: readonly VisualLabel[];
  depictions: readonly VisualDepiction[];
  sources: readonly VisualSource[];
}

/** The words every disease overlay shows on screen (D-56). */
export const OVERLAY_NOTE = 'simplified for learning';

/** One thing wrong with a visual's source file: the part of the file it is in, and what to fix, in plain words. */
export interface VisualProblem {
  field: 'labels' | 'depictions' | 'sources';
  message: string;
}

/** Everything wrong with a visual's source file. Empty when the file passes. */
export function visualProblems(
  visual: Omit<Visual, 'id'>,
  books: readonly AllowedBook[] = allowedBooks,
): VisualProblem[] {
  const problems: VisualProblem[] = [];
  const problem = (field: VisualProblem['field'], message: string) => problems.push({ field, message });

  const findDuplicates = (field: VisualProblem['field'], ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problem(field, `two ${field} have the id "${id}"`);
      seen.add(id);
    }
  };
  findDuplicates('labels', visual.labels.map((label) => label.id));
  findDuplicates('depictions', visual.depictions.map((depiction) => depiction.id));
  findDuplicates('sources', visual.sources.map((source) => source.id));

  if (visual.labels.length + visual.depictions.length === 0) {
    problem('labels', 'a visual needs at least one label or depiction');
  }

  const sourceIds = new Set(visual.sources.map((source) => source.id));
  const used = new Set<string>();
  const items = [
    ...visual.labels.map((label) => ({ field: 'labels' as const, kind: 'label', id: label.id, source: label.source })),
    ...visual.depictions.map((depiction) => ({
      field: 'depictions' as const,
      kind: 'depiction',
      id: depiction.id,
      source: depiction.source,
    })),
  ];
  for (const item of items) {
    used.add(item.source);
    if (!sourceIds.has(item.source)) {
      problem(item.field, `${item.kind} "${item.id}" points to source "${item.source}", which isn't in the file`);
    }
  }

  for (const source of visual.sources) {
    if (!used.has(source.id)) problem('sources', `source "${source.id}" isn't used by any label or depiction`);
    const book = books.find((allowed) => allowed.book === source.book);
    if (!book) {
      problem('sources', `source "${source.id}" quotes "${source.book}", which isn't an allowed book (src/visuals/sources.ts)`);
      continue;
    }
    if (!source.url.startsWith(book.urlPrefix) || source.url.length === book.urlPrefix.length) {
      problem('sources', `source "${source.id}" must link to the page it quotes, under ${book.urlPrefix}`);
    }
    if (source.license !== book.license) {
      problem('sources', `source "${source.id}" says "${source.license}", but ${book.book} is ${book.license}`);
    }
  }

  return problems;
}

/** The lesson ids a visual names that aren't in the lesson map (docs/curriculum/medsurg-lesson-map.csv). */
export function unknownLessons(visual: Pick<Visual, 'lessonIds'>, known: ReadonlySet<string>): string[] {
  return visual.lessonIds.filter((lessonId) => !known.has(lessonId));
}

/** The text of a label the drawing uses. A label that isn't in the visual's source file stops the build. */
export function labelText(visual: Pick<Visual, 'id' | 'labels'>, labelId: string): string {
  const label = visual.labels.find((candidate) => candidate.id === labelId);
  if (!label) {
    throw new Error(
      `The drawing of "${visual.id}" uses the label "${labelId}", which isn't in content/visuals/${visual.id}.json.`,
    );
  }
  return label.text;
}

/** Only approved visuals may appear on a page: a draft never reaches the live site (docs/VISUALS.md). */
export function approvedOnly<T extends Pick<Visual, 'status'>>(visuals: readonly T[]): T[] {
  return visuals.filter((visual) => visual.status === 'approved');
}

/** The credits a visual shows: one for each book it quotes, in the order of the allowed books. */
export function creditsFor(
  visual: Pick<Visual, 'sources'>,
  books: readonly AllowedBook[] = allowedBooks,
): AllowedBook[] {
  const quoted = new Set(visual.sources.map((source) => source.book));
  return books.filter((book) => quoted.has(book.book));
}

/** Words a visual shows on screen besides its labels: a disease overlay says "simplified for learning". */
export function notesFor(visual: Pick<Visual, 'kind'>): string[] {
  return visual.kind === 'overlay' ? [OVERLAY_NOTE] : [];
}

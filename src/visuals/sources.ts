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
  /** The license's name as `credit` spells it, when that differs from `license`. */
  licenseTitle?: string;
  /** The only kinds of visual that may quote this book. Any kind when absent. */
  kinds?: readonly VisualKind[];
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
  {
    // BodyParts3D, Christian's 3D atlas (D-80). Its license page (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/
    // lic.html, last updated 2025/02/27) says CC BY 4.0 and asks for this credit, word for word. Only the 3D lab may
    // cite it: its words are the database's structure names (parts_list_e.txt) and its README, quoted per structure.
    book: 'BodyParts3D',
    urlPrefix: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    credit: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
    licenseTitle: 'CC Attribution 4.0 International',
    kinds: ['model'],
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

/** A word or phrase shown on the drawing. In a 3D model, a label names one structure: its id is the node's name. */
export interface VisualLabel {
  id: string;
  text: string;
  source: string;
  /** A 3D model's heading for the label: the concept the structure is part of, from the atlas's own hierarchy. */
  group?: string;
  /** A 3D model's layer for peeling the whole body (scripts/anatomy-systems.json "layers"), from the same hierarchy. */
  layer?: 'skin' | 'muscle' | 'nerves' | 'vessels' | 'organs' | 'skeleton';
}

/** A 3D model's file (kind "model" only). */
export interface VisualModel {
  /** The model's address on this site, under public/: /models/anatomy/<system>.glb. */
  file: string;
  /** The atlas release the geometry comes from. */
  release: string;
  /** How the files reached us, when not straight from the atlas's own site. */
  via?: string;
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
  /** The 3D model's file. Required for kind "model", refused for the other kinds. */
  model?: VisualModel;
}

/** The words every disease overlay shows on screen (D-56). */
export const OVERLAY_NOTE = 'simplified for learning';

/** One thing wrong with a visual's source file: the part of the file it is in, and what to fix, in plain words. */
export interface VisualProblem {
  field: 'labels' | 'depictions' | 'sources' | 'model';
  message: string;
}

/** Verify the actual parsed HTTPS origin and resource path of a cited page.
 * A string prefix alone can accept URL dot-segment traversal into older,
 * differently licensed archive releases. Fail closed on encoded paths.
 */
function isAllowedSourcePage(value: string, prefix: string): boolean {
  if (typeof value !== 'string') return false;
  // URL() erases dot segments, including percent-encoded ones. Reject them
  // before parsing so a path cannot leave and then re-enter the cited archive.
  const rawPath = value.split(/[?#]/, 1)[0] ?? '';
  if (rawPath.includes('%') || /[\\/]\.{1,2}(?:[\\/]|$)/.test(rawPath)) return false;
  try {
    const page = new URL(value);
    const allowed = new URL(prefix);
    return page.protocol === 'https:' &&
      page.origin === allowed.origin &&
      page.pathname.startsWith(allowed.pathname) &&
      page.pathname.length > allowed.pathname.length &&
      !page.pathname.includes('%') &&
      !page.username && !page.password;
  } catch {
    return false;
  }
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
    if (!isAllowedSourcePage(source.url, book.urlPrefix)) {
      problem('sources', `source "${source.id}" must link to the page it quotes, under ${book.urlPrefix}`);
    }
    if (source.license !== book.license) {
      problem('sources', `source "${source.id}" says "${source.license}", but ${book.book} is ${book.license}`);
    }
    if (book.kinds && !book.kinds.includes(visual.kind)) {
      const kinds = book.kinds.map((kind) => `"${kind}"`).join(' or ');
      problem('sources', `source "${source.id}" quotes ${book.book}, which only a visual of kind ${kinds} may quote, not a "${visual.kind}"`);
    }
  }

  if (visual.kind === 'model' && !visual.model) problem('model', 'a 3D model visual needs "model": the model file it labels');
  if (visual.kind !== 'model' && visual.model) problem('model', `only a 3D model visual has "model", not a ${visual.kind}`);
  if (visual.model && !/^\/models\/[a-z0-9-]+(\/[a-z0-9-]+)*\.glb$/.test(visual.model.file)) {
    problem('model', `the model file "${visual.model.file}" must be a .glb under /models/ (lowercase letters, digits and dashes)`);
  }

  return problems;
}

/**
 * A model visual's file must exist under public/. `exists` gets the path inside public/ (for example
 * models/anatomy/heart.glb), so this stays a plain function: the build passes a check of the real folder.
 */
export function modelFileProblems(visual: Pick<Visual, 'model'>, exists: (publicPath: string) => boolean): VisualProblem[] {
  if (!visual.model || exists(visual.model.file.replace(/^\//, ''))) return [];
  return [{ field: 'model', message: `the model file public${visual.model.file} doesn't exist` }];
}

/** The parts of a GLB file's JSON that the checks read. */
export interface GlbJson {
  asset?: { copyright?: string };
  extensionsRequired?: string[];
  nodes?: { name?: string; mesh?: number }[];
  meshes?: { primitives: { indices?: number; mode?: number }[] }[];
  accessors?: { count: number }[];
  buffers?: { byteLength: number; uri?: string }[];
}

/**
 * A GLB file's JSON chunk: the bytes after the 12-byte file header and the chunk's own 8-byte header. No 3D library
 * needed. Throws on a file that isn't GLB version 2.
 */
export function glbJson(bytes: Uint8Array): GlbJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('not a GLB version 2 file');
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error('the GLB file length does not match its header');
  }
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || length === 0 || length % 4 !== 0 || 20 + length > bytes.byteLength) {
    throw new Error('the GLB file has no complete JSON chunk');
  }
  // GLB 2.0: a JSON chunk, an optional BIN chunk, then possible extension chunks.
  // Check each chunk's framing without decoding meshes (Khronos glTF 2.0, section 4.4).
  const jsonEnd = 20 + length;
  let at = jsonEnd;
  let binLength: number | null = null;
  while (at < bytes.byteLength) {
    if (bytes.byteLength - at < 8) throw new Error('the GLB file has an incomplete chunk header');
    const chunkLength = view.getUint32(at, true);
    const chunkType = view.getUint32(at + 4, true);
    if (chunkLength % 4 !== 0 || chunkLength > bytes.byteLength - at - 8) {
      throw new Error('the GLB file has an invalid chunk length');
    }
    if (chunkType === 0x4e4f534a) throw new Error('the GLB file has an extra JSON chunk');
    if (chunkType === 0x004e4942) {
      if (at !== jsonEnd) throw new Error('the GLB BIN chunk must follow the JSON chunk');
      binLength = chunkLength;
    }
    // Unknown chunk types after the standard chunks are allowed for forward compatibility.
    at += 8 + chunkLength;
  }
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, jsonEnd))) as GlbJson;
  const buffer = json.buffers?.[0];
  if (buffer && buffer.uri === undefined) {
    if (binLength === null) throw new Error('the GLB file is missing its referenced BIN chunk');
    if (!Number.isSafeInteger(buffer.byteLength) || buffer.byteLength < 0 ||
      binLength < buffer.byteLength || binLength > buffer.byteLength + 3) {
      throw new Error('the GLB BIN chunk length does not match its referenced buffer');
    }
  }
  return json;
}

/** The names of a GLB file's nodes, in file order. */
export function glbNodeNames(bytes: Uint8Array): string[] {
  return (glbJson(bytes).nodes ?? []).map((node) => node.name ?? '');
}

/** A GLB file's triangle count, from its index accessors (every mesh in these models is indexed triangles). */
export function glbTriangles(bytes: Uint8Array): number {
  const json = glbJson(bytes);
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      // GLB mode 4 means triangles; glTF defaults to 4 when mode is absent.
      if (primitive.mode !== undefined && primitive.mode !== 4) {
        throw new Error('a mesh primitive is not triangles (mode 4)');
      }
      if (primitive.indices === undefined) throw new Error('a mesh without indices');
      const count = json.accessors?.[primitive.indices]?.count;
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 3 || count % 3 !== 0) {
        throw new Error('a mesh has an invalid triangle index count');
      }
      triangles += count / 3;
    }
  }
  return triangles;
}

/** What doesn't match between a model's node names and the visual's labels: each node needs exactly one label. */
export function modelLabelProblems(visual: Pick<Visual, 'labels'>, nodeNames: readonly string[]): string[] {
  const problems: string[] = [];
  const nodes = new Map<string, number>();
  for (const name of nodeNames) nodes.set(name, (nodes.get(name) ?? 0) + 1);
  const labels = new Map<string, number>();
  for (const label of visual.labels) labels.set(label.id, (labels.get(label.id) ?? 0) + 1);
  for (const [name, count] of nodes) {
    if (count > 1) problems.push(`${count} nodes are named "${name}"`);
    if (!labels.has(name)) problems.push(`node "${name}" has no label`);
    else if (labels.get(name)! > 1) problems.push(`node "${name}" has ${labels.get(name)} labels`);
  }
  for (const id of labels.keys()) if (!nodes.has(id)) problems.push(`label "${id}" names no node in the model`);
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

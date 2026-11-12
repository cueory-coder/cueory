/**
 * The anatomy lab's print-friendly worksheet: a picture of the current view with numbered leader lines instead of
 * names, and a numbered list with a blank line for each. Pure logic (tests/unit/anatomyworksheet.test.ts); the
 * picture itself is drawn by the scene's picture export, so the source credit is printed on it the same way.
 */
import {
  BODYPARTS3D_CREDIT,
  BODYPARTS3D_LICENSE_URL,
  BODYPARTS3D_REFERENCE_NOTE,
  BODYPARTS3D_REFERENCE_URL,
  MAX_LABELS,
  creditFor,
  releaseNoteFor,
  type AnatomySystem,
} from './anatomylab';

/** The most numbered structures on one worksheet: the same limit as labels on the 3D view. */
export const WORKSHEET_MAX = MAX_LABELS;

/** Why a worksheet can't be made from what is showing, or null when it can. */
export function worksheetBlockReason(visibleCount: number, max: number = WORKSHEET_MAX): string | null {
  if (visibleCount <= 0) return 'show at least one structure to make a worksheet.';
  if (visibleCount > max) {
    return `a worksheet numbers up to ${max} structures and ${visibleCount} are showing. hide some, peel a layer, or use "show only this", then try again.`;
  }
  return null;
}

/**
 * The structures in reading order: top to bottom, then left to right (rows within `rowTolerance` pixels count as one
 * row), so number 1 is near the top of the picture. Structures the camera can't project keep their given order, last.
 */
export function worksheetOrder(
  ids: readonly string[],
  points: ReadonlyArray<{ id: string; x: number; y: number }>,
  rowTolerance = 12,
): string[] {
  const at = new Map(points.map((p) => [p.id, p]));
  const unique = [...new Set(ids)];
  const placed = unique.filter((id) => at.has(id));
  const rest = unique.filter((id) => !at.has(id));
  const compareHorizontal = (a: string, b: string) => {
    const pa = at.get(a)!;
    const pb = at.get(b)!;
    return pa.x - pb.x || (a < b ? -1 : a > b ? 1 : 0);
  };

  // Form rows from a y-sorted list before applying the within-row x order. Comparing row proximity directly inside
  // Array.sort is not transitive (A can share a row with B and B with C while A does not share one with C), which
  // makes numbering depend on the input permutation.
  placed.sort((a, b) => {
    const pa = at.get(a)!;
    const pb = at.get(b)!;
    return pa.y - pb.y || compareHorizontal(a, b);
  });
  const rows: Array<{ top: number; ids: string[] }> = [];
  for (const id of placed) {
    const point = at.get(id)!;
    const row = rows.at(-1);
    if (!row || point.y - row.top > rowTolerance) rows.push({ top: point.y, ids: [id] });
    else row.ids.push(id);
  }

  return [...rows.flatMap((row) => row.ids.sort(compareHorizontal)), ...rest];
}

/** The labels the picture draws: each structure's number instead of its name. */
export function worksheetLabels(order: readonly string[]): Array<{ id: string; text: string }> {
  return order.map((id, index) => ({ id, text: String(index + 1) }));
}

export interface WorksheetRow {
  number: number;
  id: string;
  /** The official name, shown only when the student asks for the answers. */
  name: string;
}

/** The list under the picture: only the numbers the picture really shows, so no blank has nothing to point at. */
export function worksheetRows(
  order: readonly string[],
  leftOut: readonly string[],
  names: ReadonlyMap<string, string>,
): WorksheetRow[] {
  const missing = new Set(leftOut);
  return order.flatMap((id, index) => (missing.has(id) ? [] : [{ number: index + 1, id, name: names.get(id) ?? id }]));
}

/** The note when some numbers found no room in the picture, so a missing number is never silent. */
export function worksheetLeftOutNote(order: readonly string[], leftOut: readonly string[]): string {
  const missing = new Set(leftOut);
  const numbers = order.flatMap((id, index) => (missing.has(id) ? [String(index + 1)] : []));
  if (numbers.length === 0) return '';
  return `no room in the picture for number ${numbers.join(', ')}: turn or zoom the model to make room, then make the worksheet again.`;
}

/**
 * The credit lines printed under a worksheet. A printed page can't follow a link, so the license and the publisher's
 * README are written out in full; the picture itself carries the same credit (pictureCreditFor).
 */
export function worksheetCreditLines(system: Pick<AnatomySystem, 'status' | 'model' | 'fixture'>): string[] {
  if (system.fixture) return [creditFor(system), releaseNoteFor(system)];
  return [
    BODYPARTS3D_CREDIT,
    `license: ${BODYPARTS3D_LICENSE_URL}`,
    releaseNoteFor(system),
    `${BODYPARTS3D_REFERENCE_NOTE}: ${BODYPARTS3D_REFERENCE_URL}`,
  ];
}

/** The file name a saved worksheet picture gets: cueory-<system>-worksheet.png. */
export function worksheetFileName(systemKey: string): string {
  const key = systemKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'anatomy';
  return `cueory-${key}-worksheet.png`;
}

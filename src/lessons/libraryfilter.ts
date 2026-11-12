/** Pure URL and visibility rules for the course library. Never reads private content. */
export type LibraryCourse = 'study-skills' | 'med-surg-i';
export type LibraryFilter =
  | { kind: 'all' }
  | { kind: 'course'; course: LibraryCourse }
  | { kind: 'unit'; unitId: string };

const ALL: LibraryFilter = { kind: 'all' };

/** Invalid URL values show everything, rather than hiding the library. */
export function parseLibraryFilter(search: string, knownUnitIds: readonly string[]): LibraryFilter {
  const params = new URLSearchParams(search);
  const unitId = params.get('unit');
  if (unitId !== null) {
    return knownUnitIds.includes(unitId) ? { kind: 'unit', unitId } : ALL;
  }
  const course = params.get('course');
  if (course === 'study-skills' || course === 'med-surg-i') return { kind: 'course', course };
  return ALL;
}

/** Button values are validated with the same known-unit list as URL values. */
export function filterFromButton(value: string, knownUnitIds: readonly string[]): LibraryFilter {
  if (value === 'course:study-skills') return { kind: 'course', course: 'study-skills' };
  if (value === 'course:med-surg-i') return { kind: 'course', course: 'med-surg-i' };
  if (value.startsWith('unit:')) {
    const unitId = value.slice('unit:'.length);
    if (knownUnitIds.includes(unitId)) return { kind: 'unit', unitId };
  }
  return ALL;
}

export function filterButtonValue(filter: LibraryFilter): string {
  if (filter.kind === 'course') return `course:${filter.course}`;
  if (filter.kind === 'unit') return `unit:${filter.unitId}`;
  return 'all';
}

/** Keeps unrelated query parameters and hash, so browser back restores filters. */
export function libraryFilterUrl(currentUrl: string, filter: LibraryFilter): string {
  const url = new URL(currentUrl);
  url.searchParams.delete('course');
  url.searchParams.delete('unit');
  if (filter.kind === 'course') url.searchParams.set('course', filter.course);
  if (filter.kind === 'unit') url.searchParams.set('unit', filter.unitId);
  return url.pathname + url.search + url.hash;
}

/** Mapped lessons belong to Med-Surg I; the legacy study-skills lesson is separate. */
export function showsLesson(unitId: string | undefined, filter: LibraryFilter): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'unit') return unitId === filter.unitId;
  return filter.course === 'med-surg-i' ? Boolean(unitId) : !unitId;
}

/** Keep planned-unit rows in view for all/Med-Surg I, or one selected unit. */
export function showsUnit(unitId: string, filter: LibraryFilter): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'unit') return unitId === filter.unitId;
  return filter.course === 'med-surg-i';
}

export function lessonCountLabel(shown: number, total: number): string {
  return `showing ${shown} ${shown === 1 ? 'lesson' : 'lessons'} of ${total} open ${total === 1 ? 'lesson' : 'lessons'}`;
}

/** Public lesson availability, derived only from the built catalog. */
import type { CatalogLesson } from './catalog';

export interface UnitAvailability {
  hasLessons: boolean;
  open: { href: string; name: string }[];
}

/** A sample or placeholder is open when the catalog builds it. Drafts never enter the catalog. */
export function unitAvailability(lessons: readonly CatalogLesson[], unitId: string): UnitAvailability {
  const open = lessons
    .filter((lesson) => lesson.unitId === unitId)
    .map((lesson) => ({ href: lesson.href, name: lesson.name }));
  return { hasLessons: open.length > 0, open };
}

/** Legacy study-skills samples are not part of the mapped Med-Surg I curriculum. */
export function hasCurriculumLessons(lessons: readonly CatalogLesson[]): boolean {
  return lessons.some((lesson) => Boolean(lesson.unitId));
}

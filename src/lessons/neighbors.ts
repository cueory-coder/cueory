/**
 * Picks adjacent lessons from the visible build catalog, excluding hidden/draft content.
 * Curriculum units never connect across their boundaries.
 */
import type { Catalog, CatalogLesson } from './catalog';

export interface LessonNeighbor {
  href: string;
  name: string;
}
export interface LessonNeighbors {
  previous: LessonNeighbor | undefined;
  next: LessonNeighbor | undefined;
  back: { href: '/learn' | `/learn#unit-${string}`; label: string };
}

export function lessonNeighbors(
  catalog: Pick<Catalog, 'lessons'>,
  current: Pick<CatalogLesson, 'id' | 'unitId'>,
): LessonNeighbors {
  const inUnit = current.unitId ? catalog.lessons.filter((lesson) => lesson.unitId === current.unitId) : [];
  const index = inUnit.findIndex((lesson) => lesson.id === current.id);
  const back: LessonNeighbors['back'] = {
    href: current.unitId && index >= 0 ? `/learn#unit-${current.unitId}` : '/learn',
    label: current.unitId ? 'back to units in the course library' : 'back to course library',
  };

  // A legacy lesson without a curriculum unit has no previous or next lesson.
  if (!current.unitId) return { previous: undefined, next: undefined, back };

  if (index < 0) return { previous: undefined, next: undefined, back };

  const link = (lesson: CatalogLesson | undefined): LessonNeighbor | undefined =>
    lesson ? { href: lesson.href, name: lesson.name } : undefined;
  return {
    previous: index > 0 ? link(inUnit[index - 1]) : undefined,
    next: link(inUnit[index + 1]),
    back,
  };
}

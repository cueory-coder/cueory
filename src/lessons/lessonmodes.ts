/**
 * Study-mode tiles for a single lesson. The catalog lists only built, visible routes.
 * A globally available mode may be unavailable for this lesson.
 */
import type { StudyMode } from '../config/modes';
import { GENERATED_MODES, HUB_ORDER, type CatalogLesson, type ModeId } from './catalog';

export interface LessonModeTile {
  mode: StudyMode;
  href: string | undefined;
  linkLabel: string;
}

const linkLabels = {
  cards: 'practice this lesson with cards',
  learn: "learn this lesson's cards in learn mode",
  matching: "match this lesson's terms and meanings",
  organizer: 'sort ideas into groups with the organizer',
  'fill-in': 'recall the missing word with fill-in',
  'label-it': "uncover a diagram's labels with label it",
  questions: 'practice questions with rationales',
} as const satisfies Record<ModeId, string>;

export function lessonModeTiles(
  lesson: Pick<CatalogLesson, 'href' | 'modes'>,
  modes: readonly StudyMode[],
): LessonModeTile[] {
  return HUB_ORDER.map((id) => {
    const mode = modes.find((candidate) => candidate.id === id);
    if (!mode) throw new Error('Study mode is missing from src/config/modes.ts: ' + id);
    const route = lesson.modes.find((candidate) => candidate.id === id)?.href;
    // Require the exact route the catalog would build for this mode: no cross-lesson,
    // unrelated same-lesson routes, fragments, or query-string variants can become dead links.
    const page = GENERATED_MODES.find((candidate) => candidate.id === id)?.page ?? id;
    const href = route === `${lesson.href}/${page}` ? route : undefined;
    return { mode, href, linkLabel: linkLabels[id] };
  });
}

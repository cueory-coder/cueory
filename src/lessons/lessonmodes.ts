/**
 * Study-mode tiles for a single lesson. The catalog lists only built, visible routes.
 * A globally available mode may be unavailable for this lesson.
 */
import type { StudyMode } from '../config/modes';
import { HUB_ORDER, type CatalogLesson, type ModeId } from './catalog';

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
    // Invalid routes outside the lesson also render as unavailable, never as links.
    const href = route?.startsWith(lesson.href + '/') ? route : undefined;
    return { mode, href, linkLabel: linkLabels[id] };
  });
}

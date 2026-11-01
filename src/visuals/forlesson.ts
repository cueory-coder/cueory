/**
 * Which visuals a lesson page may show (Task 39, D-90).
 * A visual appears only when it is approved AND its drawing is in the registry.
 * Drafts are never surfaced, regardless of lesson id.
 */
import { approvedOnly, type Visual } from './sources';
import { drawings } from './drawings/index';

/**
 * Returns approved visuals that list `lessonId` in their `lessonIds` AND have a
 * drawing in the registry. Preserves the order the source array gives.
 */
export function visualsForLesson(visuals: readonly Visual[], lessonId: string): Visual[] {
  return approvedOnly(visuals).filter(
    (v) => v.lessonIds.includes(lessonId) && Object.prototype.hasOwnProperty.call(drawings, v.id),
  );
}

/**
 * Returns approved visuals that have no drawing in the registry yet.
 * Useful for build warnings and dashboard gaps.
 */
export function missingDrawings(visuals: readonly Visual[]): Visual[] {
  return approvedOnly(visuals).filter(
    (v) => !Object.prototype.hasOwnProperty.call(drawings, v.id),
  );
}

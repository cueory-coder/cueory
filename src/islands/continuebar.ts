/** Pure, validated home-page resume display rules (S8). Never read storage or the clock here. */
import { parseResume, resumeName, resumePosition, RESUME_TTL_MS } from '../scripts/resume';

export interface ContinueBarView {
  href: string;
  title: string;
  accessibleLabel: string;
  current: number;
  total: number;
  expiresAt: number;
}

/**
 * readResume already validates a saved record. Recheck against the supplied time so
 * an expired, corrupted or unknown record cannot leave a misleading home-page link.
 */
export function continueBarView(snapshot: unknown, today: Date): ContinueBarView | null {
  if (!(today instanceof Date) || !Number.isFinite(today.getTime())) return null;
  try {
    const checked = parseResume(JSON.stringify(snapshot), today.getTime());
    if (!checked) return null;
    const title = resumeName(checked);
    if (!title) return null;
    return {
      href: checked.page,
      title,
      accessibleLabel: `continue ${title}, ${resumePosition(checked)}`,
      current: checked.itemIndex + 1,
      total: checked.totalItems,
      expiresAt: checked.savedAt + RESUME_TTL_MS,
    };
  } catch {
    // Cyclic or otherwise un-serializable data is never a valid saved session.
    return null;
  }
}

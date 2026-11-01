/**
 * Exam-date wording (Roadmap Task 4). Pure logic — no clock, no DOM, no network.
 * Every function takes today as an explicit argument so the output is deterministic and
 * fully unit-testable, including across daylight-saving transitions.
 */

const DAY_MS = 86_400_000;

/**
 * Converts a `YYYY-MM-DD` string to a whole-day number (milliseconds / DAY_MS, UTC midnight).
 * Returns `undefined` for anything that is not a real calendar date.
 */
function toDayNumber(date: string): number | undefined {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-')) return undefined;
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return undefined;
  // Round-trip check: rejects February 30, April 31, etc.
  if (new Date(ms).toISOString().slice(0, 10) !== date) return undefined;
  return ms / DAY_MS;
}

// ── daysUntil ─────────────────────────────────────────────────────────────────

/**
 * Whole calendar days from `today` to `exam`. Positive = future, 0 = today, negative = past.
 * Both arguments must be real `YYYY-MM-DD` dates; throws on bad input.
 *
 * Day counting uses UTC midnight arithmetic so time-zone offsets and daylight-saving transitions
 * cannot shift the result.
 */
export function daysUntil(exam: string, today: string): number {
  const examDay = toDayNumber(exam);
  const todayDay = toDayNumber(today);
  if (examDay === undefined) throw new Error('exam must be a real YYYY-MM-DD date');
  if (todayDay === undefined) throw new Error('today must be a real YYYY-MM-DD date');
  return examDay - todayDay;
}

// ── examLine ──────────────────────────────────────────────────────────────────

/**
 * Plain lowercase sentence for the student's exam countdown.
 * Never uses pressure language ("only", "hurry", "!"), scores or predictions.
 */
export function examLine(exam: string, today: string): string {
  const diff = daysUntil(exam, today);
  if (diff < 0) return 'your exam date has passed — you can change it in settings';
  if (diff === 0) return 'your exam is today';
  if (diff === 1) return 'your exam is tomorrow';
  return `your exam is in ${diff} days`;
}

// ── validExamDate ──────────────────────────────────────────────────────────────

/**
 * Validates that `input` is a real calendar date no earlier than `today` and at most
 * 3 years ahead. Returns `null` when valid; a plain lowercase reason string when not.
 */
export function validExamDate(input: string, today: string): string | null {
  const inputDay = toDayNumber(input);
  if (inputDay === undefined) return 'enter a date in the format yyyy-mm-dd';

  const todayDay = toDayNumber(today);
  if (todayDay === undefined) throw new Error('today must be a real YYYY-MM-DD date');

  if (inputDay < todayDay) return 'the date must be today or in the future';

  // 3 years ahead: same month and day, year + 3. If that date doesn't exist
  // (e.g. Feb 29 in a non-leap year) fall back to the 28th.
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  let maxDate = `${y + 3}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (toDayNumber(maxDate) === undefined) {
    // Day overflows the month in the target year — step back to the last valid day.
    maxDate = `${y + 3}-${String(m).padStart(2, '0')}-28`;
  }
  const maxDay = toDayNumber(maxDate)!;

  if (inputDay > maxDay) return 'the date must be within 3 years';

  return null;
}

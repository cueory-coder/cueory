/** Shared by the daily games on /play (D-61, D-63). Pure, so it can be unit tested (tests/unit/triage.test.ts). */

/** The date on a share line, in the visitor's own words: "sun 1 nov". */
export function dayLabel(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  return `${weekday} ${date.getDate()} ${month}`;
}

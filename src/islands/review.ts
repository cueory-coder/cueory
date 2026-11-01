/** Calendar-day review rules. No clock, storage, DOM or time-of-day arithmetic. */
export interface Review {
  day: string;
  result: 'knew' | 'missed';
}

export interface ReviewCard {
  id: string;
  /** Oldest first; multiple reviews on the same day are allowed. */
  history: readonly Review[];
}

const DAY = 86_400_000;
const STEPS = [1, 3, 7, 14] as const;

function dayNumber(day: string): number {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000-')) {
    throw new Error('Use a real calendar day written YYYY-MM-DD.');
  }
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) {
    throw new Error('Use a real calendar day written YYYY-MM-DD.');
  }
  return time / DAY;
}

function calendarDay(day: number): string {
  const text = new Date(day * DAY).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('The next review is beyond the supported calendar.');
  return text;
}

function readHistory(history: readonly Review[]): { last: number | undefined; level: number } {
  if (!Array.isArray(history)) throw new Error('Review history must be a list, oldest first.');
  let last: number | undefined;
  let level = 0;
  for (const review of history) {
    if (!review || (review.result !== 'knew' && review.result !== 'missed')) {
      throw new Error('Each review needs a day and a knew or missed result.');
    }
    const day = dayNumber(review.day);
    if (last !== undefined && day < last) throw new Error('Review history must be oldest first.');
    last = day;
    level = review.result === 'missed' ? 0 : Math.min(level + 1, 3);
  }
  return { last, level };
}

/**
 * The last review plus the step for its trailing streak of knew results.
 * Pass the student's local `today` to evaluate whether an exam has passed. Without
 * it, the last review day is the reference day, so two-argument calls stay pure.
 * An active exam can shorten the interval, but never to before tomorrow. A past
 * exam is ignored. An ordinary overdue review keeps its original due day.
 */
export function nextReview(
  history: readonly Review[],
  examDay?: string,
  today?: string,
): string | undefined {
  const { last, level } = readHistory(history);
  const exam = examDay === undefined ? undefined : dayNumber(examDay);
  const reference = today === undefined ? last : dayNumber(today);
  if (last === undefined) return undefined;
  if (reference! < last) throw new Error('Today cannot be before the last review.');
  let due = last + STEPS[level]!;
  if (exam !== undefined && exam >= reference! && due > exam - 1) {
    due = Math.max(exam - 1, reference! + 1);
  }
  return calendarDay(due);
}

/** Due cards, oldest due day first, then by id in deterministic text order. */
export function dueOn(cards: readonly ReviewCard[], today: string, examDay?: string): string[] {
  const now = dayNumber(today);
  const exam = examDay === undefined ? undefined : dayNumber(examDay);
  if (!Array.isArray(cards)) throw new Error('Cards must be a list.');
  const ids = new Set<string>();
  const due: { id: string; day: number }[] = [];
  for (const card of cards) {
    if (!card || typeof card.id !== 'string' || !card.id.trim() || ids.has(card.id)) {
      throw new Error('Each card needs a different, nonempty id.');
    }
    ids.add(card.id);
    const { last } = readHistory(card.history);
    if (last !== undefined && last > now) throw new Error('Today cannot be before the last review.');
    // A due-list lookup must preserve the interval scheduled from the last review.
    // Today's date decides whether the exam is still active; it must not move the
    // minimum interval forward again on every lookup.
    const scheduled = nextReview(card.history, exam !== undefined && exam >= now ? examDay : undefined);
    if (scheduled !== undefined) {
      const day = dayNumber(scheduled);
      if (day <= now) due.push({ id: card.id, day });
    }
  }
  return due.sort((a, b) => a.day - b.day || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((card) => card.id);
}

export function whenInWords(due: string, today: string): string {
  const days = dayNumber(due) - dayNumber(today);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} ago`;
  return `in ${days} days`;
}
